'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {runIfMain} = require('../cli');
const {positive, resetOutput, inside, canonical, confined, sha256} = require('../safety');
const {listInputs} = require('../cross-validation/diff-execute');
const {generated, mutated} = require('./fuzz-generate');
const {InspectorPool} = require('./fuzz-compare');
const state = require('./fuzz-state');
const findings = require('./fuzz-findings');
const {BudgetExceeded, remaining} = require('./fuzz-budget');
const {Coverage} = require('./fuzz-coverage');
const {loadConfig} = require('./config');
const {fetchAll} = require('../psi-oracle/fetch');
const {oracleIdentity} = require('./expectations');
const {isResourceError, resourceMessage} = require('../resource');
const ROOT = path.resolve(__dirname, '../..');
const TRACKED = path.join(__dirname, 'grammar-bugs');
function argumentsOf(argv, inherited = {}) {
  const options = {seed: 'psi-search', maxInputs: 400, maxSeconds: 900, stableWindow: 5000,
    jobs: 1, depth: 4, batchSize: 16, minRounds: 20, minCandidates: 32, minSeconds: 20, ...inherited};
  const numbers = {'--max-inputs': ['maxInputs', 10000000], '--max-seconds': ['maxSeconds', 86400],
    '--stable-window': ['stableWindow', 10000000], '--depth': ['depth', 8], '--jobs': ['jobs', 2],
    '--batch-size': ['batchSize', 64], '--min-rounds': ['minRounds', 100],
    '--min-candidates': ['minCandidates', 128], '--min-seconds': ['minSeconds', 3600],
    '--timeout-ms': ['timeoutMs', 3600000], '--parse-timeout-ms': ['parseTimeoutMs', 60000]};
  const paths = {'--sources': 'sources', '--corpus': 'corpus', '--list': 'list', '--fixtures': 'fixtures',
    '--out': 'out', '--known-ledger': 'knownLedger', '--config': 'configFile', '--home': 'home'};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (['--promote', '--base', '--upstream', '--upstream-branch', '--grammar', '--runtime', '--bugs', '--git-timeout-ms'].includes(flag))
      throw Error(flag + ' was removed; search uses the current binding and never promotes cases');
    if (flag === '--continuous') {options.continuous = true; continue;}
    const value = argv[++i]; if (!value || value.startsWith('--')) throw Error(flag + ' requires a value');
    if (numbers[flag]) {const [key, max] = numbers[flag]; options[key] = positive(value, flag, max);}
    else if (paths[flag]) options[paths[flag]] = path.resolve(value);
    else if (flag === '--seed') options.seed = value;
    else throw Error('Unknown search option: ' + flag);
  }
  if (options.continuous && !argv.includes('--max-inputs')) options.maxInputs = Infinity;
  if (options.configFile) options.config = loadConfig(options.configFile);
  if (options.list && !options.corpus) throw Error('--list requires --corpus');
  return options;
}
function sourceInputs(options) {
  const inputs = [];
  const add = (root, file, origin) => {
    const extension = path.extname(file); if (!['.kt', '.kts'].includes(extension)) throw Error('Not a Kotlin input: ' + file);
    const bytes = fs.readFileSync(confined(root, file));
    inputs.push({text: new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes), extension,
      sourceRoot: root, origin: {...origin, path: file, sourceSha256: sha256(bytes)}});
  };
  if (options.sources) {
    const data = JSON.parse(fs.readFileSync(options.sources));
    for (const entry of [...(data.seeds || []), ...(data.knownGrammarRejectionSeeds || [])])
      add(entry.root, entry.path, {kind: 'corpus', repo: entry.repo, commit: entry.commit});
  }
  for (const root of [options.corpus, options.fixtures].filter(Boolean))
    for (const file of listInputs({root, list: root === options.corpus ? options.list : null}))
      add(root, file, {kind: 'source-seed'});
  return inputs;
}
async function run(options = {}) {
  options = {...argumentsOf([]), ...options};
  if (options.promote || options.base || options.upstream) throw Error('Historical/promoted search was removed');
  options.root ||= ROOT; options.config ||= loadConfig();
  options.out ||= fs.mkdtempSync(path.join(os.tmpdir(), 'psi-suspects-'));
  const inputs = sourceInputs(options);
  const protectedRoots = [path.join(options.root, 'tools/psi-gate/corpus'),
    path.join(options.root, 'tools/psi-gate/grammar-bugs'), ...inputs.map(input => input.sourceRoot)];
  for (const root of protectedRoots)
    if (inside(canonical(root), canonical(options.out)) || inside(canonical(options.out), canonical(root)))
      throw Error('Search output and corpus/source directories must be separate');
  const progress = {started: Date.now(), phase: 'preparing oracle', metrics: {attempted: 0, accepted: 0}};
  const report = () => console.error(`fuzz: ${progress.phase}; ${progress.metrics.attempted} inputs tried, ${progress.metrics.accepted} PSI-valid; ${((Date.now() - progress.started) / 1000).toFixed(1)}s elapsed`);
  const limit = Number.isFinite(options.maxInputs) ? options.maxInputs : 'unlimited';
  console.error(`fuzz: preparing search (seed ${options.seed}, input limit ${limit}, time limit ${options.maxSeconds}s)`);
  const timer = setInterval(report, 10000); timer.unref();
  let release;
  try {
    await fetchAll({config: options.config});
    release = state.acquireLock(options.out + '.lock');
    return await search(options, inputs, progress);
  } finally {clearInterval(timer); release?.();}
}
async function search(options, inputs, progress) {
  resetOutput(options.out);
  const prepared = {grammar: options.grammar || options.root, runtime: options.runtime || options.root,
    out: options.out, config: options.config, timeoutMs: options.timeoutMs, parseTimeoutMs: options.parseTimeoutMs};
  const started = Date.now(), deadline = started + options.maxSeconds * 1000;
  const oracle = oracleIdentity(options.config), contextOf = () => sha256(JSON.stringify([state.identity(prepared), oracle]));
  const context = contextOf(), coverage = new Coverage(), buckets = new Map(), exact = new Map(), signatures = new Map();
  const ledgerValidation = [], metrics = {attempted: 0, accepted: 0, rejected: 0, matches: 0, mismatches: 0};
  const seenKnown = [];
  Object.assign(progress, {started, metrics, phase: 'checking known inputs'});
  let inspector, resource, stopReason = 'input-budget', stableCount = 0, generatedIndex = 0, mixedIndex = 0, partial = false;
  const verify = () => {if (contextOf() !== context) throw Error('Grammar/comparison changed during search; rerun');};
  const remember = async bucket => {
    if (bucket.min && !bucket.min.exhausted) return;
    remaining(deadline);
    bucket.min = await state.minimize(bucket.input, bucket.id, inspector,
      {seconds: options.minSeconds, candidates: options.minCandidates, rounds: options.minRounds, deadline});
  };
  try {
    remaining(deadline);
    inspector = new InspectorPool(prepared, options.jobs);
    const known = findings.knownInputs(options.root, options.knownLedger || options.bugs || TRACKED);
    for (let i = 0; i < known.length; i += options.batchSize) {
      const batch = known.slice(i, i + options.batchSize), values = await inspector.inspect(batch.map(x => x.input), {deadline});
      for (let j = 0; j < values.length; j++) {
        remaining(deadline); const result = values[j], ids = batch[j].ids;
        ledgerValidation.push({ids, accepted: result.accepted, mismatch: Boolean(result.classes?.length)});
        // A newly failing must-match corpus row is a regression, never a known-bug waiver.
        if (!result.accepted || !result.classes.length || batch[j].mustMatch) continue;
        const key = findings.observation(result); if (!exact.has(key)) exact.set(key, []); exact.get(key).push(...ids);
        for (const c of result.classes) {if (!signatures.has(c.id)) signatures.set(c.id, new Set()); for (const id of ids) signatures.get(c.id).add(id);}
      }
    }
    progress.phase = 'searching and minimizing';
    while (metrics.attempted < options.maxInputs) {
      remaining(deadline); verify(); const batch = [];
      for (let i = 0; i < options.batchSize && metrics.attempted < options.maxInputs; i++) {
        let input;
        if (metrics.attempted < inputs.length) input = inputs[metrics.attempted];
        else {const turn = mixedIndex++;
          input = inputs.length && turn % 3 === 0 ? mutated(inputs[Math.floor(turn / 3) % inputs.length], options.seed, turn)
            : generated(options.seed, generatedIndex++, options.depth, coverage); coverage.target(input.origin);}
        batch.push(input); metrics.attempted++;
      }
      const values = await inspector.inspect(batch, {deadline});
      for (let i = 0; i < values.length; i++) {
        remaining(deadline); const result = values[i];
        if (!result.accepted) {metrics.rejected++; continue;}
        metrics.accepted++; coverage.add(result, batch[i].origin);
        if (!result.classes.length) {metrics.matches++; stableCount++; continue;}
        metrics.mismatches++; let novel = false;
        const knownMatch = exact.get(findings.observation(result));
        if (knownMatch) {seenKnown.push({signatures: result.classes.map(c => c.id), known: knownMatch}); stableCount++; continue;}
        for (const c of result.classes) {
          let bucket = buckets.get(c.id);
          if (!bucket) {bucket = {...c, count: 0, input: {...batch[i], text: result.text}, originalBytes: Buffer.byteLength(result.text)};
            buckets.set(c.id, bucket); novel = true;}
          bucket.count++;
          if (Buffer.byteLength(result.text) < Buffer.byteLength(bucket.input.text)) {
            bucket.input = {...batch[i], text: result.text}; bucket.originalBytes = Buffer.byteLength(result.text); bucket.min = null;}
        }
        stableCount = novel ? 0 : stableCount + 1;
      }
      for (const bucket of buckets.values()) await remember(bucket);
      if (options.continuous && stableCount >= options.stableWindow) {stopReason = 'stable-window'; break;}
    }
    for (const bucket of buckets.values()) await remember(bucket);
  } catch (error) {
    if (!isResourceError(error)) throw error;
    resource = {code: error.code, message: error.message};
    partial = true; stopReason = error instanceof BudgetExceeded ? 'time-budget' : 'resource-budget';
  }
  finally {inspector?.close();}
  verify();
  if (!metrics.accepted && !partial) throw Error('No PSI-valid inputs; choose valid source seeds');
  const files = new Map(), suppressed = [...seenKnown], pending = [];
  for (const bucket of buckets.values()) {
    if (!bucket.min || bucket.min.exhausted || Buffer.byteLength(bucket.min.text) > 1000) {pending.push(bucket.id); continue;}
    const key = findings.observation(bucket.min.result), match = exact.get(key);
    if (match) {suppressed.push({id: bucket.id, known: match}); continue;}
    if (files.has(key.slice(0, 24))) continue;
    const possible = [...new Set(bucket.min.result.classes.flatMap(c => [...(signatures.get(c.id) || [])]))];
    const item = findings.record({out: options.out, seed: options.seed, context, bucket, min: bucket.min,
      knownMatch: {exact: [], possible}}); files.set(item.id, item);
  }
  partial ||= pending.length > 0;
  progress.phase = 'saving artifacts';
  const coverageResult = coverage.snapshot();
  const compactCoverage = {schemaVersion: coverageResult.schemaVersion, compiler: coverageResult.compiler,
    files: coverageResult.files, nativeRejected: coverageResult.nativeRejected,
    generatedFeatures: coverageResult.generatedFeatures, missing: coverageResult.views.all.missing,
    views: Object.fromEntries(Object.entries(coverageResult.views).map(([name, view]) => [name, {summary: view.summary}]))};
  fs.writeFileSync(path.join(options.out, 'coverage.json'), JSON.stringify(compactCoverage, null, 2) + '\n');
  const index = {schemaVersion: 1, seed: options.seed, context, oracle, syntaxNote: findings.syntaxNote,
    stopReason, partial, exitCode: partial ? 2 : 0, ...(resource ? {resource} : {}),
    metrics, budgets: {maxInputs: Number.isFinite(options.maxInputs) ? options.maxInputs : null, maxSeconds: options.maxSeconds,
      minSeconds: options.minSeconds, minRounds: options.minRounds, minCandidates: options.minCandidates},
    files: [...files.values()].sort((a,b) => a.id.localeCompare(b.id)), pending, suppressed,
    known: ledgerValidation, coverageRef: 'coverage.json', coverageSummary: coverageResult.views.all.summary};
  fs.writeFileSync(path.join(options.out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  for (const item of index.files) console.log(item.file);
  const seconds = (Date.now() - started) / 1000, indexPath = path.resolve(options.out, 'index.json');
  const limit = Number.isFinite(options.maxInputs) ? options.maxInputs : 'unlimited';
  console.error(`fuzz: ${partial ? 'partial' : 'complete'}; ${metrics.attempted} inputs tried (limit ${limit}), ${metrics.accepted} PSI-valid, ${index.files.length} suspects; stop ${stopReason}; ${seconds.toFixed(1)}/${options.maxSeconds}s time budget`);
  console.error(`Output: ${path.resolve(options.out)}`);
  console.error(`Index: ${indexPath}`);
  if (resource) console.error(resourceMessage('fuzz', resource));
  else if (partial) console.error('Search incomplete: inspect pending classes in the index and retry with larger time or reduction budgets.');
  return {...index, out: options.out, indexPath, seconds, coverage: coverageResult};
}
module.exports = {argumentsOf, sourceInputs, run};
runIfMain(module, argv => require('./main').main(['fuzz', ...argv]), {command: 'fuzz'});
