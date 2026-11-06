'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const expected = require('./expectations');
const { confined, sha256 } = require('../safety');
const REPO = path.resolve(__dirname, '../..');
const CORPUS = 'tools/psi-gate/corpus';

function inventory(root) {
  const bytes = execFileSync('git', ['-C', root, 'ls-files', '--cached', '-z', '--', CORPUS],
    {stdio: ['ignore', 'pipe', 'pipe']});
  const paths = new TextDecoder('utf-8', {fatal: true}).decode(bytes).split('\0').filter(Boolean);
  if (paths.some(file => /[\r\n\t]/.test(file))) throw Error('Unsupported control character in corpus path');
  return {indexed: new Set(paths), files: paths.filter(file => /\.(kt|kts)$/.test(file)).sort()};
}
function nativeParser(root) {
  const runtime = require('./runtime');
  if (typeof runtime.createParser === 'function') return runtime.createParser(root);
  // Bootstrap compatibility with the same repository binding while the v2 launcher lands.
  const Parser = require(require.resolve('tree-sitter', {paths: [root]}));
  const parser = new Parser(); parser.setLanguage(require(path.join(root, 'bindings/node'))); return parser;
}
async function run({root = REPO, config, home = path.join(root, 'local/psi-gate'), timeoutMs = 10000, parser}) {
  const {indexed, files} = inventory(root);
  if (!files.length) throw Error('No indexed quick corpus snippets; add the curated corpus to Git');
  parser = parser || nativeParser(root);
  const rows = [];
  for (const relative of files) {
    try {
      const bytes = fs.readFileSync(confined(root, relative));
      const reference = expected.read({root, relative, config, indexed, bytes});
      rows.push({path: relative, sourceSha256: sha256(bytes),
        ...expected.compare({text: expected.textOf(bytes), parser, expected: reference, timeoutMs})});
    } catch (error) { rows.push({path: relative, verdict: 'expectation-error', error: error.message}); }
  }
  const mismatching = rows.filter(row => row.verdict !== 'ok').length;
  const result = {exitCode: mismatching ? 1 : 0, rows,
    counts: {selected: files.length, matched: files.length - mismatching, mismatching}};
  fs.mkdirSync(home, {recursive: true});
  result.reportPath = path.join(home, 'quick.json');
  fs.writeFileSync(result.reportPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`quick: ${mismatching} files mismatching (${files.length} must-match snippets)`);
  return result;
}
async function regenerate({root = REPO, config, home = path.join(root, 'local/psi-gate'), timeoutMs = 120000,
  oracle = require('../psi-oracle/oracle').runOracleAsync}) {
  const {files} = inventory(root);
  if (!files.length) throw Error('No indexed snippets to regenerate');
  fs.mkdirSync(home, {recursive: true});
  const stage = fs.mkdtempSync(path.join(home, '.regenerate-')), inputs = path.join(stage, 'input'), out = path.join(stage, 'psi');
  const original = files.map(relative => ({relative, bytes: fs.readFileSync(confined(root, relative))}));
  try {
    for (const {relative, bytes} of original) {
      const file = path.join(inputs, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);
    }
    const refs = await oracle(files, {root: inputs, out, timeoutMs, config: config.psi});
    if (refs.length !== files.length) throw Error('Incomplete PSI expectation regeneration');
    const prepared = original.map(({relative, bytes}, i) => {
      if (refs[i].path !== relative) throw Error('Misaligned PSI expectation regeneration');
      let origin;
      const destination = expected.filename(relative);
      if (fs.existsSync(path.join(root, destination))) origin = JSON.parse(fs.readFileSync(confined(root, destination), 'utf8')).origin;
      const dump = fs.readFileSync(confined(out, refs[i].dump), 'utf8');
      return {relative, destination, bytes,
        output: JSON.stringify(expected.make({relative, bytes, dump, psi: refs[i], config, origin})) + '\n'};
    });
    for (const file of prepared)
      if (sha256(fs.readFileSync(confined(root, file.relative))) !== sha256(file.bytes)) throw Error('Source changed during regeneration');
    let changed = 0;
    for (const file of prepared) {
      const destination = path.join(root, file.destination);
      if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== file.output) {
        const temporary = destination + '.regenerate-' + process.pid;
        fs.writeFileSync(temporary, file.output, {flag: 'wx'}); fs.renameSync(temporary, destination); changed++;
      }
    }
    console.log(`regenerate-expectations: ${files.length} PSI references, ${changed} changed (review before staging)`);
    return {exitCode: 0, regenerated: files.length, changed};
  } finally { fs.rmSync(stage, {recursive: true}); }
}

module.exports = {run, regenerate, inventory, nativeParser, CORPUS};
