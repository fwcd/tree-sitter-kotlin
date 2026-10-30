/**
 * Proves the oracle is the parser behind the pinned Kotlin goldens: every
 * paired testData input, PSI-clean or not, must produce its golden exactly.
 *
 * The corpus comes from `vendor-fixtures.js --oracle-corpus DIR`. Inputs are
 * trimmed as the upstream test trims them; a golden is compared without its
 * trailing whitespace, which the upstream assertion also ignores. A spec test
 * marked `EXCEPTION:` expects the compiler to throw and never compares its
 * golden, so it is reported as skipped, not compared.
 *
 * Usage: node tools/psi-oracle/verify.js [CORPUS_DIR] [--sample N]
 *
 * @module psi-oracle/verify
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { runOracle } = require('./oracle');

const DEFAULT_CORPUS = path.resolve(__dirname, '..', '..', 'local', 'psi-diff', 'corpora', 'testdata');

/**
 * @param {string} corpus - Directory written by `exportOracleCorpus`.
 * @param {{ sample?: number }} [options] - Every n-th entry only, for tests.
 * @returns {{ total: number, psiError: number, skipped: string[], mismatches: Array<{ id: string, reason: string }> }}
 */
function verifyCorpus(corpus, { sample = 1 } = {}) {
  const all = JSON.parse(fs.readFileSync(path.join(corpus, 'corpus.json'), 'utf8'))
    .filter((_, index) => index % sample === 0);
  const skipped = all.filter(entry => entry.expectsException).map(entry => entry.id);
  const entries = all.filter(entry => !entry.expectsException);
  const out = path.join(corpus, '..', `${path.basename(corpus)}.oracle`);
  fs.rmSync(out, { recursive: true, force: true });
  const index = runOracle(entries.map(entry => entry.source), { root: corpus, out, trim: true });
  const mismatches = [];
  entries.forEach((entry, i) => {
    const result = index[i];
    if (!result || result.path !== entry.source) {
      mismatches.push({ id: entry.id, reason: 'index misaligned' });
    } else if (result.failure) {
      mismatches.push({ id: entry.id, reason: result.failure });
    } else {
      const actual = fs.readFileSync(path.join(out, result.dump), 'utf8');
      const expected = fs.readFileSync(path.join(corpus, entry.golden), 'utf8').trimEnd();
      if (actual !== expected) mismatches.push({ id: entry.id, reason: 'dump differs from golden' });
      else if ((result.psiErrors > 0) !== entry.psiError) mismatches.push({ id: entry.id, reason: 'error count disagrees' });
    }
  });
  return { total: entries.length, psiError: entries.filter(entry => entry.psiError).length, skipped, mismatches };
}

module.exports = { verifyCorpus, DEFAULT_CORPUS };

if (require.main === module) {
  const args = process.argv.slice(2);
  let corpus = DEFAULT_CORPUS, sample = 1;
  while (args.length) {
    const value = args.shift();
    if (value === '--sample') sample = Number(args.shift());
    else corpus = path.resolve(value);
  }
  const report = verifyCorpus(corpus, { sample });
  for (const mismatch of report.mismatches) console.error(`${mismatch.id}: ${mismatch.reason}`);
  console.log(JSON.stringify({ total: report.total, psiError: report.psiError, skipped: report.skipped,
    mismatches: report.mismatches.length }));
  if (report.mismatches.length) process.exitCode = 1;
}
