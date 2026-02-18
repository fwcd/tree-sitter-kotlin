#!/usr/bin/env node

/**
 * CLI entry point for cross-validation.
 *
 * Usage:
 *   node tools/cross-validation/main.js             Run full validation, save report
 *   node tools/cross-validation/main.js --debug <name>  Debug a single fixture
 *   node tools/cross-validation/main.js --help       Show usage
 *
 * @module main
 */

'use strict';

const { runAll, runOne } = require('./runner');
const { generateReport, saveReport } = require('./report');
const { Status } = require('./comparator');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stderr.write(
    'Usage:\n' +
    '  node tools/cross-validation/main.js               Run full validation\n' +
    '  node tools/cross-validation/main.js --debug <name> Debug single fixture\n' +
    '  node tools/cross-validation/main.js --help         Show this help\n',
  );
  process.exit(0);
}

const debugIdx = args.indexOf('--debug');

if (debugIdx !== -1) {
  // --debug mode: print normalized trees side-by-side for one fixture
  const name = args[debugIdx + 1];
  if (!name) {
    process.stderr.write('Error: --debug requires a fixture name argument\n');
    process.exit(1);
  }

  try {
    const { tsTree, psiTree, tsNorm, psiNorm, result } = runOne(name);

    process.stderr.write(`\n=== Debug: ${name} ===\n\n`);
    process.stderr.write(`Status: ${result.status}\n\n`);

    process.stderr.write('--- Raw tree-sitter tree ---\n');
    process.stderr.write(tsTree ? tsTree.toString() : '(null — parse error)');
    process.stderr.write('\n\n');

    process.stderr.write('--- Raw PSI tree ---\n');
    process.stderr.write(psiTree ? psiTree.toString() : '(null)');
    process.stderr.write('\n\n');

    process.stderr.write('--- Normalized tree-sitter tree ---\n');
    process.stderr.write(tsNorm ? tsNorm.toString() : '(null — parse error)');
    process.stderr.write('\n\n');

    process.stderr.write('--- Normalized PSI tree ---\n');
    process.stderr.write(psiNorm ? psiNorm.toString() : '(null)');
    process.stderr.write('\n\n');

    if (result.compareResult && result.compareResult.differences.length > 0) {
      process.stderr.write('--- Differences ---\n');
      for (const diff of result.compareResult.differences) {
        process.stderr.write(`  ${diff.kind} at ${diff.path}\n`);
        process.stderr.write(`    expected: ${diff.expected}\n`);
        process.stderr.write(`    actual:   ${diff.actual}\n`);
      }
      process.stderr.write('\n');
    }

    if (result.tsErrorDetail) {
      process.stderr.write('--- Tree-sitter error detail ---\n');
      process.stderr.write(result.tsErrorDetail);
      process.stderr.write('\n\n');
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
} else {
  // Full validation mode
  process.stderr.write('Running cross-validation...\n');

  const results = runAll();

  // Summary to stderr
  const total = results.length;
  const matches = results.filter(r => r.status === Status.MATCH).length;
  const mismatches = results.filter(r => r.status === Status.MISMATCH).length;
  const tsErrors = results.filter(r => r.status === Status.TS_PARSE_ERROR).length;
  const psiErrors = results.filter(r => r.status === Status.PSI_PARSE_ERROR).length;
  const cleanParses = total - tsErrors;

  process.stderr.write(`\nResults: ${total} files\n`);
  process.stderr.write(`  MATCH:          ${matches}\n`);
  process.stderr.write(`  MISMATCH:       ${mismatches}\n`);
  process.stderr.write(`  TS_PARSE_ERROR: ${tsErrors}\n`);
  process.stderr.write(`  PSI_PARSE_ERROR: ${psiErrors}\n`);

  if (cleanParses > 0) {
    const rate = (matches / cleanParses * 100).toFixed(1);
    process.stderr.write(`\n  Match rate (clean parses): ${matches}/${cleanParses} (${rate}%)\n`);
  }

  // Generate and save report
  const report = generateReport(results);
  const reportPath = saveReport(report);
  process.stderr.write(`\nReport saved to: ${reportPath}\n`);
}
