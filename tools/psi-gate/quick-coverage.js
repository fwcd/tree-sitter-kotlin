'use strict';

// Explicit live-PSI measurement; quick itself still needs no Java or network.
const fs = require('fs');
const os = require('os');
const path = require('path');
const quick = require('./quick');
const expected = require('./expectations');
const {observe, Coverage} = require('./fuzz-coverage');
const {confined, sha256} = require('../safety');
const ROOT = path.resolve(__dirname, '../..');
const grammarBlocked = {
  COMPANION_BLOCK: 'coverage-companion-block',
  CONTRACT_EFFECT: 'coverage-contract-v2',
  CONTRACT_EFFECT_LIST: 'coverage-contract-v2',
  contract: 'coverage-contract-v2',
};

async function measure({root = ROOT, config = require('./config').loadConfig(),
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-quick-coverage-')), timeoutMs = 120000} = {}) {
  const {files, indexed} = quick.inventory(root);
  if (!files.length) throw Error('No indexed quick snippets to measure');
  fs.mkdirSync(out, {recursive: true});
  const inputs = path.join(out, 'inputs'), oracleOut = path.join(out, 'psi');
  const sources = files.map(relative => ({relative, bytes: fs.readFileSync(confined(root, relative))}));
  for (const {relative, bytes} of sources) {
    const target = path.join(inputs, relative); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, bytes);
  }
  const refs = await require('../psi-oracle/oracle').runOracleAsync(files, {root: inputs, out: oracleOut, config, timeoutMs});
  if (refs.length !== files.length) throw Error('Incomplete quick coverage oracle output');
  const coverage = new Coverage(), parser = quick.nativeParser(root), rows = [];
  for (const [index, {relative, bytes}] of sources.entries()) {
    const ref = refs[index];
    if (ref.path !== relative || ref.failure || ref.psiErrors) throw Error('PSI-invalid or misaligned coverage input: ' + relative);
    if (sha256(fs.readFileSync(confined(root, relative))) !== sha256(bytes)) throw Error('Source changed during coverage measurement');
    const dump = fs.readFileSync(confined(oracleOut, ref.dump), 'utf8'), text = expected.textOf(bytes);
    const stored = expected.read({root, relative, bytes, config, indexed});
    const live = expected.make({relative, bytes, dump, psi: ref, config, origin: stored.origin});
    if (JSON.stringify(live) !== JSON.stringify(stored)) throw Error('Stored PSI expectation differs from live PSI: ' + relative);
    const comparison = expected.compare({text, parser, expected: live, timeoutMs});
    if (comparison.verdict !== 'ok') throw Error('Quick coverage requires must-match input: ' + relative + ': ' + quick.failureReason(comparison));
    const tree = parser.parse(text);
    try {
      const observed = observe(tree.rootNode, dump);
      coverage.add({accepted: true, nativeRejected: false, coverage: observed}, {kind: 'corpus'});
      rows.push({path: relative, sourceSha256: sha256(bytes), ...observed});
    } finally { tree.delete?.(); }
  }
  const result = {...coverage.snapshot(), oracle: expected.oracleIdentity(config), sources: rows};
  result.notYetCoverable = ['psiComposites', 'psiTokens'].flatMap(universe =>
    result.views.all.missing[universe].filter(type => Object.hasOwn(grammarBlocked, type)).map(type => ({
      universe, type, ledgerId: grammarBlocked[type],
      reason: `not yet coverable — blocked by grammar defects ${grammarBlocked[type]}`,
    })));
  fs.writeFileSync(path.join(out, 'coverage.json'), JSON.stringify(result, null, 2) + '\n');
  const s = result.views.all.summary;
  console.log(`quick coverage (${files.length} must-match snippets): native ${s.nativeTypes}/${s.nativeTotal}, PSI composites ${s.psiComposites}/${s.psiCompositeTotal}, lexer ${s.psiTokens}/${s.psiTokenTotal}`);
  for (const gap of result.notYetCoverable) console.log(`  ${gap.type}: ${gap.reason}`);
  console.log(`Report: ${path.join(out, 'coverage.json')}`);
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out')) {
    console.error('Usage: node tools/psi-gate/quick-coverage.js [--out DIRECTORY]'); process.exitCode = 1;
  } else measure(args.length ? {out: path.resolve(args[1])} : {}).catch(error => {console.error(error.message); process.exitCode = 1;});
}
module.exports = {measure};
