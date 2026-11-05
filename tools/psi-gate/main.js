#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runIfMain } = require('../cli');
const {
  run,
  resetOutput,
  confined,
  canonical,
  inside,
  positive,
  javaExecutable,
  sha256,
} = require('../safety');
const state = require('./state');
const diff = require('../cross-validation/diff-run');
const { assertHome, withHome } = require('./home');
const { resolveBase } = require('./base');
const { unmarked, inspectRepository, snapshotRepository, annotateReport } = require('./repository');
const ROOT = path.resolve(__dirname, '../..');
const KOTLIN = '9180ce6a7a7d3627f88b424717583f28ddca052d';
const HELP = `Usage: npm run psi-gate -- quick|full|update-expected [options] or repo FOLDER [options]
  quick                  Generated snippets against the upstream merge-base
  repo FOLDER            Check tracked Kotlin inputs in a clean local Git checkout
  full                   Also check corpus assertions, Kotlin and single-site mutations
  update-expected        Record base observations, not count allowances
  --base REV             Explicit local base (default: merge-base with upstream)
  --upstream REMOTE|URL  Override upstream, or PSI_GATE_UPSTREAM
  --upstream-branch NAME Override branch, or PSI_GATE_UPSTREAM_BRANCH
  --corpora LIST          Comma-separated snippets,corpus,mutations,kotlin,idea
  --expected FILE        Snapshot to compare, or destination for update-expected
  --home DIR             Owned cache/report directory (default local/psi-gate)
  --jobs N               1..4 oracle workers (default 2)
  --parse-timeout-ms N   Native per-file timeout (default 10000, max 60000)
  --timeout-ms N         Oracle timeout (default 120000)
  --fresh                Discard marked run results, never source directories
  --strict               Require conformance; known base differences also fail
The gate installs its separate LOCKED runtime; project dependencies are not changed.
Requires Node 22+, JDK 17+, git, curl, tar, Python and native build tools.
IDEA inputs require IDEA_ROOT and an exact 40-character IDEA_REV.
`;
function argumentsOf(argv) {
  const args = [...argv],
    command = args.shift() || 'quick';
  if (!['quick', 'full', 'update-expected', 'repo'].includes(command))
    throw new Error(`Unknown job ${command}; use --help`);
  const folder = command === 'repo' ? args.shift() : null;
  if (command === 'repo' && (!folder || folder.startsWith('--'))) throw new Error('repo requires a local checkout folder');
  const options = {
    command,
    repoRoot: folder ? path.resolve(folder) : null,
    jobs: 2,
    timeoutMs: 120000,
    parseTimeoutMs: 10000,
    home: path.join(ROOT, 'local/psi-gate'),
    corpora: command === 'repo' ? ['repo'] : command === 'full' ? ['snippets', 'corpus', 'mutations', 'kotlin'] : ['snippets'],
  };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--fresh' || flag === '--strict') {
      options[flag.slice(2)] = true;
      continue;
    }
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--base') options.base = value;
    else if (flag === '--upstream') options.upstream = value;
    else if (flag === '--upstream-branch') options.upstreamBranch = value;
    else if (flag === '--corpora') options.corpora = value.split(',');
    else if (flag === '--expected') options.expected = path.resolve(value);
    else if (flag === '--home') options.home = path.resolve(value);
    else if (flag === '--jobs') options.jobs = positive(value, flag, 4);
    else if (flag === '--parse-timeout-ms') options.parseTimeoutMs = positive(value, flag, 60000);
    else if (flag === '--timeout-ms') options.timeoutMs = positive(value, flag);
    else throw new Error(`Unknown option ${flag}; use --help`);
  }
  if (
    !options.corpora.length ||
    new Set(options.corpora).size !== options.corpora.length ||
    options.corpora.some((c) => !['snippets', 'corpus', 'mutations', 'kotlin', 'idea', ...(command === 'repo' ? ['repo'] : [])].includes(c))
  )
    throw new Error('Choose distinct supported corpora (see --help)');
  if (command === 'repo' && (options.corpora.length !== 1 || options.corpora[0] !== 'repo'))
    throw new Error('repo checks its folder; --corpora cannot replace it');
  if (options.command === 'update-expected' && !options.expected)
    throw new Error('update-expected requires --expected FILE');
  if (options.expected && options.command !== 'update-expected')
    throw new Error(
      'The launcher measures a base; --expected cannot override it. Use the direct psi-diff runner with --expect and no base.',
    );
  if (options.expected && options.corpora.length !== 1)
    throw new Error('Use one --corpora NAME with an expected snapshot');
  if (options.repoRoot && (inside(canonical(options.home), canonical(options.repoRoot)) ||
      inside(canonical(options.repoRoot), canonical(options.home))))
    throw new Error('--home and the input repository must be separate');
  if (inside(canonical(options.home), canonical(ROOT)))
    throw new Error('--home must not contain the source checkout');
  return options;
}
function prerequisites(options) {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Install Node.js 22+ before running the PSI gate');
  if (
    options.corpora.includes('idea') &&
    (!process.env.IDEA_ROOT || !/^[0-9a-f]{40}$/i.test(process.env.IDEA_REV || ''))
  ) {
    throw new Error('Set IDEA_ROOT to an IntelliJ checkout and IDEA_REV to its full pinned commit');
  }
  javaExecutable();
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const compiler = process.env.CXX || (process.platform === 'win32' ? 'cl' : 'c++');
  const probes = [
    {
      command: 'git',
      args: ['--version'],
      pattern: /git version (\d+)\.(\d+)/,
      minimum: [2, 20],
      hint: 'Install git 2.20+',
    },
    {
      command: 'curl',
      args: ['--version'],
      pattern: /curl (\d+)\.(\d+)/,
      minimum: [7, 20],
      hint: 'Install curl 7.20+',
    },
    { command: 'tar', args: ['--version'], hint: 'Install tar' },
    {
      command: python,
      args: ['--version'],
      pattern: /Python (\d+)\.(\d+)/,
      minimum: [3, 8],
      hint: 'Install Python 3.8+',
    },
    {
      command: compiler,
      args: process.platform === 'win32' ? ['/?'] : ['--version'],
      pattern:
        process.platform === 'win32'
          ? /Compiler Version (\d+)\.(\d+)/i
          : /(?:clang version|(?:gcc|g\+\+|c\+\+).*?)\s+(\d+)\.(\d+)/i,
      minimum: process.platform === 'win32' ? [19, 20] : [8, 0],
      hint: 'Install a C++17 compiler (GCC/Clang 8+, MSVC 19.20+)',
    },
  ];
  if (process.platform !== 'win32')
    probes.push({ command: 'make', args: ['--version'], hint: 'Install make' });
  for (const probe of probes) {
    const result = spawnSync(probe.command, probe.args, { timeout: 10000, encoding: 'utf8' });
    if (result.error || result.signal || result.status !== 0) {
      throw new Error(
        `${probe.hint}; ${probe.command} probe failed (${result.status ?? result.error?.code})`,
      );
    }
    if (probe.pattern) {
      const version = probe.pattern.exec((result.stdout || '') + (result.stderr || ''));
      if (
        !version ||
        Number(version[1]) < probe.minimum[0] ||
        (Number(version[1]) === probe.minimum[0] && Number(version[2]) < probe.minimum[1])
      ) {
        throw new Error(`${probe.hint}; ${probe.command} is too old or its version is unsupported`);
      }
    }
  }
}
function runtime() {
  const lock = fs.readFileSync(path.join(__dirname, 'package-lock.json'));
  const receipt = path.join(__dirname, 'node_modules/.psi-lock');
  if (!fs.existsSync(receipt) || fs.readFileSync(receipt, 'utf8') !== sha256(lock)) {
    console.log(
      'Installing the separate pinned PSI runtime (project node_modules is untouched)...',
    );
    // npm's CLI is supplied when this entry point is invoked through npm run.
    const npm = process.env.npm_execpath;
    if (!npm)
      throw new Error('Run this tool with npm run psi-gate so its pinned runtime can be installed');
    run(process.execPath, [npm, 'ci', '--prefix', __dirname, '--no-audit', '--no-fund'], {
      timeout: 300000,
    });
    fs.writeFileSync(receipt, sha256(lock));
  }
  const version = require(path.join(__dirname, 'node_modules/tree-sitter/package.json')).version;
  if (version !== '0.25.1')
    throw new Error('PSI runtime is corrupt; remove tools/psi-gate/node_modules and rerun');
}
function revision(base, options = {}) {
  return resolveBase({ ...options, base }, { cwd: ROOT }).commit;
}

function grammar(root, home, revision) {
  const residue = path.join(home, 'grammars/tools');
  if (fs.existsSync(residue)) {
    // Retain old generated residue for inspection, outside the grammar-key namespace.
    fs.renameSync(residue, path.join(home, 'legacy-build-residue-' + Date.now()));
  }
  const inputs = revision
    ? sha256(
        run('git', ['archive', revision, 'src', 'bindings/node', 'binding.gyp', 'package.json'], {
          cwd: ROOT,
          encoding: null,
        }),
      )
    : state.digest(sourceFiles(root).map((f) => [f, state.hashFile(path.join(root, f))]));
  const key = state.digest([
    'local-addon-build-v2',
    inputs,
    state.hashFile(path.join(__dirname, 'package-lock.json')),
    process.version,
    process.platform,
    process.arch,
    ['CC', 'CXX', 'CFLAGS', 'CXXFLAGS', 'CPPFLAGS', 'LDFLAGS'].map((k) => [
      k,
      process.env[k] || '',
    ]),
  ]);
  const target = path.join(home, 'grammars', key),
    receipt = path.join(target, 'built.json');
  const binding = path.join(target, 'build/Release/tree_sitter_kotlin_binding.node');
  if (fs.existsSync(receipt)) {
    if (JSON.parse(fs.readFileSync(receipt, 'utf8')).sha256 !== state.hashFile(binding))
      throw new Error('Cached grammar binary is corrupt; use a new --home');
    return target;
  }
  console.log(`Building ${revision ? 'base ' + revision.slice(0, 10) : 'working grammar'}...`);
  resetOutput(target);
  if (revision) {
    const archive = run(
      'git',
      ['archive', revision, 'src', 'bindings/node', 'binding.gyp', 'package.json'],
      { cwd: ROOT, encoding: null },
    );
    run('tar', ['-x', '-m', '-C', target], { input: archive });
    fs.writeFileSync(path.join(target, '.source-revision'), revision + '\n');
  } else {
    for (const file of sourceFiles(root)) {
      const destination = confined(target, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(confined(root, file), destination);
    }
    fs.writeFileSync(
      path.join(target, '.source-revision'),
      run('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).trim() + '\n',
    );
  }
  // Gyp resolves a symlinked addon dependency outside build/, leaving stamp files in
  // sibling grammar directories. A small local copy keeps all build products owned.
  fs.mkdirSync(path.join(target, 'node_modules'), { recursive: true });
  for (const name of ['node-addon-api', 'node-gyp-build'])
    fs.cpSync(path.join(__dirname, 'node_modules', name), path.join(target, 'node_modules', name), { recursive: true });
  run(
    process.execPath,
    [path.join(__dirname, 'node_modules/node-gyp/bin/node-gyp.js'), 'rebuild'],
    { cwd: target, timeout: 180000 },
  );
  fs.writeFileSync(receipt, JSON.stringify({ sha256: state.hashFile(binding), source: inputs }));
  return target;
}
function sourceFiles(root) {
  const files = [];
  for (const dir of ['src', 'bindings/node']) {
    for (const file of require('../vendor-fixtures').listFilesRecursive(path.join(root, dir)))
      files.push(path.join(dir, file));
  }
  files.push('binding.gyp', 'package.json');
  return files.sort();
}
function checkoutKotlin(home) {
  const root = path.join(home, 'kotlin');
  if (!fs.existsSync(path.join(root, '.git'))) {
    console.log(
      'Fetching pinned Kotlin inputs (full checkout, only for selected repository/mutation corpora)...',
    );
    resetOutput(root);
    run('git', ['init', '-q', root]);
    run('git', [
      '-C',
      root,
      'fetch',
      '--depth=1',
      'https://github.com/JetBrains/kotlin.git',
      KOTLIN,
    ]);
    run('git', ['-C', root, 'checkout', '-q', 'FETCH_HEAD']);
  }
  if (
    run('git', ['-C', root, 'rev-parse', 'HEAD']).trim() !== KOTLIN ||
    run('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no']).trim()
  )
    throw new Error('Kotlin input cache is not clean at its pinned revision; choose a new --home');
  return root;
}

function corpusPlan(corpus, options, kotlin, baseRevision) {
  let root = path.join(options.home, 'corpora', corpus),
    extra = [],
    provenance = { corpus };
  if (corpus === 'repo') {
    const snapshot = snapshotRepository(options.repoRoot, options.home);
    return snapshot;
  } else if (corpus === 'snippets') {
    run(process.execPath, [path.join(ROOT, 'tools/cross-validation/mutations.js'), '--out', root]);
    provenance.generator = state.hashFile(path.join(ROOT, 'tools/cross-validation/mutations.js'));
  } else if (corpus === 'corpus') {
    run(process.execPath, [
      path.join(__dirname, 'corpus.js'),
      path.join(ROOT, 'test/corpus'),
      root,
    ]);
    extra.push('--base-cases', baseCorpus(options.home, baseRevision));
  } else if (corpus === 'mutations') {
    run(process.execPath, [
      path.join(__dirname, 'mutate.js'),
      path.join(kotlin, 'compiler/psi/psi-impl/testData/psi'),
      root,
    ]);
    extra.push('--origins', path.join(root, 'origins.json'));
    provenance = {
      corpus,
      revision: KOTLIN,
      seed: 'psi-gate',
      perFile: 2,
      generator: state.hashFile(path.join(__dirname, 'mutate.js')),
    };
  } else {
    root = corpus === 'kotlin' ? kotlin : path.resolve(process.env.IDEA_ROOT);
    const commit = corpus === 'kotlin' ? KOTLIN : process.env.IDEA_REV;
    if (
      run('git', ['-C', root, 'rev-parse', 'HEAD']).trim() !== commit ||
      run('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no']).trim()
    )
      throw new Error(`${corpus} checkout differs from its pinned revision`);
    const list = path.join(options.home, corpus + '.list');
    fs.writeFileSync(list, unmarked(root).join('\n') + '\n');
    extra.push('--list', list);
    provenance = null;
  }
  if (provenance) fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(provenance));
  return { root, extra };
}

/** Failed runs leave the last successful report intact. */
function publishReport(home, corpus, result, report) {
  const destination = path.join(home, corpus + (result.exitCode ? '.failed.md' : '.md'));
  fs.copyFileSync(report, destination);
  console.log(
    (result.exitCode ? 'Failed report: ' : 'Latest report: ') +
      (inside(ROOT, path.resolve(destination))
        ? path.relative(ROOT, destination)
        : path.resolve(destination)),
  );
  return destination;
}

async function runJob(options) {
  runtime();
  await require('../psi-oracle/fetch').fetchAll();
  const baseRevision = revision(options.base, options);
  const head = grammar(ROOT, options.home),
    base = grammar(ROOT, options.home, baseRevision);
  let kotlin;
  if (options.corpora.some((c) => c === 'kotlin' || c === 'mutations'))
    kotlin = checkoutKotlin(options.home);
  let failed = false;
  for (const corpus of options.corpora) {
    const { root, extra, repository } = corpusPlan(corpus, options, kotlin, baseRevision);
    const out = path.join(options.home, 'runs', corpus);
    const args = [
      '--corpus',
      corpus,
      '--root',
      root,
      '--grammar',
      'head=' + head,
      '--grammar',
      'base=' + base,
      '--runtime',
      __dirname,
      '--out',
      out,
      '--jobs',
      String(options.jobs),
      '--timeout-ms',
      String(options.timeoutMs),
      '--parse-timeout-ms',
      String(options.parseTimeoutMs),
      ...extra,
    ];
    if (options.fresh) args.push('--fresh');
    if (options.strict) args.push('--strict');
    if (options.expected)
      args.push(
        options.command === 'update-expected' ? '--update-expected' : '--expect',
        options.expected,
      );
    const parsed = diff.parseArgs(args);
    const content = state.digest(state.identity(parsed, diff.listInputs(parsed)));
    args[args.indexOf('--out') + 1] = path.join(out, content);
    const latest = path.join(options.home, corpus + '.md');
    let result;
    try {
      result = await diff.main(args);
    } catch (error) {
      console.error(`${corpus}: execution failed; previous report preserved at ${latest}`);
      throw error;
    }
    if (repository) annotateReport(path.join(out, content), repository);
    publishReport(options.home, corpus, result, path.join(out, content, 'report.md'));
    if (result.exitCode) failed = true;
  }
  return { exitCode: failed ? 1 : 0 };
}
function baseCorpus(home, revision) {
  const directory = path.join(home, 'base-corpus', revision);
  const cases = path.join(directory, 'inputs', 'cases.json');
  const receipt = path.join(directory, 'claims.sha256');
  if (fs.existsSync(cases)) {
    if (!fs.existsSync(receipt) || fs.readFileSync(receipt, 'utf8') !== state.hashFile(cases))
      throw new Error('Base corpus cache is corrupt; choose a new --home');
    return cases;
  }
  resetOutput(directory);
  const source = path.join(directory, 'source');
  fs.mkdirSync(source);
  const archive = run('git', ['archive', revision, 'test/corpus'], { cwd: ROOT, encoding: null });
  run('tar', ['-x', '-C', source], { input: archive });
  require('./corpus').main([path.join(source, 'test/corpus'), path.join(directory, 'inputs')]);
  fs.writeFileSync(receipt, state.hashFile(cases));
  return cases;
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return { exitCode: 0 };
  }
  const options = argumentsOf(argv);
  if (options.command === 'repo') inspectRepository(options.repoRoot);
  assertHome(options.home);
  prerequisites(options);
  return withHome(options.home, () => runJob(options));
}

/** Prepare the pinned runtime and an immutable grammar for other PSI tools. */
async function prepareGrammar({ home, base, upstream, upstreamBranch }) {
  assertHome(home);
  return withHome(home, async () => {
    prerequisites({ corpora: [] });
    runtime();
    await require('../psi-oracle/fetch').fetchAll();
    const ref = revision(base, { upstream, upstreamBranch });
    return { grammar: grammar(ROOT, home, ref), runtime: __dirname, revision: ref };
  });
}

module.exports = { prepareGrammar, main, argumentsOf, prerequisites, unmarked, baseCorpus, publishReport };
runIfMain(module, main);
