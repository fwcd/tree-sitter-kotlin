'use strict';

const fs = require('fs');
const path = require('path');
const { run, resetOutput, confined, sha256 } = require('../safety');
const state = require('./state');
const { resolveBase } = require('./base');
const { assertHome, withHome } = require('./home');
const { prerequisites, runtime } = require('./runtime');
const ROOT = path.resolve(__dirname, '../..');

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
/** Prepare the pinned runtime and an immutable grammar for other PSI tools. */
async function prepareGrammar({ home, base, upstream, upstreamBranch, gitTimeoutMs }) {
  assertHome(home);
  return withHome(home, async () => {
    prerequisites({ corpora: [] });
    runtime();
    await require('../psi-oracle/fetch').fetchAll();
    const ref = revision(base, { upstream, upstreamBranch, gitTimeoutMs });
    return { grammar: grammar(ROOT, home, ref), runtime: __dirname, revision: ref };
  });
}


module.exports = { grammar, revision, prepareGrammar };
