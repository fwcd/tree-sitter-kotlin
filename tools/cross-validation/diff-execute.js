'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { runOracleAsync } = require('../psi-oracle/oracle');
const { compareInput } = require('./diff-classify');
const { confined, sha256 } = require('../safety');
const { listFilesRecursive } = require('../vendor-fixtures');
const REPO_ROOT = path.resolve(__dirname, '../..');

function loadParsers(grammars, runtime = REPO_ROOT, parseTimeoutMs = 10000) {
  const Parser = require(require.resolve('tree-sitter', { paths: [runtime] }));
  return grammars.map(({ label, root }) => {
    const language = require(path.join(root, 'bindings', 'node'));
    const parser = new Parser();
    parser.setLanguage(language);
    parser.setTimeoutMicros(parseTimeoutMs * 1000);
    return { label, root, parser };
  });
}

function parseText(parser, text) {
  const bufferSize = Math.max(32 * 1024, Buffer.byteLength(text, 'utf8') * 2 + 1024);
  const started = process.hrtime.bigint();
  const tree = parser.parse(text, undefined, { bufferSize });
  const limit = parser.getTimeoutMicros();
  if (!tree || (limit && Number(process.hrtime.bigint() - started) / 1000 >= limit)) {
    parser.reset();
    throw new Error('Native parser timed out; increase --parse-timeout-ms for large inputs');
  }
  return tree;
}

/** True when `root` is the top of a git work tree, not a directory inside one. */
function isGitTop(root) {
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
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
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
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
    files = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.kt', '*.kts'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } else {
    files = listFilesRecursive(root).filter((file) => /\.kts?$/.test(file));
  }
  if (exclude) {
    const re = new RegExp(exclude);
    files = files.filter((file) => !re.test(file));
  }
  if (new Set(files).size !== files.length) throw new Error('Input list contains duplicates');
  for (const file of files) {
    if (!/\.kts?$/.test(file) || !fs.existsSync(confined(root, file)))
      throw new Error(`Missing or unsupported input: ${file}`);
  }
  return files.sort();
}

async function runShard({ files, root, shardFile, parsers, claims, timeoutMs }) {
  const dumps = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-diff-'));
  try {
    const index = await runOracleAsync(files, { root, out: dumps, timeoutMs });
    const records = [];
    const texts = [];
    files.forEach((file, i) => {
      const psi = index[i];
      if (!psi || psi.path !== path.relative(path.resolve(root), path.resolve(root, file))) {
        throw new Error(`oracle index misaligned at ${file}`);
      }
      const bytes = fs.readFileSync(confined(root, file));
      let text = bytes.toString('utf8');
      if (psi.crlf) text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      texts.push(text);
      const dump = psi.failure ? null : fs.readFileSync(path.join(dumps, psi.dump), 'utf8');
      const record = {
        path: file,
        bytes: bytes.length,
        sha256: sha256(bytes),
        psiErrors: psi.psiErrors ?? null,
        ...(claims ? { claim: { ...claims[file], inputSha256: sha256(bytes) } } : {}),
        results: {},
      };
      for (const { label, parser } of parsers) {
        try {
          const tree = parseText(parser, text);
          record.results[label] = {
            ...compareInput({ text, tree, psi, dump }),
            hasError: tree.rootNode.hasError,
          };
        } catch (error) {
          record.results[label] = {
            verdict: 'harness-error',
            key: String(error.message).slice(0, 160),
          };
        }
      }
      records.push(record);
    });
    await rereadAsScripts({ records, texts, parsers, timeoutMs });
    fs.writeFileSync(
      shardFile + '.tmp',
      records.map((record) => JSON.stringify(record)).join('\n') + '\n',
    );
    fs.renameSync(shardFile + '.tmp', shardFile);
    fs.writeFileSync(shardFile + '.sha256', sha256(fs.readFileSync(shardFile)) + '\n');
  } finally {
    fs.rmSync(dumps, { recursive: true, force: true });
  }
}

/**
 * The grammar reads a `.kt` file as a script too, so a statement at the top level is no error
 * for it ("Expecting a top level declaration", a destructuring declaration at the top level). A
 * `.kt` input with a `B` or `B-prefix` verdict is parsed again as `.kts`; when that verdict is
 * `ok`, the input is `B-script`, a known difference;
 * otherwise the script verdict replaces the first, so an error or a structure behind the
 * top-level statement still counts (`'a` + line break + `b'` is clean PSI as a script, and its
 * structure differs).
 */
const SCRIPT_REREAD = new Set(['B', 'B-prefix']);

async function rereadAsScripts({ records, texts, parsers, timeoutMs }) {
  const picked = records
    .map((record, i) => i)
    .filter(
      (i) =>
        records[i].path.endsWith('.kt') &&
        Object.values(records[i].results).some((result) => SCRIPT_REREAD.has(result.verdict)),
    );
  if (!picked.length) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-script-'));
  try {
    const names = picked.map((i) => `${i}.kts`);
    picked.forEach((i, k) => fs.writeFileSync(path.join(dir, names[k]), texts[i]));
    const index = await runOracleAsync(names, { root: dir, out: path.join(dir, 'out'), timeoutMs });
    picked.forEach((i, k) => {
      const psi = index[k];
      if (!psi || psi.path !== names[k])
        throw new Error('Script oracle index is incomplete or misaligned');
      records[i].scriptPsiErrors = psi.psiErrors ?? null;
      const dump = psi.failure ? null : fs.readFileSync(path.join(dir, 'out', psi.dump), 'utf8');
      for (const { label, parser } of parsers) {
        const result = records[i].results[label];
        if (!SCRIPT_REREAD.has(result.verdict)) continue;
        const again = compareInput({ text: texts[i], tree: parseText(parser, texts[i]), psi, dump });
        records[i].results[label] = {
          ...again,
          ...(again.verdict === 'ok' ? { verdict: 'B-script' } : {}),
          hasError: result.hasError,
        };
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { loadParsers, parseText, gitHead, listInputs, runShard };
