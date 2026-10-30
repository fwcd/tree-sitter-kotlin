/**
 * Differential run: tree-sitter against the live Kotlin PSI oracle on any
 * corpus, for one or more grammar checkouts at once.
 *
 * Each input gets a verdict per grammar:
 *
 * - `A`  tree-sitter has an ERROR or MISSING node where PSI is clean;
 * - `B`  tree-sitter is clean where PSI has a `PsiErrorElement`;
 * - `C`  both are clean but the normalized structures differ;
 * - `ok`, `both-error`, or `oracle-failure` / `harness-error`.
 *
 * A, B and C carry a bucket key that groups findings with one cause. The PSI
 * oracle runs once per shard; every grammar is compared against the same PSI.
 * Shards are written as `shards/NNNNN.jsonl` and skipped when present, so an
 * interrupted run resumes. Dumps are deleted once a shard is done.
 *
 * Usage:
 *   node tools/cross-validation/diff-run.js --corpus NAME --root DIR
 *     [--list FILE] [--exclude REGEX] [--grammar LABEL=DIR]... [--shard-size N]
 *     [--jobs N] [--out DIR] [--report-only]
 *
 * Without --list, the inputs are the `.kt`/`.kts` files git tracks under --root
 * (or every such file when --root is not a git work tree).
 *
 * @module cross-validation/diff-run
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, fork } = require('child_process');
const { parseTreeSitter } = require('./parser-ts');
const { parsePsi } = require('./parser-psi');
const { normalizeTs, normalizePsi } = require('./normalizer');
const { compareTrees, Status } = require('./comparator');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'local', 'psi-diff');

// ---------------------------------------------------------------------------
// PSI dump layout: offsets, composite types and error elements
// ---------------------------------------------------------------------------

const LEAF_RE = /^(PsiElement|PsiWhiteSpace|PsiComment)(?:\(([^)]*)\))?\('(.*)'\)$/;

function unescapeLeaf(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escape) => {
    if (escape[0] === 'u' && escape.length === 5) return String.fromCharCode(parseInt(escape.slice(1), 16));
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[escape] ?? escape;
  });
}

/**
 * Recover source offsets from a PSI dump by concatenating its leaf texts.
 *
 * @param {string} dump - `DebugUtil.psiToString(file, true, false)` output.
 * @returns {{ composites: Array<{ type: string, start: number, end: number, depth: number }>,
 *   errors: Array<{ offset: number, parent: string, message: string }> }}
 *   Composites in document order; `end` is exclusive.
 */
function psiLayout(dump) {
  const composites = [];
  const errors = [];
  const open = []; // { indent, entry }
  let offset = 0;
  const close = indent => {
    while (open.length && open[open.length - 1].indent >= indent) open.pop().entry.end = offset;
  };
  for (const line of dump.split('\n').slice(1)) {
    const indent = line.length - line.trimStart().length;
    const node = line.trim();
    if (!node || node === '<empty list>') continue;
    close(indent);
    const leaf = LEAF_RE.exec(node);
    if (leaf) {
      offset += unescapeLeaf(leaf[3]).length;
      continue;
    }
    const parent = open.length ? open[open.length - 1].entry.type : 'FILE';
    if (node.startsWith('PsiErrorElement')) {
      errors.push({ offset, parent, message: node.replace(/^PsiErrorElement:?/, '') });
      const entry = { type: 'PsiErrorElement', start: offset, end: offset, depth: open.length };
      open.push({ indent, entry });
      continue;
    }
    const entry = { type: node, start: offset, end: offset, depth: open.length };
    composites.push(entry);
    open.push({ indent, entry });
  }
  close(-1);
  return { composites, errors };
}

/** Innermost PSI composite that starts at or covers `offset`. */
function psiTypeAt(layout, offset) {
  let best = null;
  for (const entry of layout.composites) {
    if (entry.start > offset) break;
    if (entry.end > offset || (entry.start === offset && entry.end === offset)) {
      if (!best || entry.depth >= best.depth) best = entry;
    }
  }
  return best ? best.type : 'FILE';
}

// ---------------------------------------------------------------------------
// tree-sitter error location
// ---------------------------------------------------------------------------

function leafLabel(node) {
  let leaf = node;
  while (leaf.childCount > 0) leaf = leaf.child(0);
  if (leaf === node && node.type === 'ERROR') return '∅';
  // A keyword inside an ERROR node may carry another token's type; its text
  // is what a reader recognises.
  return leaf.isNamed ? leaf.type : JSON.stringify(leaf.text);
}

/**
 * First ERROR or MISSING node in document order, descending only into
 * subtrees that report an error.
 *
 * @returns {{ node: object, missing: boolean }|null}
 */
function firstTsError(root) {
  let node = root;
  for (;;) {
    let next = null;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.isMissing) return { node: child, missing: true };
      if (child.type === 'ERROR') return { node: child, missing: false };
      if (child.hasError) { next = child; break; }
    }
    if (!next) return node === root ? null : { node, missing: false };
    node = next;
  }
}

function namedAncestorType(node) {
  let current = node;
  while (current && !current.isNamed) current = current.parent;
  return current ? current.type : 'source_file';
}

// ---------------------------------------------------------------------------
// Verdict and bucket keys
// ---------------------------------------------------------------------------

function trimPath(diffPath, keep = 3) {
  const parts = diffPath.split(' > ');
  return (parts.length > keep ? '… > ' : '') + parts.slice(-keep).join(' > ');
}

/**
 * First structural divergence of two normalized trees in document order.
 *
 * Unlike the comparator's difference list this names the first child that
 * differs, not the child counts, so one cause yields one key whatever the
 * size of the file around it.
 *
 * @returns {{ path: string, psi: string, ts: string }|null}
 */
function firstDivergence(ts, psi, at = ts.name) {
  if (ts.name !== psi.name) return { path: at, psi: psi.name, ts: ts.name };
  const shared = Math.min(ts.children.length, psi.children.length);
  for (let i = 0; i < shared; i++) {
    const tsChild = ts.children[i], psiChild = psi.children[i];
    if (tsChild.name !== psiChild.name) return { path: at, psi: psiChild.name, ts: tsChild.name };
    const inner = firstDivergence(tsChild, psiChild, `${at} > ${tsChild.name}`);
    if (inner) return inner;
  }
  if (ts.children.length !== psi.children.length) {
    return { path: at, psi: psi.children[shared]?.name ?? '(none)', ts: ts.children[shared]?.name ?? '(none)' };
  }
  return null;
}

/**
 * Classify one input for one grammar.
 *
 * @param {{ text: string, tree: object, psi: { psiErrors?: number, failure?: string }, dump: string|null }} input
 * @returns {{ verdict: string, key?: string, line?: number }}
 */
function classify({ text, tree, psi, dump }) {
  if (psi.failure) return { verdict: 'oracle-failure', key: psi.failure.slice(0, 120) };
  const tsError = tree.rootNode.hasError;
  const psiError = psi.psiErrors > 0;
  if (tsError && psiError) return { verdict: 'both-error' };
  const layout = dump ? psiLayout(dump) : null;
  if (tsError) {
    const found = firstTsError(tree.rootNode);
    if (!found) return { verdict: 'A', key: 'A hidden error (rootNode.hasError only)', line: 1 };
    const { node, missing } = found;
    const parent = namedAncestorType(node.parent);
    const what = missing ? `MISSING ${node.isNamed ? node.type : JSON.stringify(node.type)}` : `ERROR ${leafLabel(node)}`;
    const psiType = layout ? psiTypeAt(layout, node.startIndex) : '?';
    return { verdict: 'A', key: `A ${parent} > ${what} | psi ${psiType}`, line: node.startPosition.row + 1 };
  }
  if (psiError) {
    const error = layout && layout.errors[0];
    const offset = psi.firstError ? psi.firstError.offset : error ? error.offset : 0;
    const tsNode = tree.rootNode.descendantForIndex(Math.min(offset, Math.max(text.length - 1, 0)));
    const message = error ? error.message : psi.firstError ? psi.firstError.message : '?';
    return {
      verdict: 'B',
      key: `B psi ${error ? error.parent : '?'}: ${message} | ts ${namedAncestorType(tsNode)}`,
      line: psi.firstError ? psi.firstError.line : 1,
    };
  }
  const tsNorm = normalizeTs(parseTreeSitter(tree.rootNode.toString()));
  const psiNorm = normalizePsi(parsePsi(dump));
  const result = compareTrees(tsNorm, psiNorm);
  if (result.status === Status.MATCH) return { verdict: 'ok' };
  const first = firstDivergence(tsNorm, psiNorm) || { path: result.differences[0].path, psi: '?', ts: '?' };
  return { verdict: 'C', key: `C @ ${trimPath(first.path)}: psi ${first.psi} / ts ${first.ts}` };
}

// ---------------------------------------------------------------------------
// Grammars
// ---------------------------------------------------------------------------

/**
 * Load parsers for several grammar checkouts into one process. The runtime is
 * this checkout's `tree-sitter`; each language comes from its own checkout.
 *
 * @param {Array<{ label: string, root: string }>} grammars
 */
function loadParsers(grammars) {
  const Parser = require(require.resolve('tree-sitter', { paths: [REPO_ROOT] }));
  return grammars.map(({ label, root }) => {
    const language = require(path.join(root, 'bindings', 'node'));
    const parser = new Parser();
    parser.setLanguage(language);
    return { label, root, parser };
  });
}

function parseText(parser, text) {
  const bufferSize = Math.max(32 * 1024, Buffer.byteLength(text, 'utf8') * 2 + 1024);
  return parser.parse(text, undefined, { bufferSize });
}

/** True when `root` is the top of a git work tree, not a directory inside one. */
function isGitTop(root) {
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return fs.realpathSync(top) === fs.realpathSync(root);
  } catch {
    return false;
  }
}

/**
 * Commit of a corpus or grammar root: its git HEAD, or the SHA recorded in a
 * `.source-revision` file for an exported tree (`git archive`).
 */
function gitHead(root) {
  if (isGitTop(root)) {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  }
  const recorded = path.join(root, '.source-revision');
  return fs.existsSync(recorded) ? fs.readFileSync(recorded, 'utf8').trim() : null;
}

// ---------------------------------------------------------------------------
// Corpus and shards
// ---------------------------------------------------------------------------

function listInputs({ root, list, exclude }) {
  let files;
  if (list) {
    files = fs.readFileSync(list, 'utf8').split('\n').filter(Boolean);
  } else if (isGitTop(root)) {
    files = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.kt', '*.kts'],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  } else {
    files = require('../vendor-fixtures').listFilesRecursive(root).filter(file => /\.kts?$/.test(file));
  }
  if (exclude) {
    const re = new RegExp(exclude);
    files = files.filter(file => !re.test(file));
  }
  return files.filter(file => /\.kts?$/.test(file) && fs.existsSync(path.join(root, file))).sort();
}

async function runShard({ files, root, shardFile, parsers }) {
  const { runOracleAsync } = require('../psi-oracle/oracle');
  const dumps = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-diff-'));
  try {
    const index = await runOracleAsync(files, { root, out: dumps });
    const lines = [];
    files.forEach((file, i) => {
      const psi = index[i];
      if (!psi || psi.path !== path.relative(path.resolve(root), path.resolve(root, file))) {
        throw new Error(`oracle index misaligned at ${file}`);
      }
      let text = fs.readFileSync(path.join(root, file), 'utf8');
      if (psi.crlf) text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const dump = psi.failure ? null : fs.readFileSync(path.join(dumps, psi.dump), 'utf8');
      const record = { path: file, bytes: Buffer.byteLength(text), psiErrors: psi.psiErrors ?? null, results: {} };
      for (const { label, parser } of parsers) {
        try {
          record.results[label] = classify({ text, tree: parseText(parser, text), psi, dump });
        } catch (error) {
          record.results[label] = { verdict: 'harness-error', key: String(error.message).slice(0, 160) };
        }
      }
      lines.push(JSON.stringify(record));
    });
    fs.writeFileSync(shardFile + '.tmp', lines.join('\n') + '\n');
    fs.renameSync(shardFile + '.tmp', shardFile);
  } finally {
    fs.rmSync(dumps, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function readShards(outDir) {
  const dir = path.join(outDir, 'shards');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith('.jsonl')).sort()
    .flatMap(name => fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)));
}

/**
 * Group records into buckets per grammar label.
 *
 * @returns {{ totals: object, buckets: Array<{ key: string, verdict: string, counts: object, examples: object }> }}
 */
function summarize(records, labels) {
  const totals = Object.fromEntries(labels.map(label => [label, {}]));
  const buckets = new Map();
  for (const record of records) {
    for (const label of labels) {
      const result = record.results[label];
      if (!result) continue;
      totals[label][result.verdict] = (totals[label][result.verdict] || 0) + 1;
      if (!result.key || result.verdict === 'both-error') continue;
      if (!buckets.has(result.key)) {
        buckets.set(result.key, { key: result.key, verdict: result.verdict,
          counts: Object.fromEntries(labels.map(l => [l, 0])), examples: Object.fromEntries(labels.map(l => [l, []])) });
      }
      const bucket = buckets.get(result.key);
      bucket.counts[label]++;
      bucket.examples[label].push({ path: record.path, line: result.line, bytes: record.bytes });
    }
  }
  for (const bucket of buckets.values()) {
    for (const label of labels) {
      bucket.examples[label] = bucket.examples[label].sort((a, b) => a.bytes - b.bytes || (a.path < b.path ? -1 : 1)).slice(0, 5);
    }
  }
  const order = { A: 0, B: 1, C: 2 };
  const sorted = [...buckets.values()].sort((a, b) => (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3)
    || Math.max(...Object.values(b.counts)) - Math.max(...Object.values(a.counts)) || (a.key < b.key ? -1 : 1));
  return { totals, buckets: sorted };
}

function renderReport({ corpus, meta, summary, labels }) {
  const out = [`# PSI differential: ${corpus}`, ''];
  out.push(`Corpus root: \`${meta.root}\`${meta.rootHead ? ` at \`${meta.rootHead}\`` : ''}; ${meta.files} files.`);
  for (const grammar of meta.grammars) out.push(`Grammar \`${grammar.label}\`: \`${grammar.root}\`${grammar.head ? ` at \`${grammar.head}\`` : ''}.`);
  out.push('PSI: kotlin-compiler-embeddable 2.4.21.', '', '| verdict | ' + labels.join(' | ') + ' |', '|---|' + labels.map(() => '---:').join('|') + '|');
  const verdicts = ['ok', 'A', 'B', 'C', 'both-error', 'oracle-failure', 'harness-error'];
  for (const verdict of verdicts) out.push(`| ${verdict} | ${labels.map(label => summary.totals[label][verdict] || 0).join(' | ')} |`);
  out.push('', '## Buckets', '', '| key | ' + labels.join(' | ') + ' | smallest example |', '|---|' + labels.map(() => '---:').join('|') + '|---|');
  for (const bucket of summary.buckets) {
    const example = labels.map(label => bucket.examples[label][0]).find(Boolean);
    out.push(`| \`${bucket.key.replace(/\|/g, '\\|').replace(/`/g, 'ˋ')}\` | ${labels.map(label => bucket.counts[label]).join(' | ')} | ${example ? `\`${example.path}${example.line ? `:${example.line}` : ''}\`` : ''} |`);
  }
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { grammars: [], shardSize: 2000, jobs: Math.max(1, Math.min(6, os.cpus().length - 2)), reportOnly: false };
  const args = [...argv];
  while (args.length) {
    const arg = args.shift();
    if (arg === '--corpus') options.corpus = args.shift();
    else if (arg === '--root') options.root = path.resolve(args.shift());
    else if (arg === '--list') options.list = path.resolve(args.shift());
    else if (arg === '--exclude') options.exclude = args.shift();
    else if (arg === '--grammar') {
      const [label, root] = args.shift().split('=');
      options.grammars.push({ label, root: path.resolve(root) });
    } else if (arg === '--shard-size') options.shardSize = Number(args.shift());
    else if (arg === '--jobs') options.jobs = Number(args.shift());
    else if (arg === '--out') options.out = path.resolve(args.shift());
    else if (arg === '--report-only') options.reportOnly = true;
    else if (arg === '--worker') options.worker = args.shift();
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.corpus || !options.root) throw new Error('--corpus and --root are required');
  if (!options.grammars.length) options.grammars.push({ label: 'head', root: REPO_ROOT });
  options.out = options.out || path.join(DEFAULT_OUT, options.corpus);
  return options;
}

async function worker(options) {
  const [k, n] = options.worker.split('/').map(Number);
  const parsers = loadParsers(options.grammars);
  const files = JSON.parse(fs.readFileSync(path.join(options.out, 'files.json'), 'utf8'));
  const shardCount = Math.ceil(files.length / options.shardSize);
  for (let shard = k; shard < shardCount; shard += n) {
    const shardFile = path.join(options.out, 'shards', `${String(shard).padStart(5, '0')}.jsonl`);
    if (fs.existsSync(shardFile)) continue;
    await runShard({ files: files.slice(shard * options.shardSize, (shard + 1) * options.shardSize),
      root: options.root, shardFile, parsers });
    process.send?.({ shard });
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.worker) return worker(options);
  fs.mkdirSync(path.join(options.out, 'shards'), { recursive: true });
  const labels = options.grammars.map(grammar => grammar.label);
  const metaFile = path.join(options.out, 'meta.json');
  let meta;
  if (fs.existsSync(metaFile)) {
    meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (JSON.stringify(meta.grammars.map(g => [g.label, g.root])) !== JSON.stringify(options.grammars.map(g => [g.label, g.root]))) {
      throw new Error(`${options.out} holds a run with other grammars; remove it or pick another --out`);
    }
  } else {
    const files = listInputs(options);
    fs.writeFileSync(path.join(options.out, 'files.json'), JSON.stringify(files));
    meta = { corpus: options.corpus, root: options.root, rootHead: gitHead(options.root), files: files.length,
      grammars: options.grammars.map(grammar => ({ ...grammar, head: gitHead(grammar.root) })), shardSize: options.shardSize };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
  }
  options.shardSize = meta.shardSize;
  if (!options.reportOnly) {
    const total = Math.ceil(meta.files / options.shardSize);
    let done = fs.readdirSync(path.join(options.out, 'shards')).filter(name => name.endsWith('.jsonl')).length;
    const jobs = Math.max(1, Math.min(options.jobs, total - done));
    const forwarded = [...argv, '--shard-size', String(options.shardSize), '--out', options.out];
    await Promise.all(Array.from({ length: jobs }, (_, k) => new Promise((resolve, reject) => {
      const child = fork(__filename, [...forwarded, '--worker', `${k}/${jobs}`], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      child.on('message', () => { done++; process.stderr.write(`\r${options.corpus}: ${done}/${total} shards`); });
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`worker ${k} exited ${code}`)));
    })));
    process.stderr.write('\n');
  }
  const summary = summarize(readShards(options.out), labels);
  fs.writeFileSync(path.join(options.out, 'buckets.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(options.out, 'report.md'), renderReport({ corpus: options.corpus, meta, summary, labels }));
  console.log(JSON.stringify({ corpus: options.corpus, out: options.out, totals: summary.totals, buckets: summary.buckets.length }));
}

module.exports = { psiLayout, psiTypeAt, firstTsError, firstDivergence, classify, summarize, renderReport, readShards,
  loadParsers, parseText, listInputs, trimPath };

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
