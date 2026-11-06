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
const ROOT = path.resolve(__dirname, '../..');
async function run({file, config, timeoutMs, parseTimeoutMs, maxSeconds = 30, classId}) {
  const extension = path.extname(file);
  if (!['.kt', '.kts'].includes(extension)) throw Error('minimize requires a Kotlin .kt/.kts file');
  const input = {text: fs.readFileSync(file, 'utf8'), extension, origin: {file: path.resolve(file)}};
  createParser(); await fetchAll({config});
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-minimized-'));
  const inspector = new InspectorPool({grammar: ROOT, runtime: ROOT, config: {config}, out, timeoutMs, parseTimeoutMs});
  try {
    const deadline = Date.now() + maxSeconds * 1000;
    const [original] = await inspector.inspect([input], {deadline});
    if (!original.accepted) throw Error('Input is PSI-invalid; minimization requires error-free PSI');
    if (!original.classes.length) { console.log('Input matches PSI; nothing to minimize'); return {exitCode: 0}; }
    const selected = classId ? original.classes.find(c => c.id === classId) : original.classes[0];
    if (!selected) throw Error(`Mismatch class is no longer present: ${classId}`);
    const min = await state.minimize(input, selected.id, inspector, {seconds: maxSeconds, deadline});
    const oracle = oracleIdentity(config);
    const context = sha256(JSON.stringify([state.identity({grammar: ROOT, runtime: ROOT}), oracle]));
    const entry = findings.record({out, seed: 'per-file', context,
      bucket: {input, originalBytes: Buffer.byteLength(input.text)}, min, knownMatch: false});
    fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({schemaVersion: 1, oracle, entries: [entry]}, null, 2) + '\n');
    console.log(`minimize: ${Buffer.byteLength(input.text)} -> ${Buffer.byteLength(min.text)} bytes${min.exhausted ? ' (partial)' : ''}`);
    console.log(entry.file); console.log(entry.sidecar);
    return {exitCode: min.exhausted ? 2 : 0, ...entry};
  } finally { inspector.close(); }
}
module.exports = {run};
