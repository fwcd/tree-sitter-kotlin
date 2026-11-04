#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runIfMain } = require('../cli');
const { run, resetOutput, confined, canonical, inside, positive, javaExecutable, sha256 } = require('../safety');
const state = require('./state');
const diff = require('../cross-validation/diff-run');
const ROOT = path.resolve(__dirname, '../..');
const KOTLIN = '9180ce6a7a7d3627f88b424717583f28ddca052d';
const HELP = `Usage: npm run psi-gate -- quick|full|update-expected [options]
  quick                  Generated snippets against current upstream main
  full                   Also check corpus assertions, Kotlin and single-site mutations
  update-expected        Record base observations, not count allowances
  --base REV             Local base revision (default: fetch current fwcd main)
  --corpora LIST          Comma-separated snippets,corpus,mutations,kotlin,idea
  --expected FILE        Snapshot to compare, or destination for update-expected
  --home DIR             Owned cache/report directory (default local/psi-gate)
  --jobs N               1..4 oracle workers (default 2)
  --timeout-ms N         Oracle timeout (default 120000)
  --fresh                Discard marked run results, never source directories
  --strict               Require conformance; known base differences also fail
The gate installs its separate LOCKED runtime; project dependencies are not changed.
Requires Node 22+, JDK 17+, git, curl, tar, Python and native build tools.
IDEA inputs require IDEA_ROOT and an exact 40-character IDEA_REV.
`;
function argumentsOf(argv) {
  const args = [...argv], command = args.shift() || 'quick';
  if (!['quick', 'full', 'update-expected'].includes(command)) throw new Error(`Unknown job ${command}; use --help`);
  const options = { command, jobs: 2, timeoutMs: 120000, home: path.join(ROOT, 'local/psi-gate'),
    corpora: command === 'full' ? ['snippets', 'corpus', 'mutations', 'kotlin'] : ['snippets'] };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--fresh' || flag === '--strict') { options[flag.slice(2)] = true; continue; }
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--base') options.base = value;
    else if (flag === '--corpora') options.corpora = value.split(',');
    else if (flag === '--expected') options.expected = path.resolve(value);
    else if (flag === '--home') options.home = path.resolve(value);
    else if (flag === '--jobs') options.jobs = positive(value, flag, 4);
    else if (flag === '--timeout-ms') options.timeoutMs = positive(value, flag);
    else throw new Error(`Unknown option ${flag}; use --help`);
  }
  if (!options.corpora.length || new Set(options.corpora).size !== options.corpora.length
      || options.corpora.some(c => !['snippets','corpus','mutations','kotlin','idea'].includes(c))) throw new Error('Choose distinct supported corpora (see --help)');
  if (options.command === 'update-expected' && !options.expected) throw new Error('update-expected requires --expected FILE');
  if (options.expected && options.corpora.length !== 1) throw new Error('Use one --corpora NAME with an expected snapshot');
  if (inside(canonical(options.home), canonical(ROOT))) throw new Error('--home must not contain the source checkout');
  return options;
}
function prerequisites(options) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node.js 22+ before running the PSI gate');
  if (options.corpora.includes('idea') && (!process.env.IDEA_ROOT || !/^[0-9a-f]{40}$/i.test(process.env.IDEA_REV || ''))) {
    throw new Error('Set IDEA_ROOT to an IntelliJ checkout and IDEA_REV to its full pinned commit');
  }
  javaExecutable();
  const required = [['git',['--version'],'Install git'], ['curl',['--version'],'Install curl for proxy-aware HTTPS downloads'],
    ['tar',['--version'],'Install tar'], [process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),['--version'],'Install Python 3 for node-gyp'],
    [process.env.CXX || (process.platform === 'win32' ? 'cl' : 'c++'),['--version'],'Install native C/C++ build tools (MSVC on Windows)']];
  if (process.platform !== 'win32') required.push(['make',['--version'],'Install make']);
  for (const [command, args, hint] of required) {
    const result = spawnSync(command, args, { timeout: 10000, stdio: 'ignore' });
    if (result.error || result.signal) throw new Error(`${hint}; ${command} is unavailable`);
  }

}
function runtime() {
  const lock = fs.readFileSync(path.join(__dirname, 'package-lock.json'));
  const receipt = path.join(__dirname, 'node_modules/.psi-lock');
  if (!fs.existsSync(receipt) || fs.readFileSync(receipt, 'utf8') !== sha256(lock)) {
    console.log('Installing the separate pinned PSI runtime (project node_modules is untouched)...');
    // npm's CLI is supplied when this entry point is invoked through npm run.
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('Run this tool with npm run psi-gate so its pinned runtime can be installed');
    run(process.execPath, [npm, 'ci', '--prefix', __dirname, '--no-audit', '--no-fund'], { timeout: 300000 });
    fs.writeFileSync(receipt, sha256(lock));
  }
  const version = require(path.join(__dirname, 'node_modules/tree-sitter/package.json')).version;
  if (version !== '0.25.1') throw new Error('PSI runtime is corrupt; remove tools/psi-gate/node_modules and rerun');
}
function revision(base) {
  if (!base) {
    console.log('Fetching current upstream main...');
    run('git', ['fetch', '--depth=1', 'https://github.com/fwcd/tree-sitter-kotlin.git', 'main:refs/remotes/psi-upstream/main'], { cwd: ROOT });
    base = 'refs/remotes/psi-upstream/main';
  }
  return run('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: ROOT }).trim();
}
function grammar(root, home, revision) {
  const inputs = revision ? sha256(run('git', ['archive', revision, 'src', 'bindings/node', 'binding.gyp', 'package.json'], { cwd: ROOT, encoding: null }))
    : state.digest(sourceFiles(root).map(f => [f, state.hashFile(path.join(root, f))]));
  const key = state.digest([inputs, state.hashFile(path.join(__dirname, 'package-lock.json')), process.version, process.platform, process.arch,
    ['CC','CXX','CFLAGS','CXXFLAGS','CPPFLAGS','LDFLAGS'].map(k => [k,process.env[k] || ''])]);
  const target = path.join(home, 'grammars', key), receipt = path.join(target, 'built.json');
  const binding = path.join(target, 'build/Release/tree_sitter_kotlin_binding.node');
  if (fs.existsSync(receipt)) {
    if (JSON.parse(fs.readFileSync(receipt, 'utf8')).sha256 !== state.hashFile(binding)) throw new Error('Cached grammar binary is corrupt; use a new --home');
    return target;
  }
  console.log(`Building ${revision ? 'base ' + revision.slice(0, 10) : 'working grammar'}...`);
  resetOutput(target);
  if (revision) {
    const archive = run('git', ['archive', revision, 'src', 'bindings/node', 'binding.gyp', 'package.json'], { cwd: ROOT, encoding: null });
    run('tar', ['-x', '-m', '-C', target], { input: archive });
    fs.writeFileSync(path.join(target, '.source-revision'), revision + '\n');
  } else {
    for (const file of sourceFiles(root)) {
      const destination = confined(target, file); fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(confined(root, file), destination);
    }
    fs.writeFileSync(path.join(target, '.source-revision'), run('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).trim() + '\n');
  }
  fs.symlinkSync(path.join(__dirname, 'node_modules'), path.join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  run(process.execPath, [path.join(__dirname, 'node_modules/node-gyp/bin/node-gyp.js'), 'rebuild'], { cwd: target, timeout: 180000 });
  fs.writeFileSync(receipt, JSON.stringify({ sha256: state.hashFile(binding), source: inputs }));
  return target;
}
function sourceFiles(root) {
  const files = [];
  for (const dir of ['src', 'bindings/node']) {
    for (const file of require('../vendor-fixtures').listFilesRecursive(path.join(root, dir))) files.push(path.join(dir, file));
  }
  files.push('binding.gyp', 'package.json');
  return files.sort();
}
function checkoutKotlin(home) {
  const root = path.join(home, 'kotlin');
  if (!fs.existsSync(path.join(root, '.git'))) {
    console.log('Fetching pinned Kotlin inputs (full checkout, only for selected repository/mutation corpora)...');
    resetOutput(root);
    run('git', ['init', '-q', root]);
    run('git', ['-C',root,'fetch','--depth=1','https://github.com/JetBrains/kotlin.git',KOTLIN]);
    run('git', ['-C',root,'checkout','-q','FETCH_HEAD']);
  }
  if (run('git',['-C',root,'rev-parse','HEAD']).trim() !== KOTLIN
      || run('git',['-C',root,'status','--porcelain','--untracked-files=no']).trim()) throw new Error('Kotlin input cache is not clean at its pinned revision; choose a new --home');
  return root;
}
function unmarked(root) {
  const files = run('git', ['-C',root,'ls-files','-z','--','*.kt','*.kts']).split('\0').filter(Boolean);
  const markup = /<(?:\/?(?:caret\w*|before|after|change|selection|error|warning|weak_warning|info|lineMarker|EOLError|EOLWarning|spot|symbolName|fold|inlineHint|hint|ref|cursor|block|html|inject|rainbow|TYPO|text_attr|caretMarker|expr)\b|rename\b)|<!\w*(?:[:(][^>]*)?!>|<!>/;
  return files.filter(file => { const data = fs.readFileSync(confined(root,file),'utf8'); return !markup.test(data) && !/^\/\/ FILE: \S+\.(?!kts?\s*$)\w+\s*$/m.test(data); }).sort();
}
async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return; }
  const options = argumentsOf(argv);
  prerequisites(options); // Fail before any downloads, installs or source builds.
  runtime();
  await require('../psi-oracle/fetch').fetchAll();
  if (!fs.existsSync(options.home)) resetOutput(options.home);
  else if (!fs.existsSync(path.join(options.home,'.psi-generated'))) throw new Error('--home is not an owned PSI cache; choose a new directory');
  const baseRevision = revision(options.base);
  const head = grammar(ROOT, options.home), base = grammar(ROOT, options.home, baseRevision);
  let kotlin;
  if (options.corpora.some(c => c === 'kotlin' || c === 'mutations')) kotlin = checkoutKotlin(options.home);
  let failed = false;
  for (const corpus of options.corpora) {
    let root = path.join(options.home, 'corpora', corpus), extra = [], provenance = { corpus };
    if (corpus === 'snippets') {
      run(process.execPath, [path.join(ROOT,'tools/cross-validation/mutations.js'),'--out',root]);
      provenance.generator = state.hashFile(path.join(ROOT,'tools/cross-validation/mutations.js'));
    } else if (corpus === 'corpus') {
      run(process.execPath, [path.join(__dirname,'corpus.js'),path.join(ROOT,'test/corpus'),root]);
    } else if (corpus === 'mutations') {
      run(process.execPath, [path.join(__dirname,'mutate.js'),path.join(kotlin,'compiler/psi/psi-impl/testData/psi'),root]);
      extra.push('--origins',path.join(root,'origins.json'));
      provenance = { corpus, revision: KOTLIN, seed: 'psi-gate', perFile: 2, generator: state.hashFile(path.join(__dirname,'mutate.js')) };
    } else {
      root = corpus === 'kotlin' ? kotlin : path.resolve(process.env.IDEA_ROOT);
      const commit = corpus === 'kotlin' ? KOTLIN : process.env.IDEA_REV;
      if (run('git',['-C',root,'rev-parse','HEAD']).trim() !== commit || run('git',['-C',root,'status','--porcelain','--untracked-files=no']).trim()) throw new Error(`${corpus} checkout differs from its pinned revision`);
      const list = path.join(options.home, corpus + '.list'); fs.writeFileSync(list, unmarked(root).join('\n') + '\n');
      extra.push('--list',list); provenance = null;
    }
    if (provenance) fs.writeFileSync(path.join(root,'provenance.json'),JSON.stringify(provenance));
    const out = path.join(options.home, 'runs', corpus);
    const args = ['--corpus',corpus,'--root',root,'--grammar','head='+head,'--grammar','base='+base,'--runtime',__dirname,
      '--out',out,'--jobs',String(options.jobs),'--timeout-ms',String(options.timeoutMs),...extra];
    if (options.fresh) args.push('--fresh');
    if (options.strict) args.push('--strict');
    if (options.expected) args.push(options.command === 'update-expected' ? '--update-expected' : '--expect',options.expected);
    const parsed = diff.parseArgs(args);
    const content = state.digest(state.identity(parsed, diff.listInputs(parsed)));
    args[args.indexOf('--out') + 1] = path.join(out, content);
    const latest = path.join(options.home, corpus + '.md');
    fs.writeFileSync(latest, `# ${corpus}: RUNNING\n\nContent: ${content}\n`);
    const codeBefore = process.exitCode;
    process.exitCode = 0;
    try { await diff.main(args); } catch (error) {
      fs.writeFileSync(latest, `# ${corpus}: FAIL\n\nExecution did not complete: ${error.message}\n`); throw error;
    }
    fs.copyFileSync(path.join(out, content, 'report.md'), latest);
    console.log('Latest report: ' + path.relative(ROOT, latest));
    if (process.exitCode) failed = true;
    process.exitCode = codeBefore;
  }
  process.exitCode = failed ? 1 : 0;
}
module.exports = { main, argumentsOf, prerequisites, unmarked };
runIfMain(module, main);
