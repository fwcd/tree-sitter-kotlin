'use strict';

// Coordinate a complete run; comparison, execution and reports have separate modules.
const fs = require('fs');
const path = require('path');
const { fork, execFileSync } = require('child_process');
const { runIfMain } = require('../cli');
const state = require('../psi-gate/state');
const { resetOutput, positive } = require('../safety');
const comparison = require('./diff-classify');
const execution = require('./diff-execute');
const reports = require('./diff-report');
const { loadParsers, listInputs, runShard, gitHead } = execution;
const { summarize, renderReport } = reports;
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'local/psi-diff');

const HELP = `Usage: node tools/cross-validation/diff-run.js --corpus NAME --root DIR [options]
  --grammar LABEL=DIR   Built grammar; label base enables per-input regression checking
  --runtime DIR         Pinned tree-sitter package root (default: this repository)
  --out DIR             Run/report directory (default: local/psi-diff/NAME)
  --list FILE           Exact nonempty relative input list
  --base-cases FILE     Exact corpus claims extracted from the base revision
  --cases FILE          Corpus assertions (automatically reads ROOT/cases.json)
  --origins FILE        Mutant-to-original map
  --expect FILE         Reviewed per-input snapshot (count registries are unsupported)
  --update-expected FILE Write a snapshot after a complete, successful execution
  --fresh               Replace this tool's marked run directory
  --strict              Conformance: fail every PSI difference, even if unchanged in base
  --report-only         Report an already COMPLETE, content-matching run
  --jobs N              Workers, 1..4 (default 2)
  --shard-size N        Inputs per JVM, 1..10000 (default 2000)
  --parse-timeout-ms N  Native parse budget per file, default 10000
  --timeout-ms N        Oracle timeout, default 120000
Exit 0: no new per-input differences (or no differences in conformance mode).
Exit 1: differences, failed assertions, incomplete execution, or invalid setup.
`;
function parseArgs(argv) {
  const options = {
    grammars: [],
    shardSize: 2000,
    jobs: 2,
    timeoutMs: 120000,
    parseTimeoutMs: 10000,
  };
  const args = [...argv];
  const value = (flag) => {
    const v = args.shift();
    if (!v || v.startsWith('--')) throw new Error(`${flag} requires a value`);
    return v;
  };
  while (args.length) {
    const arg = args.shift();
    if (['--fresh', '--strict', '--report-only'].includes(arg))
      options[{ '--fresh': 'fresh', '--strict': 'strict', '--report-only': 'reportOnly' }[arg]] =
        true;
    else if (arg === '--corpus') options.corpus = value(arg);
    else if (arg === '--exclude') options.exclude = value(arg);
    else if (arg === '--worker') options.worker = value(arg);
    else if (arg === '--grammar') {
      const input = value(arg),
        split = input.indexOf('=');
      if (split < 1 || split === input.length - 1) throw new Error('--grammar needs LABEL=DIR');
      options.grammars.push({
        label: input.slice(0, split),
        root: path.resolve(input.slice(split + 1)),
      });
    } else if (['--jobs', '--shard-size', '--timeout-ms', '--parse-timeout-ms'].includes(arg)) {
      const key = {
        '--jobs': 'jobs',
        '--shard-size': 'shardSize',
        '--timeout-ms': 'timeoutMs',
        '--parse-timeout-ms': 'parseTimeoutMs',
      }[arg];
      options[key] = positive(
        value(arg),
        arg,
        arg === '--jobs' ? 4 : arg === '--shard-size' ? 10000 : 3600000,
      );
    } else if (
      [
        '--root',
        '--list',
        '--out',
        '--origins',
        '--expect',
        '--runtime',
        '--cases',
        '--base-cases',
        '--update-expected',
      ].includes(arg)
    ) {
      options[
        arg === '--update-expected'
          ? 'updateExpected'
          : arg === '--base-cases'
            ? 'baseCases'
            : arg.slice(2)
      ] = path.resolve(value(arg));
    } else throw new Error(`Unknown argument ${arg}; use --help`);
  }
  if (!options.corpus || !/^[a-zA-Z0-9_-]+$/.test(options.corpus) || !options.root)
    throw new Error('--corpus NAME and --root DIR are required (use --help)');
  if (!options.grammars.length) options.grammars.push({ label: 'head', root: REPO_ROOT });
  if (new Set(options.grammars.map((g) => g.label)).size !== options.grammars.length)
    throw new Error('Grammar labels must be unique');
  options.runtime = options.runtime || REPO_ROOT;
  options.out = options.out || path.join(DEFAULT_OUT, options.corpus);
  options.cases =
    options.cases ||
    (fs.existsSync(path.join(options.root, 'cases.json'))
      ? path.join(options.root, 'cases.json')
      : null);
  return options;
}
async function worker(options) {
  const [k, n] = options.worker.split('/').map(Number);
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || k >= n || n > 4)
    throw new Error('Invalid worker assignment');
  const parsers = loadParsers(options.grammars, options.runtime, options.parseTimeoutMs);
  const meta = JSON.parse(fs.readFileSync(path.join(options.out, 'meta.json'), 'utf8'));
  const claims = options.cases ? JSON.parse(fs.readFileSync(options.cases, 'utf8')) : null;
  for (let shard = k; shard < Math.ceil(meta.files / options.shardSize); shard += n) {
    const shardFile = path.join(options.out, 'shards', `${String(shard).padStart(5, '0')}.jsonl`);
    const sources = meta.identity.sources.slice(
      shard * options.shardSize,
      (shard + 1) * options.shardSize,
    );
    if (fs.existsSync(shardFile)) {
      state.validateShard(
        shardFile,
        sources,
        parsers.map((p) => p.label),
      );
      continue;
    }
    await runShard({
      files: sources.map((s) => s.path),
      root: options.root,
      shardFile,
      parsers,
      claims,
      timeoutMs: options.timeoutMs,
    });
    process.send?.({ shard });
  }
}
async function main(argv, reportContext = null) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return;
  }
  const options = parseArgs(argv);
  if (options.worker) return worker(options);
  const files = listInputs(options),
    current = state.identity(options, files);
  state.checkOutput(options.out, options.root, files);
  if (options.cases) {
    const claims = JSON.parse(fs.readFileSync(options.cases, 'utf8'));
    if (
      JSON.stringify(Object.keys(claims).sort()) !== JSON.stringify(files) ||
      Object.values(claims).some((c) => typeof c.error !== 'boolean' || !c.name)
    )
      throw new Error('Corpus assertion inventory is incomplete or invalid');
  }
  if (options.fresh || !fs.existsSync(path.join(options.out, '.psi-generated')))
    resetOutput(options.out);
  fs.mkdirSync(path.join(options.out, 'shards'), { recursive: true });
  const metaFile = path.join(options.out, 'meta.json');
  let meta;
  if (fs.existsSync(metaFile)) {
    meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (state.digest(meta.identity) !== state.digest(current))
      throw new Error(
        'Cached run is stale: inputs, grammar, runtime or tools changed. Use --fresh or another --out.',
      );
  } else {
    meta = {
      corpus: options.corpus,
      root: options.root,
      rootHead: gitHead(options.root),
      files: files.length,
      grammars: options.grammars.map((g) => ({ ...g, head: gitHead(g.root) })),
      identity: current,
      options: Object.fromEntries(
        [
          'corpus', 'root', 'list', 'exclude', 'origins', 'cases', 'baseCases',
          'parseTimeoutMs', 'shardSize', 'grammars', 'runtime',
        ].map((key) => [key, options[key]]),
      ),
      runtime: options.runtime,
    };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
  }
  if (!options.reportOnly) {
    const jobs = Math.min(options.jobs, Math.ceil(files.length / options.shardSize));
    const children = new Set();
    const stop = (child) => {
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else
          execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            timeout: 5000,
            stdio: 'ignore',
          });
      } catch {
        child.kill('SIGKILL');
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: jobs },
          (_, k) =>
            new Promise((resolve, reject) => {
              const child = fork(
                __filename,
                [...argv.filter((a) => a !== '--fresh'), '--worker', `${k}/${jobs}`],
                {
                  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
                  detached: process.platform !== 'win32',
                },
              );
              children.add(child);
              let timer;
              const deadline = () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                  stop(child);
                  reject(new Error(`Worker ${k} timed out; execution failed`));
                }, options.timeoutMs + 5000);
              };
              deadline();
              child.on('error', (error) => {
                clearTimeout(timer);
                children.delete(child);
                reject(error);
              });
              child.on('message', ({ shard }) => {
                deadline();
                process.stderr.write(`${options.corpus}: shard ${shard + 1} complete\n`);
              });
              child.on('exit', (code) => {
                clearTimeout(timer);
                children.delete(child);
                code === 0
                  ? resolve()
                  : reject(new Error(`Worker ${k} failed (${code}); run did not complete`));
              });
            }),
        ),
      );
    } catch (error) {
      children.forEach(stop);
      throw error;
    }
  }
  if (state.digest(current) !== state.digest(state.identity(options, listInputs(options))))
    throw new Error('Inputs or grammar changed during execution; refusing results');
  const records = state.complete(options.out, current),
    labels = options.grammars.map((g) => g.label);
  const candidates = labels.filter((label) => label !== 'base');
  if (!candidates.length) throw new Error('At least one non-base candidate is required');
  const label = candidates[0];
  const expected = options.expect ? state.loadExpected(options.expect, current.context) : null;
  const baseClaims = options.baseCases
    ? JSON.parse(fs.readFileSync(options.baseCases, 'utf8'))
    : null;
  const results = Object.fromEntries(
    candidates.map((candidate) => [
      candidate,
      state.gate(records, candidate, {
        base: labels.includes('base') ? 'base' : null,
        expected,
        conformance: options.strict,
        baseClaims,
        reference: Boolean(options.updateExpected),
      }),
    ]),
  );
  const unique = (values) => [
    ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
  ];
  const triaged = {
    failures: unique(Object.values(results).flatMap((result) => result.failures)),
    existing: Object.values(results).flatMap((result) => result.existing),
    existingClaims: unique(Object.values(results).flatMap((result) => result.existingClaims)),
    candidates: results,
    mode: options.updateExpected
      ? 'reference snapshot'
      : options.strict || (!labels.includes('base') && !expected)
        ? 'conformance'
        : 'per-input regression',
  };
  if (reportContext) {
    meta.reportContext = reportContext;
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
  }
  const context = { ...meta.reportContext, corpus: options.corpus };
  if (options.exclude) {
    const included = new Set(files);
    context.excluded = [...new Set([
      ...(context.excluded || []),
      ...listInputs({ ...options, exclude: null }).filter(file => !included.has(file)),
    ])];
  }
  const summary = summarize(
    records,
    labels,
    options.origins ? JSON.parse(fs.readFileSync(options.origins, 'utf8')) : null,
    context,
  );
  fs.writeFileSync(path.join(options.out, 'conformance.json'), JSON.stringify({
    ...summary.conformance,
    inputHash: current.context.inputs,
    toolsHash: current.context.tools,
    grammars: meta.grammars.map((grammar, i) => ({
      ...grammar, contentHash: state.digest(current.grammars[i].files),
    })),
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(options.out, 'buckets.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(
    path.join(options.out, 'report.md'),
    renderReport({ corpus: options.corpus, meta, summary, labels, triaged }),
  );
  fs.writeFileSync(path.join(options.out, 'gate.json'), JSON.stringify(triaged, null, 2) + '\n');
  if (options.updateExpected) {
    if (fs.existsSync(options.updateExpected)) {
      const old = JSON.parse(fs.readFileSync(options.updateExpected, 'utf8'));
      state.loadExpected(options.updateExpected, old.context);
    }
    const use = labels.includes('base') ? 'base' : label;
    const snapshot = state.snapshot(
      current,
      records,
      use,
      meta.grammars.find((g) => g.label === use),
    );
    fs.mkdirSync(path.dirname(options.updateExpected), { recursive: true });
    fs.writeFileSync(options.updateExpected + '.tmp', JSON.stringify(snapshot, null, 2) + '\n');
    fs.renameSync(options.updateExpected + '.tmp', options.updateExpected);
  }
  for (const line of require('./conformance').headlines(summary.conformance)) console.log(line);
  console.log(
    `${options.corpus}: ${triaged.failures.length ? 'FAIL' : 'PASS'} (${triaged.mode}); ` +
      `${files.length} inputs, ${triaged.failures.length} failures, ${triaged.existing.length} unchanged differences. ` +
      `Report: ${path.join(options.out, 'report.md')}`,
  );
  for (const failure of triaged.failures.slice(0, 10))
    console.error(`${failure.kind}: ${failure.path}: ${failure.message}`);
  if (triaged.failures.length > 10)
    console.error(
      `Showing 10 of ${triaged.failures.length} failures; see gate.json for all failures`,
    );
  return { exitCode: triaged.failures.length ? 1 : 0, ...triaged, out: options.out };
}
module.exports = { ...comparison, ...execution, ...reports, parseArgs, main };
runIfMain(module, main);
