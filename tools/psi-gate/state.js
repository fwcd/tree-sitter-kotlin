'use strict';
const fs = require('fs');
const path = require('path');
const { sha256, confined, inside, canonical, javaDetails } = require('../safety');
const corpus = require('./corpus');
const REPO = path.resolve(__dirname, '../..');
const hashFile = (file) => (fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null);
const digest = (value) => sha256(JSON.stringify(value));
function treeFiles(root) {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else if (e.isFile()) files.push(file);
      else throw new Error(`Unexpected symlink in grammar sources: ${file}`);
    }
  }
  for (const name of ['src', 'bindings/node', 'prebuilds']) walk(path.join(root, name));
  for (const name of [
    'binding.gyp',
    'package.json',
    'grammar.js',
    'build/Release/tree_sitter_kotlin_binding.node',
  ]) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) files.push(file);
  }
  return files.sort().map((file) => [path.relative(root, file), hashFile(file)]);
}
function runtimeIdentity(root) {
  const entry = require.resolve('tree-sitter', { paths: [root] });
  const directory = path.dirname(entry);
  const native = ['build/Release', 'prebuilds'].flatMap((dir) =>
    require('../vendor-fixtures')
      .listFilesRecursive(path.join(directory, dir))
      .filter((file) => file.endsWith('.node'))
      .map((file) => [path.join(dir, file), hashFile(path.join(directory, dir, file))]),
  );
  return digest([hashFile(entry), hashFile(path.join(directory, 'package.json')), native]);
}
function identity(options, files) {
  const sources = files.map((file) => ({
    path: file,
    sha256: hashFile(confined(options.root, file)),
  }));
  if (!sources.length) throw new Error('No Kotlin inputs found; refusing an empty run');
  const context = {
    corpus: options.corpus,
    java: { feature: javaDetails().feature },
    runtimeContent: runtimeIdentity(options.runtime || REPO),
    environment: digest(
      [
        'JAVA_TOOL_OPTIONS',
        'JDK_JAVA_OPTIONS',
        'LC_ALL',
        'LC_CTYPE',
        'LANG',
        'NODE_OPTIONS',
        'LD_LIBRARY_PATH',
        'DYLD_LIBRARY_PATH',
      ].map((k) => [k, process.env[k] || '']),
    ),
    parseTimeoutMs: options.parseTimeoutMs,
    inputs: digest(sources),
    tools: toolIdentity(),
    runtime: require(
      require.resolve('tree-sitter/package.json', { paths: [options.runtime || REPO] }),
    ).version,
    origins: options.origins ? hashFile(options.origins) : null,
    claims: options.cases ? hashFile(options.cases) : null,
    baseClaims: options.baseCases ? hashFile(options.baseCases) : null,
    provenance: hashFile(path.join(options.root, 'provenance.json')),
  };
  return {
    schemaVersion: 1,
    context,
    sources,
    root: canonical(options.root),
    shardSize: options.shardSize,
    platform: `${process.platform}/${process.arch}/${process.version}`,
    grammars: options.grammars.map((g) => ({
      label: g.label,
      root: canonical(g.root),
      files: treeFiles(g.root),
    })),
  };
}
function validateShard(filename, sources, labels) {
  if (!fs.existsSync(filename) || !fs.existsSync(filename + '.sha256')) {
    throw new Error(
      `Run is incomplete: missing shard or checksum ${filename}; resume the run or use --fresh`,
    );
  }
  const bytes = fs.readFileSync(filename);
  if (fs.readFileSync(filename + '.sha256', 'utf8').trim() !== sha256(bytes))
    throw new Error(`Corrupt shard: ${filename}`);
  const records = bytes
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (records.length !== sources.length) throw new Error(`Partial shard: ${filename}`);
  records.forEach((r, i) => {
    if (
      r.path !== sources[i].path ||
      r.sha256 !== sources[i].sha256 ||
      JSON.stringify(Object.keys(r.results).sort()) !== JSON.stringify([...labels].sort()) ||
      labels.some((label) => !r.results[label].verdict)
    )
      throw new Error(`Misaligned/incomplete shard: ${filename}`);
  });
  return records;
}
function complete(out, current) {
  if (!current.sources.length) throw new Error('Refusing an empty execution');
  const dir = path.join(out, 'shards'),
    n = Math.ceil(current.sources.length / current.shardSize);
  if (fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).length !== n)
    throw new Error('Run is partial; finish it before reporting or updating expectations');
  return Array.from({ length: n }, (_, i) =>
    validateShard(
      path.join(dir, `${String(i).padStart(5, '0')}.jsonl`),
      current.sources.slice(i * current.shardSize, (i + 1) * current.shardSize),
      current.grammars.map((g) => g.label),
    ),
  ).flat();
}
const agreement = (result) => ['ok', 'both-error', 'B-script'].includes(result.verdict);
const signature = (result) => digest([result.verdict, result.key || null, result.treeHash || null]);

/** Derive identity from the actual comparison dependency graph, plus its Java asset. */
function toolIdentity() {
  const start = require.cache[require.resolve('../cross-validation/diff-run')];
  const seen = new Set();
  const pending = [start];
  const files = [];
  while (pending.length) {
    const module = pending.pop();
    if (!module || seen.has(module.id)) continue;
    seen.add(module.id);
    pending.push(...module.children);
    if (
      inside(path.join(REPO, 'tools'), module.filename) &&
      !module.filename.includes('node_modules')
    ) {
      files.push([path.relative(REPO, module.filename), hashFile(module.filename)]);
    }
  }
  const java = require('../psi-oracle/oracle').SOURCE;
  files.push([path.relative(REPO, java), hashFile(java)]);
  return digest(files.sort((a, b) => a[0].localeCompare(b[0])));
}

function claimProblems(record, label) {
  if (!record.claim) return [];
  const result = record.results[label];
  const hasError = result.hasError ?? ['A', 'A-prefix', 'both-error'].includes(result.verdict);
  const problems = [];
  if (hasError !== record.claim.error)
    problems.push(
      `expected tree-sitter ${record.claim.error ? 'ERROR/MISSING' : 'clean CST'}, got ${hasError ? 'ERROR/MISSING' : 'clean CST'}`,
    );
  if (
    (record.claim.psiClean ?? !record.claim.error) &&
    (record.scriptPsiErrors ?? record.psiErrors) > 0
  ) {
    problems.push(
      `positive input is rejected by PSI (${record.scriptPsiErrors ?? record.psiErrors} errors)`,
    );
  }
  return problems;
}

/** Existing claims must come from exact base-corpus bytes, not the candidate's claims. */
function gate(
  records,
  label,
  { base = null, expected = null, conformance = false, baseClaims = null, reference = false } = {},
) {
  const failures = [];
  const existing = [];
  const existingClaims = [];
  const fingerprints = baseClaims && new Set(Object.values(baseClaims).map(corpus.fingerprint));
  for (const record of records) {
    for (const [grammar, result] of Object.entries(record.results)) {
      if (['oracle-failure', 'harness-error'].includes(result.verdict)) {
        failures.push({ path: record.path, kind: result.verdict, grammar, message: result.key });
      }
    }
    const problems = claimProblems(record, label);
    const priorProblems = base ? claimProblems(record, base) : [];
    const knownClaim = record.claim && fingerprints?.has(corpus.fingerprint(record.claim));
    const expectedClaim = expected?.claims?.[record.path];
    for (const problem of problems) {
      const allowed =
        !conformance &&
        (reference ||
          (base && knownClaim && priorProblems.includes(problem)) ||
          (!base &&
            expectedClaim?.sha256 === record.sha256 &&
            expectedClaim.problems.includes(problem)));
      if (allowed) existingClaims.push({ path: record.path, message: problem });
      else
        failures.push({
          path: record.path,
          kind: 'corpus-claim',
          grammar: label,
          message: `${record.claim.name}: ${problem}`,
        });
    }
    const result = record.results[label];
    const observed = expected?.observations?.[record.path];
    const prior = base
      ? record.results[base]
      : observed?.sha256 === record.sha256
        ? observed.result
        : null;
    if (conformance && !['oracle-failure', 'harness-error'].includes(result.verdict) &&
        (result.verdict !== 'ok' || result.hasError === true || record.psiErrors > 0)) {
      failures.push({ path: record.path, kind: 'difference', grammar: label,
        message: 'Strict conformance requires a clean original-file PSI match: ' + result.verdict });
      continue;
    }
    if (agreement(result)) {
      if (prior && agreement(prior) && result.treeHash !== prior.treeHash) {
        failures.push({
          path: record.path,
          kind: 'changed-cst',
          grammar: label,
          message:
            'Complete normalized comparison, recovery or source spans changed despite agreement; inspect the input with both grammars',
        });
      }
      continue;
    }
    if (['oracle-failure', 'harness-error'].includes(result.verdict)) continue;

    if (
      !conformance &&
      (reference || (prior && !agreement(prior) && signature(prior) === signature(result)))
    ) {
      existing.push(record.path);
    } else
      failures.push({
        path: record.path,
        kind: 'difference',
        grammar: label,
        message: prior?.key === result.key && prior?.treeHash !== result.treeHash
          ? `Complete comparison changed behind the same first bucket: ${result.key || result.verdict}`
          : result.key || result.verdict,
      });
  }
  return { failures, existing, existingClaims };
}

function snapshot(current, records, label, grammar) {
  const status = gate(records, label, { reference: true });
  if (status.failures.length)
    throw new Error('Cannot update expectations from an execution failure');
  return {
    schemaVersion: 2,
    context: current.context,
    grammar,
    observations: Object.fromEntries(
      records.map((record) => [
        record.path,
        {
          sha256: record.sha256,
          result: {
            verdict: record.results[label].verdict,
            ...(record.results[label].key ? { key: record.results[label].key } : {}),
            treeHash: record.results[label].treeHash,
          },
        },
      ]),
    ),
    claims: Object.fromEntries(
      records
        .filter((r) => claimProblems(r, label).length)
        .map((r) => [r.path, { sha256: r.sha256, problems: claimProblems(r, label) }]),
    ),
  };
}
function loadExpected(file, context) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.schemaVersion !== 2 || !data.observations || digest(data.context) !== digest(context)) {
    throw new Error(
      'Expected snapshot does not match these inputs/tools. Review and update it explicitly; count registries are unsupported.',
    );
  }
  return data;
}
function checkOutput(out, root, files) {
  if (files.some((file) => inside(canonical(out), canonical(confined(root, file)))))
    throw new Error('Output directory would replace corpus inputs');
}
module.exports = {
  digest,
  hashFile,
  identity,
  runtimeIdentity,
  validateShard,
  complete,
  gate,
  snapshot,
  loadExpected,
  checkOutput,
  signature,
  claimProblems,
  toolIdentity,
};
