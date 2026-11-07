'use strict';
const fs = require('fs');
const path = require('path');
const {sha256, confined} = require('../safety');
const state = require('./fuzz-state');
const {inventory} = require('./quick');
const syntaxNote = 'PSI-valid syntax does not imply compilable Kotlin. Minimization may leave unresolved names, type errors or unusual valid constructs; compilation and type checking were not run.';

function observation(result) {
  return sha256(JSON.stringify([sha256(Buffer.from(result.text)), result.classes.map(c => c.signature), result.expectedPsi,
    result.expectedNormalized, result.actualNormalized, result.nativeTree,
    result.differences, result.layoutDifferences, result.grammarDefect, result.spanEvidence]));
}
function knownInputs(root, directory) {
  const entries = [];
  if (fs.existsSync(path.join(directory, 'ledger.json'))) {
    for (const entry of JSON.parse(fs.readFileSync(path.join(directory, 'ledger.json')))) {
      if (sha256(fs.readFileSync(confined(directory, entry.file))) !== entry.sourceSha256 ||
          sha256(fs.readFileSync(confined(directory, entry.expected))) !== entry.expectedSha256)
        throw Error('Corrupt known ledger entry: ' + entry.id);
      entries.push({id: entry.id, input: state.readGrammarInput(directory, entry)});
    }
  }
  if (fs.existsSync(path.join(directory, 'catalog-ledger.json')))
    for (const entry of JSON.parse(fs.readFileSync(path.join(directory, 'catalog-ledger.json'))).cases)
      entries.push({id: entry.id, input: {text: fs.readFileSync(confined(directory, entry.file), 'utf8'),
        extension: path.extname(entry.file)}});
  if (root) for (const relative of inventory(root).files)
    entries.push({id: 'corpus:' + relative, mustMatch: true, input: {text: fs.readFileSync(confined(root, relative), 'utf8'),
      extension: path.extname(relative)}});
  const grouped = new Map();
  for (const entry of entries) {
    const key = sha256(Buffer.from(entry.input.text)) + ':' + entry.input.extension;
    let group = grouped.get(key);
    if (!group) {group = {...entry, ids: []}; grouped.set(key, group);}
    group.ids.push(entry.id);
    // A retained must-match case takes precedence over a historical bug alias.
    group.mustMatch ||= entry.mustMatch;
  }
  return [...grouped.values()];
}
function record({out, seed, context, bucket, min, knownMatch}) {
  const result = min.result, source = Buffer.from(min.text), id = observation(result).slice(0, 24);
  const extension = min.extension || '.kt', file = 'suspect-' + id + extension;
  const sidecar = file + '.json', target = path.join(out, file);
  const evidence = {schemaVersion: 1, id, sourceSha256: sha256(source), seed,
    provenance: bucket.input.origin, originalBytes: bucket.originalBytes, extension,
    context, oracleRef: 'index.json#/oracle', reduction: {complete: !min.exhausted, bytes: source.length}, reverified: true,
    psiErrors: 0, compilationChecked: false,
    noteRef: 'index.json#/syntaxNote',
    nativeErrors: result.nativeRejected, psiNormalized: result.expectedNormalized,
    nativeNormalized: result.actualNormalized, nativeTree: result.nativeTree,
    diff: result.differences, layoutDiff: result.layoutDifferences || [], signatures: result.classes,
    spanEvidence: result.spanEvidence, knownMatch};
  if (!fs.existsSync(target)) fs.writeFileSync(target, source, {flag: 'wx'});
  else if (sha256(fs.readFileSync(target)) !== sha256(source)) throw Error('Conflicting suspect source: ' + id);
  fs.writeFileSync(path.join(out, sidecar), JSON.stringify(evidence, null, 2) + '\n');
  return {id, file: path.resolve(target), sidecar: path.resolve(out, sidecar), sourceSha256: evidence.sourceSha256};
}
module.exports = {observation, knownInputs, record, syntaxNote};
