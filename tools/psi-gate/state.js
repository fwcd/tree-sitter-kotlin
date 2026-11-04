'use strict';
const fs = require('fs');
const path = require('path');
const { sha256, confined, inside, canonical, javaDetails } = require('../safety');
const REPO = path.resolve(__dirname, '../..');
const hashFile = file => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
const digest = value => sha256(JSON.stringify(value));
function treeFiles(root) {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file); else if (e.isFile()) files.push(file);
      else throw new Error(`Unexpected symlink in grammar sources: ${file}`);
    }
  }
  for (const name of ['src', 'bindings/node', 'prebuilds']) walk(path.join(root, name));
  for (const name of ['binding.gyp', 'package.json', 'grammar.js', 'build/Release/tree_sitter_kotlin_binding.node']) {
    const file = path.join(root, name); if (fs.existsSync(file)) files.push(file);
  }
  return files.sort().map(file => [path.relative(root, file), hashFile(file)]);
}
function runtimeIdentity(root) {
  const entry = require.resolve('tree-sitter', { paths: [root] });
  const directory = path.dirname(entry);
  const native = ['build/Release', 'prebuilds'].flatMap(dir => require('../vendor-fixtures').listFilesRecursive(path.join(directory, dir))
    .filter(file => file.endsWith('.node')).map(file => [path.join(dir, file), hashFile(path.join(directory, dir, file))]));
  return digest([hashFile(entry), hashFile(path.join(directory, 'package.json')), native]);
}
function identity(options, files) {
  const sources = files.map(file => ({ path: file, sha256: hashFile(confined(options.root, file)) }));
  if (!sources.length) throw new Error('No Kotlin inputs found; refusing an empty run');
  const toolFiles = ['tools/safety.js', 'tools/psi-gate/state.js', 'tools/cross-validation/diff-run.js',
    'tools/cross-validation/normalizer.js', 'tools/cross-validation/mapping.js', 'tools/cross-validation/pipeline.js',
    'tools/cross-validation/parser-psi.js', 'tools/cross-validation/parser-ts.js', 'tools/cross-validation/comparator.js',
    'tools/cross-validation/models.js', 'tools/psi-oracle/oracle.js', 'tools/psi-oracle/fetch.js', 'tools/psi-oracle/PsiOracle.java'];
  const context = { corpus: options.corpus, java: javaDetails(), runtimeContent: runtimeIdentity(options.runtime || REPO),
    environment: digest(['JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','LC_ALL','LC_CTYPE','LANG','NODE_OPTIONS','LD_LIBRARY_PATH','DYLD_LIBRARY_PATH'].map(k => [k,process.env[k] || ''])),
    parseTimeoutMs: options.parseTimeoutMs, inputs: digest(sources),
    tools: digest(toolFiles.map(name => [name, hashFile(path.join(REPO, name))])),
    runtime: require(require.resolve('tree-sitter/package.json', { paths: [options.runtime || REPO] })).version,
    origins: options.origins ? hashFile(options.origins) : null,
    claims: options.cases ? hashFile(options.cases) : null,
    provenance: hashFile(path.join(options.root, 'provenance.json')) };
  return { schemaVersion: 1, context, sources, root: canonical(options.root), shardSize: options.shardSize,
    platform: `${process.platform}/${process.arch}/${process.version}`, grammars: options.grammars.map(g => ({
      label: g.label, root: canonical(g.root), files: treeFiles(g.root) })) };
}
function validateShard(filename, sources, labels) {
  const bytes = fs.readFileSync(filename);
  if (fs.readFileSync(filename + '.sha256', 'utf8').trim() !== sha256(bytes)) throw new Error(`Corrupt shard: ${filename}`);
  const records = bytes.toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  if (records.length !== sources.length) throw new Error(`Partial shard: ${filename}`);
  records.forEach((r, i) => {
    if (r.path !== sources[i].path || r.sha256 !== sources[i].sha256
        || JSON.stringify(Object.keys(r.results).sort()) !== JSON.stringify([...labels].sort())
        || labels.some(label => !r.results[label].verdict)) throw new Error(`Misaligned/incomplete shard: ${filename}`);
  });
  return records;
}
function complete(out, current) {
  if (!current.sources.length) throw new Error('Refusing an empty execution');
  const dir = path.join(out, 'shards'), n = Math.ceil(current.sources.length / current.shardSize);
  if (fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).length !== n) throw new Error('Run is partial; finish it before reporting or updating expectations');
  return Array.from({ length: n }, (_, i) => validateShard(path.join(dir, `${String(i).padStart(5, '0')}.jsonl`),
    current.sources.slice(i * current.shardSize, (i + 1) * current.shardSize), current.grammars.map(g => g.label))).flat();
}
const agreement = result => ['ok', 'both-error', 'B-script'].includes(result.verdict);
const signature = result => digest([result.verdict, result.key || null, result.treeHash || null]);
function gate(records, label, { base = null, expected = null, conformance = false } = {}) {
  const failures = [], existing = [];
  for (const record of records) {
    for (const [grammar, result] of Object.entries(record.results)) {
      if (['oracle-failure', 'harness-error'].includes(result.verdict)) failures.push({ path: record.path, kind: result.verdict, grammar, message: result.key });
    }
    if (record.claim && record.claim.error !== ((record.scriptPsiErrors ?? record.psiErrors) > 0)) {
      failures.push({ path: record.path, kind: 'corpus-claim', message: `${record.claim.name}: expected PSI ${record.claim.error ? 'error' : 'clean'}, got ${record.scriptPsiErrors ?? record.psiErrors} errors` });
    }
    const result = record.results[label];
    const prior = base ? record.results[base] : null;
    if (result.verdict === 'both-error' && prior?.verdict === 'both-error' && result.treeHash !== prior.treeHash) {
      failures.push({ path: record.path, kind: 'changed-recovery', message: 'Both parsers reject input, but candidate error-recovery CST changed; review it' });
    }
    if (agreement(result) || ['oracle-failure', 'harness-error'].includes(result.verdict)) continue;
    const allowed = expected && expected.differences[record.path];
    if (!conformance && ((prior && !agreement(prior) && signature(prior) === signature(result))
        || (!prior && allowed && allowed.sha256 === record.sha256 && allowed.signature === signature(result)))) existing.push(record.path);
    else failures.push({ path: record.path, kind: 'difference', message: result.key || result.verdict });
  }
  return { failures, existing };
}
function snapshot(current, records, label, grammar) {
  const status = gate(records, label, { base: label });
  if (status.failures.length) throw new Error('Cannot update expectations from an execution failure or a corpus assertion mismatch');
  return { schemaVersion: 1, context: current.context, grammar,
    differences: Object.fromEntries(records.filter(r => !agreement(r.results[label])).map(r => [r.path,
      { sha256: r.sha256, signature: signature(r.results[label]), verdict: r.results[label].verdict, key: r.results[label].key }])) };
}
function loadExpected(file, context) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schemaVersion !== 1 || !data.differences || digest(data.context) !== digest(context)) {
    throw new Error('Expected snapshot does not match these inputs/tools. Review and update it explicitly; count registries are unsupported.');
  }
  return data;
}
function checkOutput(out, root, files) {
  if (files.some(file => inside(canonical(out), canonical(confined(root, file))))) throw new Error('Output directory would replace corpus inputs');
}
module.exports = { digest, hashFile, identity, runtimeIdentity, validateShard, complete, gate, snapshot, loadExpected, checkOutput, signature };
