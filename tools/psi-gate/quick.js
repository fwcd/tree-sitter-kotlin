'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const expected = require('./expectations');
const {EXIT} = require('../cli');
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
  return require('./runtime').createParser(root);
}
function failureReason(row) {
  if (typeof row.error === 'string') return row.error;
  if (row.nativeErrors) return row.error
    ? `Native ${row.error.type} at offsets ${row.error.start}–${row.error.end}` : 'Native parse error';
  const difference = row.differences?.[0];
  if (difference) return `${difference.kind.replace(/_/g, ' ')} at ${difference.path}: PSI ${difference.expected}; native ${difference.actual}`;
  const fact = row.layoutDifferences?.[0];
  return fact ? `${fact.key}${fact.line ? ` (line ${fact.line})` : ''}` : row.verdict;
}
async function run({root = REPO, config, home = path.join(root, 'local/psi-gate'), parseTimeoutMs = 10000, parser, emit = true}) {
  const {indexed, files} = inventory(root);
  if (!files.length) throw Error('No indexed quick corpus snippets; add the curated corpus to Git');
  parser = parser || nativeParser(root);
  const rows = [];
  for (const relative of files) {
    try {
      const bytes = fs.readFileSync(confined(root, relative));
      const reference = expected.read({root, relative, config, indexed, bytes});
      rows.push({path: relative, sourceSha256: sha256(bytes),
        ...expected.compare({text: expected.textOf(bytes), parser, expected: reference, timeoutMs: parseTimeoutMs})});
    } catch (error) { rows.push({path: relative, verdict: error.message === 'Native quick parse timed out' ?
      'resource-exhausted' : 'expectation-error', error: error.message}); }
  }
  const incomplete = rows.filter(row => row.verdict === 'resource-exhausted').length;
  const errors = rows.filter(row => row.verdict === 'expectation-error').length;
  const mismatching = rows.filter(row => !['ok','resource-exhausted','expectation-error'].includes(row.verdict)).length;
  const result = {exitCode: errors ? EXIT.SETUP : incomplete ? EXIT.RESOURCE : mismatching ? EXIT.MISMATCH : EXIT.PASS, rows,
    counts: {selected: files.length, matched: files.length - mismatching - incomplete - errors, mismatching, incomplete, errors}};
  fs.mkdirSync(home, {recursive: true});
  result.reportPath = path.join(home, 'quick.json');
  fs.writeFileSync(result.reportPath, JSON.stringify(result, null, 2) + '\n');
  if (emit) printResult(result);
  return result;
}
function printResult(result) {
  const {rows, counts: {mismatching, selected}, reportPath} = result;
  if (result.exitCode === EXIT.SETUP) {
    console.log('quick: ERROR');
  } else if (result.exitCode === EXIT.RESOURCE) {
    console.log(`quick: INCOMPLETE (${result.counts.incomplete} native timeouts)`);
    console.error('quick: increase --parse-timeout-ms and rerun; no complete verdict');
  } else console.log(`quick: ${mismatching} files mismatching (${selected} must-match snippets)`);
  if (result.exitCode !== EXIT.PASS) {
    for (const row of rows.filter(row => row.verdict !== 'ok'))
      console.error(`  ${row.path}: ${failureReason(row).replace(/[\r\n]+/g, ' ').slice(0, 600)}`);
    console.log(reportPath);
  }
}
async function regenerate({root = REPO, config, home = path.join(root, 'local/psi-gate'), oracleTimeoutMs = 120000,
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
    const refs = await oracle(files, {root: inputs, out, timeoutMs: oracleTimeoutMs, config: config.psi});
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
    console.log(`regenerate-expectations: PASS (${files.length} PSI references, ${changed} changed)`);
    console.error('Review regenerated PSI expectations before staging source and expectation together.');
    return {exitCode: 0, regenerated: files.length, changed};
  } finally { fs.rmSync(stage, {recursive: true}); }
}

module.exports = {run, regenerate, inventory, nativeParser, failureReason, CORPUS, printResult};
