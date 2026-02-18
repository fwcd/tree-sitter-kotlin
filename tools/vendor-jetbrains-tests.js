#!/usr/bin/env node

/**
 * Generate tree-sitter corpus tests from JetBrains PSI fixtures.
 * Cross-platform Node.js replacement for vendor-jetbrains-tests.sh.
 *
 * Usage:
 *   node tools/vendor-jetbrains-tests.js [fixtures-dir]
 *
 * If no fixtures dir is specified, uses tools/cross-validation/fixtures/.
 *
 * @module vendor-jetbrains-tests
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_FIXTURES_DIR = path.join(__dirname, 'cross-validation', 'fixtures');
const EXCLUDED_FILE = path.join(__dirname, 'cross-validation', 'excluded.txt');
const CORPUS_DIR = path.join(REPO_ROOT, 'test', 'corpus', 'jetbrains');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load excluded fixture names from excluded.txt.
 * @returns {Set<string>}
 */
function loadExcluded() {
  const excluded = new Set();
  if (!fs.existsSync(EXCLUDED_FILE)) return excluded;

  const text = fs.readFileSync(EXCLUDED_FILE, 'utf-8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    // Handle lines with inline comments (e.g. "EnumInlinePublic.kt # comment")
    const name = trimmed.split(/\s+#/)[0].trim();
    // Strip .kt extension if present
    const baseName = name.endsWith('.kt') ? name.slice(0, -3) : name;
    if (baseName) excluded.add(baseName);
  }

  return excluded;
}

/**
 * Run tree-sitter parse on a file and return the S-expression output.
 * Returns null if execution fails entirely.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
function treeSitterParse(filePath) {
  try {
    const output = execFileSync('npx', ['tree-sitter', 'parse', filePath], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return output;
  } catch (err) {
    // tree-sitter may exit with non-zero on parse errors but still produce output
    if (err.stdout) {
      return err.stdout.toString();
    }
    return null;
  }
}

/**
 * Check if the S-expression output contains ERROR or MISSING nodes.
 * @param {string} sexp
 * @returns {boolean}
 */
function hasParseErrors(sexp) {
  return /\(ERROR/.test(sexp) || /\(MISSING "/.test(sexp);
}

/**
 * Transform a tree-sitter S-expression for use in corpus tests:
 * 1. Handle zero-length nodes (MISSING injection)
 * 2. Strip position annotations
 *
 * @param {string} sexp - Raw S-expression from tree-sitter parse.
 * @returns {string} Cleaned S-expression.
 */
function transformSexp(sexp) {
  // Step 1: Handle zero-length (MISSING) nodes.
  // A zero-length node looks like: (name [R, C] - [R, C]) where start == end.
  // These become: (name\n  (MISSING _alpha_identifier))
  // Pattern: (node_name [R1, C1] - [R2, C2]) where R1==R2 && C1==C2
  // Exclude source_file (an empty file has zero-length source_file, which is valid).
  let result = sexp.replace(
    /\((\w+) \[(\d+), (\d+)\] - \[(\d+), (\d+)\]\)/g,
    (match, name, r1, c1, r2, c2) => {
      if (r1 === r2 && c1 === c2 && name !== 'source_file') {
        // Zero-length node → inject MISSING child
        return `(${name}\n  (MISSING _alpha_identifier))`;
      }
      return match;
    },
  );

  // Step 2: Strip position annotations [R, C] - [R, C]
  result = result.replace(/ \[\d+, \d+\] - \[\d+, \d+\]/g, '');

  return result;
}

/**
 * Write a tree-sitter corpus test file.
 *
 * @param {string} name - Test name (fixture basename).
 * @param {string} ktSource - Kotlin source code.
 * @param {string} sexp - Cleaned S-expression.
 */
function writeCorpusTest(name, ktSource, sexp) {
  const separator = '==================';
  const content =
    `${separator}\n` +
    `${name}\n` +
    `${separator}\n` +
    `\n` +
    `${ktSource}\n` +
    `---\n` +
    `\n` +
    `${sexp.trim()}\n`;

  const outPath = path.join(CORPUS_DIR, name + '.txt');
  fs.writeFileSync(outPath, content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const fixturesDir = process.argv[2] || DEFAULT_FIXTURES_DIR;

  if (!fs.existsSync(fixturesDir)) {
    process.stderr.write(`Error: fixtures directory not found: ${fixturesDir}\n`);
    process.exit(1);
  }

  // Load excluded files
  const excluded = loadExcluded();
  process.stderr.write(`Loaded ${excluded.size} excluded files\n`);

  // Ensure corpus output directory exists
  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
  }

  // Clear existing generated corpus tests
  const existingTests = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith('.txt'));
  for (const f of existingTests) {
    fs.unlinkSync(path.join(CORPUS_DIR, f));
  }

  // Get all .kt files
  const ktFiles = fs.readdirSync(fixturesDir)
    .filter(f => f.endsWith('.kt'))
    .sort();

  let total = 0;
  let skippedErr = 0;
  let skippedExcluded = 0;
  let skippedParseError = 0;
  let generated = 0;

  for (const ktFile of ktFiles) {
    total++;
    const basename = path.basename(ktFile, '.kt');

    // Skip _ERR files (intentional parse error tests)
    if (basename.endsWith('_ERR')) {
      skippedErr++;
      continue;
    }

    // Skip excluded files
    if (excluded.has(basename)) {
      skippedExcluded++;
      continue;
    }

    // Parse with tree-sitter
    const ktPath = path.join(fixturesDir, ktFile);
    const sexp = treeSitterParse(ktPath);

    if (!sexp) {
      skippedParseError++;
      continue;
    }

    // Check for parse errors
    if (hasParseErrors(sexp)) {
      skippedParseError++;
      continue;
    }

    // Transform S-expression
    const cleanSexp = transformSexp(sexp);

    // Read Kotlin source
    const ktSource = fs.readFileSync(ktPath, 'utf-8');

    // Write corpus test
    writeCorpusTest(basename, ktSource, cleanSexp);
    generated++;
  }

  // Summary
  process.stderr.write(`\nDone!\n`);
  process.stderr.write(`  Total .kt files:     ${total}\n`);
  process.stderr.write(`  Skipped (_ERR):      ${skippedErr}\n`);
  process.stderr.write(`  Skipped (excluded):  ${skippedExcluded}\n`);
  process.stderr.write(`  Skipped (TS error):  ${skippedParseError}\n`);
  process.stderr.write(`  Generated tests:     ${generated}\n`);
  process.stderr.write(`  Output dir:          ${CORPUS_DIR}\n`);
}

main();
