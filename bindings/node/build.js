'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execFileSync} = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => digest(fs.readFileSync(file));
const RECEIPT = 'build/node-binding-source.json';
function sourceIdentity(root = ROOT) {
  const files = ['grammar.js', 'binding.gyp', 'package.json', 'bindings/node/index.js',
    'bindings/node/binding.cc', 'bindings/node/build.js'];
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
      const file = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(file); else if (entry.isFile()) files.push(file);
      else throw Error(`Unsupported binding source: ${file}`);
    }
  }
  walk('src');
  const dependencies = ['tree-sitter', 'node-addon-api', 'node-gyp-build'].map(name => {
    try { return [name, require(require.resolve(name + '/package.json', {paths: [root]})).version]; }
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
  const stored = receipt(root);
  if (!stored || stored.source.hash !== sourceIdentity(root).hash) return false;
  try { return stored.binary.path === path.relative(root, binary(root)) && stored.binary.hash === read(binary(root)); }
  catch { return false; }
}
function assertFresh(root = ROOT) {
  if (!fresh(root)) throw Error(`Native binding is missing, stale or changed: ${root}. ` +
    'Run npm install; after editing grammar.js, run npm run generate first.');
}
function generated(root = ROOT) {
  const file = path.join(root, 'build/generated-grammar.json');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({grammarHash: read(path.join(root, 'grammar.js'))}) + '\n');
}
function install(root = ROOT) {
  if (fresh(root) && !process.env.npm_config_build_from_source) return;
  const source = sourceIdentity(root), previous = receipt(root);
  let grammarChanged = previous && previous.source.grammarHash !== source.grammarHash;
  if (!previous) {
    try { grammarChanged = digest(execFileSync('git', ['show', 'HEAD:grammar.js'], {cwd: root, stdio: ['ignore', 'pipe', 'ignore']}))
      !== source.grammarHash; } catch {}
  }
  if (grammarChanged) {
    let generation;
    try { generation = JSON.parse(fs.readFileSync(path.join(root, 'build/generated-grammar.json'), 'utf8')); } catch {}
    if (generation?.grammarHash !== source.grammarHash)
      throw Error('grammar.js changed: run npm run generate, then npm install to build the current grammar');
  }
  console.error('Building current Node binding...');
  const executable = require.resolve('node-gyp-build/bin.js', {paths: [root]});
  execFileSync(process.execPath, [executable], {cwd: root, stdio: 'inherit',
    env: {...process.env, npm_config_build_from_source: 'true'}, timeout: 180000});
  if (sourceIdentity(root).hash !== source.hash) throw Error('Binding inputs changed during build; rerun npm install');
  const file = binary(root);
  fs.writeFileSync(path.join(root, RECEIPT), JSON.stringify({source,
    binary: {path: path.relative(root, file), hash: read(file)}}, null, 2) + '\n');
}
module.exports = {sourceIdentity, assertFresh, fresh, install, generated};
if (require.main === module) {
  try { if (process.argv.includes('--generated')) generated(); else install(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
