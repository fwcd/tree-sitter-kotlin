'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execFileSync, spawn} = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => digest(fs.readFileSync(file));
const RECEIPT = 'build/node-binding-source.json';
const GENERATION = 'bindings/node/generation.json';
const GENERATED_FILES = ['src/parser.c', 'src/grammar.json', 'src/node-types.json'];
function sourceIdentity(root = ROOT) {
  const files = ['grammar.js', 'binding.gyp', 'package.json', 'bindings/node/index.js',
    'bindings/node/binding.cc', 'bindings/node/build.js', GENERATION];
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
      const file = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(file); else if (entry.isFile()) files.push(file);
      else throw Error(`Unsupported binding source: ${file}`);
    }
  }
  walk('src');
  const dependencies = ['tree-sitter', 'node-addon-api', 'node-gyp-build'].map(name => {
    try {
      const file = require.resolve(name + '/package.json', {paths: [root]});
      return [name, JSON.parse(fs.readFileSync(file, 'utf8')).version, read(file)];
    }
    catch { throw Error(`Node binding dependency ${name} is missing; run npm install in ${root}`); }
  });
  return {hash: digest(JSON.stringify([files.sort().map(file => [file, read(path.join(root, file))]),
    dependencies, process.version, process.platform, process.arch])),
    grammarHash: read(path.join(root, 'grammar.js'))};
}
function receipt(root) {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(root, RECEIPT), 'utf8'));
    return value?.source?.hash && value?.source?.grammarHash && value?.binary?.hash && value?.binary?.path ? value : null;
  } catch { return null; }
}
function binary(root) { return require(require.resolve('node-gyp-build', {paths: [root]})).path(root); }
function fresh(root = ROOT) {
  try { assertGenerated(root); } catch { return false; }
  const stored = receipt(root);
  if (!stored || stored.source.hash !== sourceIdentity(root).hash) return false;
  try { return stored.binary.path === path.relative(root, binary(root)) && stored.binary.hash === read(binary(root)); }
  catch { return false; }
}
function assertFresh(root = ROOT) {
  assertGenerated(root);
  if (!fresh(root)) throw Error(`Native binding is missing, stale or changed: ${root}. ` +
    'Run npm install; after editing grammar.js, run npm run generate first.');
  return receipt(root);
}
function generatorVersion(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies['tree-sitter-cli'];
}
function assertGenerated(root = ROOT) {
  let identity;
  try { identity = JSON.parse(fs.readFileSync(path.join(root, GENERATION), 'utf8')); } catch {}
  if (identity?.schemaVersion !== 1 || identity.generatorVersion !== generatorVersion(root) ||
      identity.grammarHash !== read(path.join(root, 'grammar.js')) ||
      GENERATED_FILES.some(file => !fs.existsSync(path.join(root, file)) || identity.files?.[file] !== read(path.join(root, file))))
    throw Error('Generated parser does not match grammar.js or the pinned generator; run npm run generate, then npm install');
  return identity;
}
function runTool(executable, args, root, label, env = process.env) {
  const started = Date.now(), verbose = process.env.PSI_GATE_VERBOSE === '1';
  console.error(`${label}...`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...args], {cwd: root, env,
      detached: process.platform !== 'win32', stdio: verbose ? ['ignore', 2, 2] : ['ignore', 'pipe', 'pipe']});
    const chunks = []; let size = 0, stopped, force;
    const stop = signal => {
      stopped = signal;
      try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch {}
      force = setTimeout(() => { try { if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
    };
    const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
    process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
    const progress = setInterval(() => console.error(`${label}... ${Math.floor((Date.now() - started) / 1000)}s elapsed`), 10000);
    const timeout = setTimeout(() => stop('SIGTERM'), 180000);
    if (!verbose) for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      chunks.push(chunk); size += chunk.length;
      if (size > 16 * 1024 * 1024 && !stopped) stop('SIGTERM');
    });
    let launchError;
    child.on('error', error => { launchError = error; });
    child.on('close', (code, signal) => {
      clearInterval(progress); clearTimeout(timeout); clearTimeout(force);
      process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
      const output = Buffer.concat(chunks).toString('utf8');
      if (launchError || code !== 0 || stopped) {
        if (!verbose) process.stderr.write(output);
        const error = new Error(`${label} failed (${launchError?.message || signal || stopped || 'exit ' + code})`);
        if (stopped === 'SIGINT') error.exitCode = 130;
        reject(error); return;
      }
      if (!verbose) for (const line of output.split(/\r?\n/))
        if (/\bwarn(?:ing)?\b|deprecated/i.test(line)) process.stderr.write(line + '\n');
      resolve(((Date.now() - started) / 1000).toFixed(1));
    });
  });
}
function generate(root = ROOT) {
  const expected = generatorVersion(root);
  const executable = require.resolve('tree-sitter-cli/cli.js', {paths: [root]});
  const version = execFileSync(process.execPath, [executable, '--version'], {cwd: root, encoding: 'utf8'});
  if (!version.startsWith('tree-sitter ' + expected + ' ')) throw Error('Wrong tree-sitter generator; run npm install');
  const grammarHash = read(path.join(root, 'grammar.js'));
  return runTool(executable, ['generate'], root, `Generating Kotlin parser with tree-sitter ${expected} (usually ~50s)`).then(seconds => {
    if (read(path.join(root, 'grammar.js')) !== grammarHash) throw Error('grammar.js changed during generation; rerun npm run generate');
    const identity = {schemaVersion: 1, generatorVersion: expected, grammarHash,
      files: Object.fromEntries(GENERATED_FILES.map(file => [file, read(path.join(root, file))]))};
    const file = path.join(root, GENERATION), temporary = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(identity, null, 2) + '\n'); fs.renameSync(temporary, file);
    console.error(`Generated parser sources and identity (${seconds}s). Run npm install to refresh the binding.`);
  });
}
function install(root = ROOT) {
  assertGenerated(root);
  if (fresh(root) && !process.env.npm_config_build_from_source) {
    console.error('Native Node binding is current.'); return;
  }
  const source = sourceIdentity(root), executable = require.resolve('node-gyp-build/bin.js', {paths: [root]});
  return runTool(executable, [], root, 'Building current Node binding',
    {...process.env, npm_config_build_from_source: 'true', npm_config_loglevel: process.env.PSI_GATE_VERBOSE === '1' ? 'info' : 'warn'}).then(seconds => {
    if (sourceIdentity(root).hash !== source.hash) throw Error('Binding inputs changed during build; rerun npm install');
    const file = binary(root);
    fs.writeFileSync(path.join(root, RECEIPT), JSON.stringify({source,
      binary: {path: path.relative(root, file), hash: read(file)}}, null, 2) + '\n');
    console.error(`Native Node binding ready (${seconds}s). Check setup with npm run psi-gate -- quick.`);
  });
}
module.exports = {sourceIdentity, assertFresh, fresh, install, generate, assertGenerated, runTool};
if (require.main === module) {
  Promise.resolve().then(() => process.argv.includes('--generate') ? generate() : install())
    .catch(error => {console.error(error.message); process.exitCode = error.exitCode || 1;});
}
