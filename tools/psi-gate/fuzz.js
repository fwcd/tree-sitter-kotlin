'use strict';

const fs = require('fs');
const path = require('path');
const { runIfMain } = require('../cli');
const { positive, resetOutput, inside, canonical, confined, sha256 } = require('../safety');
const { listInputs } = require('../cross-validation/diff-run');
const { generated, mutated } = require('./fuzz-generate');
const { InspectorPool } = require('./fuzz-compare');
const state = require('./fuzz-state');
const { BudgetExceeded, remaining } = require('./fuzz-budget');
const { Coverage } = require('./fuzz-coverage');
const { prepareGrammar } = require('./main');
const TRACKED_BUGS = path.join(__dirname, 'grammar-bugs');
const ROOT = path.resolve(__dirname, '../..');
const loadedComparison = state.comparisonIdentity();

const HELP = `Usage: npm run psi-fuzz -- [options]
  --seed TEXT              Deterministic generation/mutation seed
  --sources FILE           Research seed manifest (seeds + knownGrammarRejectionSeeds)
  --corpus DIR --list FILE  Real source inputs, optionally an exact relative list
  --fixtures DIR           Kotlin PSI testData inputs (still checked by the live oracle)
  --base REF               Explicit local revision; default upstream merge-base
  --upstream REMOTE|URL     Override upstream, or PSI_GATE_UPSTREAM
  --upstream-branch NAME    Override branch, or PSI_GATE_UPSTREAM_BRANCH
  --grammar DIR --runtime DIR  Already-built grammar/runtime instead of preparation
  --out DIR                Owned run output; default local/psi-fuzz
  --bugs DIR               Local defect ledger; default local/psi-fuzz-bugs
  --promote                Write completed <=1000-byte cases to the tracked corpus
  --max-inputs N           Attempt limit; default 400 (continuous: unlimited unless set)
  --max-seconds N          Whole sampling/minimization budget; default 900
  --continuous             Stop at stability, time budget, or explicit input limit
  --stable-window N        Consecutive PSI-valid inputs without novelty; default 5000
  --depth N                Recursive expression depth, 1..8; default 4
  --jobs N                 Oracle/parser workers, 1..2; default 1
  --batch-size N           Oracle batches, 1..64; default 16
  --min-rounds N           Reduction rounds per phase, 1..100; default 20
  --min-candidates N       Candidates per reduction round, 1..128; default 32
  --min-seconds N          Per-representative budget; default 20
PSI-invalid candidates are discarded. Every stored representative is reverified.
Named mismatches require normalizer/AST triage; native rejections get a permanent ledger case.
Budget exhaustion is not a claim of normalizer completion. Rerun after rule changes.
`;
function argumentsOf(argv) {
  const options = { seed: 'normalizer-fuzz', out: path.join(ROOT, 'local/psi-fuzz'),
    bugs: path.join(ROOT, 'local/psi-fuzz-bugs'), maxInputs: 400, maxSeconds: 900,
    stableWindow: 5000, jobs: 1, depth: 4, batchSize: 16, minRounds: 20, minCandidates: 32, minSeconds: 20 };
  const numbers = { '--max-inputs': ['maxInputs', 10000000], '--max-seconds': ['maxSeconds', 86400],
    '--stable-window': ['stableWindow', 10000000], '--depth': ['depth', 8],
    '--jobs': ['jobs', 2], '--batch-size': ['batchSize', 64], '--min-rounds': ['minRounds', 100],
    '--min-candidates': ['minCandidates', 128], '--min-seconds': ['minSeconds', 3600] };
  const paths = { '--sources': 'sources', '--corpus': 'corpus', '--list': 'list',
    '--fixtures': 'fixtures', '--grammar': 'grammar', '--runtime': 'runtime', '--out': 'out', '--bugs': 'bugs' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--continuous' || flag === '--promote') { options[flag.slice(2)] = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (numbers[flag]) { const [key, max] = numbers[flag]; options[key] = positive(value, flag, max); }
    else if (paths[flag]) options[paths[flag]] = path.resolve(value);
    else if (flag === '--seed') options.seed = value;
    else if (flag === '--base') options.base = value;
    else if (flag === '--upstream') options.upstream = value;
    else if (flag === '--upstream-branch') options.upstreamBranch = value;
    else throw new Error(`Unknown fuzz option: ${flag}; use --help`);
  }
  if (options.continuous && !argv.includes('--max-inputs')) options.maxInputs = Infinity;
  if (options.promote) {
    if (argv.includes('--bugs')) throw new Error('--promote writes the tracked corpus; omit --bugs');
    options.bugs = TRACKED_BUGS;
  }
  if (options.list && !options.corpus) throw new Error('--list requires --corpus');
  if (options.grammar && !options.runtime) options.runtime = __dirname;
  return options;
}
function sourceInputs(options) {
  const inputs = [];
  const add = (root, file, origin) => {
    const extension = path.extname(file);
    if (!['.kt', '.kts'].includes(extension)) throw new Error(`Not a Kotlin input: ${file}`);
    const bytes = fs.readFileSync(confined(root, file));
    inputs.push({ text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''), extension,
      sourceRoot: root, origin: { ...origin, path: file, sourceSha256: sha256(bytes) } });
  };
  if (options.sources) {
    const data = JSON.parse(fs.readFileSync(options.sources, 'utf8'));
    for (const entry of [...(data.seeds || []), ...(data.knownGrammarRejectionSeeds || [])])
      add(entry.root, entry.path, { kind: 'corpus', repo: entry.repo, commit: entry.commit });
  }
  for (const root of [options.corpus, options.fixtures].filter(Boolean)) {
    const files = listInputs({ root, list: root === options.corpus ? options.list : null });
    for (const file of files) add(root, file, { kind: root === options.fixtures ? 'psi-fixture' : 'corpus' });
  }
  return inputs;
}
function render(result) {
  const out = ['# Differential normalizer fuzzing', '',
    `Seed: ${result.seed}. ${result.metrics.attempted} attempts; ${result.metrics.accepted} PSI-valid; ` +
    `${result.metrics.rejected} discarded; ${result.metrics.matches} normalized matches.`,
    `Stop: ${result.stopReason}; stable valid-input window ${result.stableCount}/${result.stableWindow}.`,
    'Named mismatches need normalizer/AST triage. Grammar entries are PSI-clean native rejections.', ''];
  if (result.coverage) {
    const c = result.coverage, v = c.views.all.summary;
    out.push(`Coverage: ${v.nativeTypes}/${v.nativeTotal} named native types; ` +
      `${v.psiComposites}/${v.psiCompositeTotal} PSI composites; ${v.psiTokens}/${v.psiTokenTotal} PSI lexer types; ` +
      `${v.nativePairs} native and ${v.psiPairs} PSI parent-child contexts.`,
      'Intended/observed sets, frequencies, native-clean view and non-emitted entries: coverage.json.', '');
  }
  for (const bucket of result.buckets) {
    out.push(`## ${bucket.kind}: ${bucket.id} (${bucket.count} files)`, '',
      '`' + JSON.stringify(bucket.signature).replace(/`/g, 'ˋ') + '`', '',
      `Reproduced: ${bucket.reproduced || false}; ${bucket.originalBytes} → ${Buffer.byteLength(bucket.text || '')} bytes.`, '',
      '```kotlin', (bucket.text || '').trimEnd(), '```', '');
  }
  return out.join('\n');
}
async function run(options) {
  if (canonical(options.bugs) === canonical(TRACKED_BUGS) && !options.promote)
    throw new Error('Writing the tracked grammar corpus requires --promote; use a local --bugs directory');
  const inputs = sourceInputs(options);
  for (const root of [...new Set([options.corpus, options.fixtures, ...inputs.map(input => input.sourceRoot)].filter(Boolean))])
    if (inside(canonical(root), canonical(options.out)) || inside(canonical(options.out), canonical(root)))
      throw new Error('Fuzz output and source directories must be separate');
  if (inside(canonical(options.out), canonical(options.bugs)) || inside(canonical(options.bugs), canonical(options.out)))
    throw new Error('Run output and permanent grammar-bug corpus must be separate');
  if (state.comparisonIdentity() !== loadedComparison)
    throw new Error('Comparison changed during startup; rerun');
  const release = state.acquireLock(options.out + '.lock');
  try { return await runPrepared(options, inputs); }
  finally { release(); }
}
async function runPrepared(options, inputs) {
  resetOutput(options.out);
  const prepared = options.grammar
    ? { grammar: options.grammar, runtime: options.runtime, revision: 'external-built-grammar' }
    : await prepareGrammar({ home: path.join(ROOT, 'local/psi-fuzz-cache'),
      base: options.base, upstream: options.upstream, upstreamBranch: options.upstreamBranch });
  const started = Date.now(), deadline = started + options.maxSeconds * 1000;
  const context = state.identity(prepared), ledgerValidation = [], buckets = new Map(), coverage = new Coverage();
  const metrics = { attempted: 0, accepted: 0, rejected: 0, matches: 0, grammarInputs: 0 };
  const minOptions = { candidates: options.minCandidates, rounds: options.minRounds, seconds: options.minSeconds, deadline };
  let inspector, existingLedger = [], stableCount = 0, generatedIndex = 0, mixedIndex = 0, stopReason = 'input-budget';
  const verifyContext = () => {
    if (state.identity(prepared) !== context || state.comparisonIdentity() !== loadedComparison)
      throw new Error('Grammar/comparison changed during fuzzing; rerun with the same seed');
  };
  const remember = (bucket, min) => {
    Object.assign(bucket, { text: min.text, reproduced: true, timeBoundReached: min.exhausted,
      expectedPsi: min.result.expectedPsi, expectedNormalized: min.result.expectedNormalized,
      actualNormalized: min.result.actualNormalized, nativeTree: min.result.nativeTree });
  };
  const finishBucket = async bucket => {
    if (bucket.reproduced && !bucket.timeBoundReached) return;
    remaining(deadline);
    const input = bucket.text ? { ...bucket.input, text: bucket.text } : bucket.input;
    remember(bucket, await state.minimize(input, bucket.id, inspector, minOptions));
  };
  const next = () => {
    if (metrics.attempted < inputs.length) return inputs[metrics.attempted];
    const turn = mixedIndex++;
    if (inputs.length && turn % 3 === 0)
      return mutated(inputs[Math.floor(turn / 3) % inputs.length], options.seed, turn);
    const input = generated(options.seed, generatedIndex++, options.depth, coverage);
    coverage.target(input.origin);
    return input;
  };
  let timedOut = false;
  try {
    remaining(deadline);
    existingLedger = state.readLedger(options.bugs);
    remaining(deadline);
    inspector = new InspectorPool({ ...prepared, out: options.out }, options.jobs);
    for (let i = 0; i < existingLedger.length; i += options.batchSize) {
      remaining(deadline);
      const entries = existingLedger.slice(i, i + options.batchSize);
      const results = await inspector.inspect(entries.map(entry => state.readGrammarInput(options.bugs, entry)), { deadline });
      for (let j = 0; j < results.length; j++) {
        remaining(deadline);
        const expected = JSON.parse(fs.readFileSync(confined(options.bugs, entries[j].expected), 'utf8'));
        if (!results[j].accepted || JSON.stringify(results[j].expectedPsi) !== JSON.stringify(expected.psi))
          throw new Error(`Grammar ledger PSI expectation changed: ${entries[j].id}`);
        ledgerValidation.push({ id: entries[j].id, stillGrammarDefect: results[j].grammarError });
      }
    }
    while (metrics.attempted < options.maxInputs) {
      remaining(deadline);
      verifyContext();
      const batch = [];
      for (let i = 0; i < options.batchSize && metrics.attempted < options.maxInputs; i++) {
        remaining(deadline);
        batch.push(next()); metrics.attempted++;
      }
      const results = await inspector.inspect(batch, { deadline });
      for (let i = 0; i < results.length; i++) {
        remaining(deadline);
        const result = results[i], input = batch[i];
        if (!result.accepted) { metrics.rejected++; continue; }
        metrics.accepted++;
        coverage.add(result, input.origin);
        if (!result.classes.length) metrics.matches++;
        let novel = false;
        if (result.grammarError) metrics.grammarInputs++;
        for (const c of result.classes) {
          remaining(deadline);
          let bucket = buckets.get(c.id);
          if (!bucket) {
            bucket = { ...c, kind: result.grammarError ? 'grammar' : 'normalization-or-AST', count: 0,
              input: { ...input, text: result.text }, text: result.text, originalBytes: Buffer.byteLength(result.text) };
            buckets.set(c.id, bucket); novel = true;
          }
          bucket.count++;
          if (Buffer.byteLength(result.text) < (bucket.reproduced ? Buffer.byteLength(bucket.text) : bucket.originalBytes)) {
            bucket.input = { ...input, text: result.text }; bucket.originalBytes = Buffer.byteLength(result.text);
            bucket.reproduced = false;
          }
          if (result.grammarError) {
            const min = await state.minimize({ ...input, text: result.text }, c.id, inspector, minOptions);
            if (!bucket.reproduced || Buffer.byteLength(min.text) < Buffer.byteLength(bucket.text)) remember(bucket, min);
            remaining(deadline);
            const saved = state.saveGrammarBug(options.bugs, min, { seed: options.seed, revision: prepared.revision,
              signature: c.signature, origin: input.origin, promote: options.promote, deadline });
            bucket.ledgerId = saved.id; if (saved.added) novel = true;
          }
        }
        stableCount = novel || (!result.grammarError && result.classes.length) ? 0 : stableCount + 1;
      }
      for (const bucket of [...buckets.values()].filter(b => !b.reproduced || b.timeBoundReached).slice(0, 10))
        await finishBucket(bucket);
      fs.writeFileSync(path.join(options.out, 'progress.json'), JSON.stringify({
        partial: true, seed: options.seed, context, metrics, stableCount,
        buckets: [...buckets.values()].map(b => ({ id: b.id, signature: b.signature, kind: b.kind,
          count: b.count, originalBytes: b.originalBytes, text: b.text, reproduced: b.reproduced || false,
          timeBoundReached: b.timeBoundReached })),
      }, null, 2) + '\n');
      coverage.write(options.out);
      process.stderr.write(`${metrics.attempted} attempts; ${metrics.accepted} valid; ${buckets.size} clusters\n`);
      if (stableCount >= options.stableWindow) { stopReason = 'stable-window'; break; }
    }
    for (const bucket of buckets.values()) await finishBucket(bucket);
    remaining(deadline);
  } catch (error) {
    if (!(error instanceof BudgetExceeded)) throw error;
    timedOut = true; stopReason = 'time-budget';
  } finally { inspector?.close(); }
  if (!metrics.accepted && !timedOut) throw new Error('No PSI-valid inputs; increase the budget or choose valid seeds');
  verifyContext();
  for (const bucket of buckets.values()) delete bucket.input;
  const pending = [...buckets.values()].filter(b => !b.reproduced || b.timeBoundReached).length;
  const partial = timedOut || pending > 0 || ledgerValidation.length !== existingLedger.length;
  const result = { schemaVersion: 1, partial, exitCode: partial ? 2 : 0, seed: options.seed, context,
    grammar: prepared.revision, stableWindow: options.stableWindow, stableCount, stopReason, metrics,
    ledgerValidation, coverage: coverage.snapshot(), seconds: (Date.now() - started) / 1000,
    buckets: [...buckets.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)) };
  fs.writeFileSync(path.join(options.out, 'buckets.json'), JSON.stringify(result, null, 2) + '\n');
  coverage.write(options.out);
  fs.writeFileSync(path.join(options.out, 'report.md'), render(result));
  console.log(JSON.stringify({ out: options.out, pendingRepresentatives: pending, ...metrics,
    clusters: result.buckets.length, stopReason, seconds: result.seconds }));
  return result;
}
async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return; }
  return run(argumentsOf(argv));
}
module.exports = { argumentsOf, sourceInputs, render, run };
runIfMain(module, main);
