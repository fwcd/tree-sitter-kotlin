'use strict';

const fs = require('fs');
const path = require('path');
const { sha256, confined } = require('../safety');
const { parsePsi } = require('../cross-validation/parser-psi');
const { parseTreeSitter } = require('../cross-validation/parser-ts');
const { attachPsi, attachNative } = require('../cross-validation/native-metadata');
const { normalizePsi, normalizeTs } = require('../cross-validation/normalizer');
const { compareTrees } = require('../cross-validation/comparator');
const { psiLayout } = require('../cross-validation/psi-layout');
const { lexicalFacts, firstTsError } = require('../cross-validation/diff-classify');
const { layoutDifferences } = require('../cross-validation/native-layout');
const { Node } = require('../cross-validation/models');
const REPO = path.resolve(__dirname, '../..');

function comparisonIdentity() {
  const roots = ['./../cross-validation/pipeline', './../cross-validation/native-layout', './../cross-validation/native-facts'];
  const pending = roots.map(name => { require(name); return require.cache[require.resolve(name)]; });
  const seen = new Set(), files = [];
  while (pending.length) {
    const dependency = pending.pop();
    if (!dependency || seen.has(dependency.id)) continue;
    seen.add(dependency.id); pending.push(...dependency.children);
    const relative = path.relative(REPO, dependency.filename);
    if (relative.startsWith('tools' + path.sep) && !relative.split(path.sep).includes('node_modules'))
      files.push([relative.split(path.sep).join('/'), sha256(fs.readFileSync(dependency.filename))]);
  }
  files.push(['tools/psi-gate/expectations.js', sha256(fs.readFileSync(__filename))]);
  return sha256(JSON.stringify(files.sort(([a], [b]) => a.localeCompare(b))));
}
function oracleIdentity(config) {
  const psi = config?.psi || config;
  if (!psi?.version || !Array.isArray(psi.jars) || !psi.jars.length || !psi.helper?.version || !psi.helper?.sha256)
    throw Error('Quick needs the pinned PSI jar/helper configuration');
  const jars = psi.jars.map(jar => ({coordinate: jar.coordinate, sha256: jar.sha256}));
  if (jars.some(jar => !jar.coordinate || !/^[a-f0-9]{64}$/i.test(jar.sha256)) ||
      !/^[a-f0-9]{64}$/i.test(psi.helper.sha256)) throw Error('Invalid PSI pin digest');
  return {version: psi.version, jars: jars.sort((a, b) => a.coordinate.localeCompare(b.coordinate)),
    helper: {version: psi.helper.version, sha256: psi.helper.sha256}};
}
function textOf(bytes) {
  return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes).replace(/\r\n?/g, '\n');
}
const shape = node => node && [node.name, node.children.map(shape),
  ...(node.literal === undefined ? [] : [{literal: node.literal}])];
function treeOf(value, length) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3 ||
      typeof value[0] !== 'string' || !Array.isArray(value[1])) throw Error('Invalid stored PSI tree');
  const literal = value[2]?.literal;
  if (value.length === 3 && (!literal || !['string', 'number'].includes(typeof literal.value) ||
      !Number.isInteger(literal.start) || !Number.isInteger(literal.end) ||
      literal.start < 0 || literal.end < literal.start || literal.end > length))
    throw Error('Invalid stored PSI literal interval');
  return new Node(value[0], value[1].map(child => treeOf(child, length)), literal);
}
function validateLayout(layout, length) {
  for (const key of ['composites', 'tokens', 'errors', 'comments', 'commentSpans'])
    if (!Array.isArray(layout?.[key])) throw Error('Invalid stored PSI layout: ' + key);
  if (layout.errors.length) throw Error('Stored PSI expectations must be syntax clean');
  for (const entry of [...layout.composites, ...layout.tokens, ...layout.commentSpans])
    if (!Number.isInteger(entry.start) || !Number.isInteger(entry.end) || entry.start < 0 ||
        entry.end < entry.start || entry.end > length) throw Error('Invalid stored PSI source interval');
  for (const offset of layout.comments)
    if (!Number.isInteger(offset) || offset < 0 || offset > length) throw Error('Invalid stored comment offset');
}
function make({relative, bytes, dump, psi, config, origin}) {
  if (psi.failure || psi.psiErrors) throw Error('Cannot store PSI-invalid expectation: ' + relative);
  const text = textOf(bytes), parsed = parsePsi(dump);
  attachPsi(parsed, dump, text);
  const layout = psiLayout(dump, text); validateLayout(layout, text.length);
  return {schemaVersion: 1, source: {path: relative, sha256: sha256(bytes), decode: 'utf8-lf-v1'},
    oracle: oracleIdentity(config), normalization: {catalogue: 'N1–N42', digest: comparisonIdentity()},
    psi: {errors: 0, tree: shape(normalizePsi(parsed)), layout}, ...(origin ? {origin} : {})};
}
const filename = relative => relative + '.psi.json';
function read({root, relative, config, indexed, bytes = fs.readFileSync(confined(root, relative))}) {
  const expectationPath = filename(relative);
  if (indexed && !indexed.has(expectationPath)) throw Error('Stored PSI expectation is not in the Git index: ' + expectationPath);
  const expected = JSON.parse(fs.readFileSync(confined(root, expectationPath), 'utf8'));
  if (expected.schemaVersion !== 1 || expected.source?.path !== relative || expected.source.decode !== 'utf8-lf-v1')
    throw Error('Unsupported stored PSI expectation: ' + relative);
  if (expected.source.sha256 !== sha256(bytes)) throw Error('Stale PSI source identity: ' + relative);
  if (JSON.stringify(expected.oracle) !== JSON.stringify(oracleIdentity(config)))
    throw Error('Stale PSI oracle identity: ' + relative);
  if (expected.normalization?.digest !== comparisonIdentity()) throw Error('Stale normalization identity: ' + relative);
  const text = textOf(bytes);
  if (expected.psi?.errors !== 0) throw Error('Stored PSI expectations must be syntax clean');
  treeOf(expected.psi.tree, text.length); validateLayout(expected.psi.layout, text.length);
  return expected;
}
function compare({text, parser, expected, timeoutMs = 10000}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw Error('Invalid quick parse timeout');
  parser.setTimeoutMicros(timeoutMs * 1000);
  const started = process.hrtime.bigint();
  const tree = parser.parse(text, undefined, {bufferSize: Math.max(32768, Buffer.byteLength(text) * 2 + 1024)});
  if (!tree || Number(process.hrtime.bigint() - started) / 1000000 >= timeoutMs) {
    tree?.delete?.(); parser.reset(); throw Error('Native quick parse timed out');
  }
  try {
    if (tree.rootNode.hasError) {
      const error = firstTsError(tree.rootNode);
      return {verdict: 'A', nativeErrors: true, differences: [],
        error: error ? {type: error.node.type, start: error.node.startIndex, end: error.node.endIndex} : null};
    }
    const native = parseTreeSitter(tree.rootNode.toString()); attachNative(native, tree.rootNode);
    const comparison = compareTrees(normalizeTs(native), treeOf(expected.psi.tree, text.length));
    const facts = layoutDifferences(text, tree.rootNode, expected.psi.layout, lexicalFacts(tree.rootNode));
    return {verdict: comparison.status === 'MATCH' && !facts.length ? 'ok' : 'C', nativeErrors: false,
      differences: comparison.differences, layoutDifferences: facts};
  } finally { tree.delete?.(); }
}

module.exports = {comparisonIdentity, oracleIdentity, textOf, shape, treeOf, make, read, compare, filename};
