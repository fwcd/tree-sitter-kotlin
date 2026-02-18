/**
 * Markdown report generator for cross-validation results.
 * @module report
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Status, DiffKind } = require('./comparator');

const REPORT_PATH = path.join(__dirname, 'report.md');

// ---------------------------------------------------------------------------
// generateReport
// ---------------------------------------------------------------------------

/**
 * Generate a Markdown report from an array of FileResult objects.
 *
 * @param {import('./runner').FileResult[]} results
 * @returns {string} Markdown report.
 */
function generateReport(results) {
  const lines = [];

  // --- Summary ---
  const total = results.length;
  const tsErrors = results.filter(r => r.status === Status.TS_PARSE_ERROR).length;
  const psiErrors = results.filter(r => r.status === Status.PSI_PARSE_ERROR).length;
  const matches = results.filter(r => r.status === Status.MATCH).length;
  const mismatches = results.filter(r => r.status === Status.MISMATCH).length;
  const cleanParses = total - tsErrors;
  const matchRate = cleanParses > 0
    ? `${matches}/${cleanParses} (${(matches / cleanParses * 100).toFixed(1)}%)`
    : '0/0';

  lines.push('# Tree-Sitter Kotlin vs JetBrains PSI: Cross-Validation Report');
  lines.push('');
  lines.push('Structural comparison of tree-sitter-kotlin parse trees against');
  lines.push(`JetBrains PSI reference trees for all ${total} JetBrains fixture files.`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Total fixture files | ${total} |`);
  lines.push(`| Tree-sitter clean parses | ${cleanParses} |`);
  lines.push(`| Tree-sitter parse errors | ${tsErrors} |`);
  lines.push(`| **Structural matches** | **${matches}** |`);
  lines.push(`| Structural mismatches | ${mismatches} |`);
  lines.push(`| PSI parse errors | ${psiErrors} |`);
  lines.push('');
  lines.push(`**Match rate (among clean parses): ${matchRate}**`);
  lines.push('');

  // --- Methodology ---
  lines.push('## Mapping Methodology');
  lines.push('');
  lines.push('### Overall Approach');
  lines.push('');
  lines.push('This cross-validation compares parse trees produced by two independent Kotlin');
  lines.push('parsers: **tree-sitter-kotlin** (incremental, error-recovering) and the');
  lines.push('**JetBrains PSI** parser (the reference parser used by IntelliJ IDEA). The');
  lines.push('trees differ in node naming, nesting depth, and structural conventions.');
  lines.push('');
  lines.push('The comparison pipeline works as follows:');
  lines.push('');
  lines.push('1. **Parse** each Kotlin fixture with both parsers to produce raw trees.');
  lines.push('2. **Normalize** each tree by applying parser-specific rules (skip noise nodes,');
  lines.push('   rename node types, collapse wrappers, inject missing structural wrappers).');
  lines.push('3. **Compare** the two normalized trees recursively, recording structural');
  lines.push('   differences (name mismatches, extra children, missing children).');
  lines.push('');

  // --- Per-File Results ---
  lines.push('## Per-File Results');
  lines.push('');
  lines.push('| # | File | Status | Details |');
  lines.push('|---|------|--------|---------|');

  results.forEach((r, i) => {
    let details;
    if (r.status === Status.MATCH) {
      details = 'Structurally identical';
    } else if (r.status === Status.TS_PARSE_ERROR) {
      if (r.tsErrorDetail) {
        // Count ERROR/MISSING nodes
        const errorCount = (r.tsErrorDetail.match(/\(ERROR|\(MISSING/g) || []).length;
        if (errorCount > 0) {
          details = `${errorCount} ERROR/MISSING node(s) in tree-sitter output`;
        } else {
          details = 'tree-sitter parse error';
        }
      } else if (r.errorMessage) {
        details = r.errorMessage;
      } else {
        details = 'tree-sitter parse error';
      }
    } else if (r.status === Status.PSI_PARSE_ERROR) {
      details = r.errorMessage || 'PSI parse error';
    } else if (r.status === Status.MISMATCH) {
      const diffCount = r.compareResult ? r.compareResult.differences.length : 0;
      details = `${diffCount} difference(s)`;
    } else {
      details = '';
    }

    lines.push(`| ${i + 1} | ${r.filename} | ${r.status} | ${details} |`);
  });
  lines.push('');

  // --- Detailed Mismatches ---
  const mismatchResults = results.filter(r => r.status === Status.MISMATCH);

  if (mismatchResults.length > 0) {
    lines.push('## Detailed Mismatches');
    lines.push('');

    for (const r of mismatchResults) {
      if (!r.compareResult || r.compareResult.differences.length === 0) continue;

      lines.push(`### ${r.filename}`);
      lines.push('');

      for (const diff of r.compareResult.differences) {
        lines.push(`- **${diff.kind}** at \`${diff.path}\``);
        lines.push(`  - Expected: \`${diff.expected}\``);
        lines.push(`  - Actual: \`${diff.actual}\``);
      }
      lines.push('');
    }
  }

  // --- Common Patterns ---
  if (mismatchResults.length > 0) {
    lines.push('## Common Mismatch Patterns');
    lines.push('');

    // Count diff kinds across all mismatches
    const kindCounts = {};
    for (const r of mismatchResults) {
      if (!r.compareResult) continue;
      for (const diff of r.compareResult.differences) {
        kindCounts[diff.kind] = (kindCounts[diff.kind] || 0) + 1;
      }
    }

    lines.push('| Diff Kind | Count |');
    lines.push('|-----------|-------|');
    for (const [kind, count] of Object.entries(kindCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${kind} | ${count} |`);
    }
    lines.push('');

    // Most common name mismatches
    const nameMismatches = {};
    for (const r of mismatchResults) {
      if (!r.compareResult) continue;
      for (const diff of r.compareResult.differences) {
        if (diff.kind === DiffKind.NAME_MISMATCH) {
          const key = `${diff.actual} → ${diff.expected}`;
          nameMismatches[key] = (nameMismatches[key] || 0) + 1;
        }
      }
    }

    if (Object.keys(nameMismatches).length > 0) {
      lines.push('### Most Common Name Mismatches');
      lines.push('');
      lines.push('| Actual (TS) → Expected (PSI) | Count |');
      lines.push('|------------------------------|-------|');
      for (const [key, count] of Object.entries(nameMismatches).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${key} | ${count} |`);
      }
      lines.push('');
    }
  }

  // --- Parse Errors ---
  const tsErrorResults = results.filter(r => r.status === Status.TS_PARSE_ERROR);
  if (tsErrorResults.length > 0) {
    lines.push('## Tree-Sitter Parse Errors');
    lines.push('');
    lines.push(`${tsErrorResults.length} file(s) failed to parse cleanly with tree-sitter.`);
    lines.push('');

    for (const r of tsErrorResults) {
      lines.push(`- **${r.filename}**`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// saveReport
// ---------------------------------------------------------------------------

/**
 * Save a Markdown report string to disk.
 *
 * @param {string} report - The Markdown report content.
 * @returns {string} The absolute path the report was written to.
 */
function saveReport(report) {
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  return REPORT_PATH;
}

module.exports = { generateReport, saveReport };
