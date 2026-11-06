'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {execFileSync} = require('child_process');
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
function generate(root = ROOT) {
  const expected = generatorVersion(root);
  const executable = require.resolve('tree-sitter-cli/cli.js', {paths: [root]});
  const version = execFileSync(process.execPath, [executable, '--version'], {cwd: root, encoding: 'utf8'});
  if (!version.startsWith('tree-sitter ' + expected + ' ')) throw Error('Wrong tree-sitter generator; run npm install');
  const grammarHash = read(path.join(root, 'grammar.js'));
  execFileSync(process.execPath, [executable, 'generate'], {cwd: root, stdio: 'inherit', timeout: 180000});
  if (read(path.join(root, 'grammar.js')) !== grammarHash) throw Error('grammar.js changed during generation; rerun npm run generate');
  const identity = {schemaVersion: 1, generatorVersion: expected, grammarHash,
    files: Object.fromEntries(GENERATED_FILES.map(file => [file, read(path.join(root, file))]))};
  const file = path.join(root, GENERATION), temporary = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(identity, null, 2) + '\n'); fs.renameSync(temporary, file);
}
function install(root = ROOT) {
  assertGenerated(root);
  if (fresh(root) && !process.env.npm_config_build_from_source) return;
  const source = sourceIdentity(root);
  console.error('Building current Node binding...');
  const executable = require.resolve('node-gyp-build/bin.js', {paths: [root]});
  execFileSync(process.execPath, [executable], {cwd: root, stdio: 'inherit',
    env: {...process.env, npm_config_build_from_source: 'true'}, timeout: 180000});
  if (sourceIdentity(root).hash !== source.hash) throw Error('Binding inputs changed during build; rerun npm install');
  const file = binary(root);
  fs.writeFileSync(path.join(root, RECEIPT), JSON.stringify({source,
    binary: {path: path.relative(root, file), hash: read(file)}}, null, 2) + '\n');
}
module.exports = {sourceIdentity, assertFresh, fresh, install, generate, assertGenerated};
if (require.main === module) {
  try { if (process.argv.includes('--generate')) generate(); else install(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
