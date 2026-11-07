'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createParser} = require('./runtime');
const {fetchAll} = require('../psi-oracle/fetch');
const {InspectorPool} = require('./fuzz-compare');
const state = require('./fuzz-state');
const findings = require('./fuzz-findings');
const {oracleIdentity} = require('./expectations');
const {sha256} = require('../safety');
const {BudgetExceeded, remaining} = require('./fuzz-budget');
const {isResourceError, resourceMessage} = require('../resource');
const ROOT = path.resolve(__dirname, '../..');
async function run({file, config, oracleTimeoutMs, parseTimeoutMs, maxSeconds = 30, classId}) {
  const extension = path.extname(file);
  if (!['.kt', '.kts'].includes(extension)) throw Error('minimize requires a Kotlin .kt/.kts file');
  const input = {text: fs.readFileSync(file, 'utf8'), extension, origin: {file: path.resolve(file)}};
  createParser(); await fetchAll({config});
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-minimized-'));
  const oracle = oracleIdentity(config), indexPath = path.join(out, 'index.json');
  const saveIndex = value => fs.writeFileSync(indexPath, JSON.stringify({schemaVersion: 1, oracle,
    syntaxNote: findings.syntaxNote, ...value}, null, 2) + '\n');
  const inspector = new InspectorPool({grammar: ROOT, runtime: ROOT, config: {config}, out, timeoutMs: oracleTimeoutMs, parseTimeoutMs});
  try {
    const deadline = Date.now() + maxSeconds * 1000;
    const [original] = await inspector.inspect([input], {deadline});
    remaining(deadline);
    if (!original.accepted) throw Error('Input is PSI-invalid; minimization requires error-free PSI');
    if (!original.classes.length) { console.log('Input matches PSI; nothing to minimize'); return {exitCode: 0}; }
    const selected = classId ? original.classes.find(c => c.id === classId) : original.classes[0];
    if (!selected) throw Error(`Mismatch class is no longer present: ${classId}`);
    const min = await state.minimize(input, selected.id, inspector, {seconds: maxSeconds, deadline});
    const context = sha256(JSON.stringify([state.identity({grammar: ROOT, runtime: ROOT}), oracle]));
    const entry = findings.record({out, seed: 'per-file', context,
      bucket: {input, originalBytes: Buffer.byteLength(input.text)}, min, knownMatch: false});
    saveIndex({entries: [entry], partial: min.exhausted});
    const before = Buffer.byteLength(input.text), after = Buffer.byteLength(min.text);
    console.error(!min.exhausted && before === after
      ? `minimize: already minimal within the reduction limits (${after} bytes)`
      : `minimize: ${before} -> ${after} bytes${min.exhausted ? ' (partial)' : ''}`);
    console.log(entry.file); console.log(entry.sidecar);
    console.log(`Index: ${indexPath}`);
    console.error(min.exhausted ? 'Reduction incomplete: retry with a larger --max-seconds budget.'
      : 'Next: review the mismatch and sidecar, fix it, then use add FILE once it matches PSI.');
    console.error('Keep the index with the source and sidecar for their referenced metadata.');
    return {exitCode: min.exhausted ? 2 : 0, ...entry, indexPath, partial: min.exhausted};
  } catch (error) {
    if (!isResourceError(error)) throw error;
    saveIndex({entries: [], partial: true, stopReason: error instanceof BudgetExceeded ? 'time-budget' : 'resource-budget',
      input: {path: path.resolve(file), sourceSha256: sha256(Buffer.from(input.text))}});
    console.error(resourceMessage('minimize', {...error, message: 'no verified representative saved before exhaustion'}));
    console.log(`Index: ${indexPath}`);
    return {exitCode: 2, partial: true, indexPath};
  } finally { inspector.close(); }
}
module.exports = {run};
