/**
 * Cross-validation runner: iterates fixture files, parses with tree-sitter,
 * compares against PSI reference trees.
 * @module runner
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { parseFiles, parseOne } = require('./ts-driver');
const { listFixtureNames, fixturePaths } = require('./fixture-files');
const { parseTreeSitter } = require('./parser-ts');
const { parsePsi } = require('./parser-psi');
const { normalizeTs, normalizePsi } = require('./normalizer');
const { compareTrees, Status } = require('./comparator');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// FileResult
// ---------------------------------------------------------------------------

/**
 * Result of validating a single fixture file.
 */
class FileResult {
  /**
   * @param {string} filename - Base name without extension.
   * @param {string} status - Status enum value.
   * @param {import('./comparator').CompareResult|null} compareResult
   * @param {string|null} tsErrorDetail - Detail if tree-sitter had errors.
   * @param {string|null} errorMessage - General error message if something failed.
   */
  constructor(filename, status, compareResult = null, tsErrorDetail = null, errorMessage = null) {
    this.filename = filename;
    this.status = status;
    this.compareResult = compareResult;
    this.tsErrorDetail = tsErrorDetail;
    this.errorMessage = errorMessage;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run tree-sitter parse on a .kt file and return its stdout.
 * Returns null if an error occurs during execution.
 *
 * @param {string} filePath - Absolute path to the .kt file.
 * @returns {{ output: string, hasErrors: boolean } | null}
 */
function _runTreeSitterParse(filePath) { return parseOne(filePath); }

/**
 * Get all .kt fixture files (sorted by basename).
 * @returns {string[]} Array of absolute paths.
 */
function _getFixtureFiles() { return listFixtureNames(FIXTURES_DIR).map(name => fixturePaths(name, FIXTURES_DIR).ktFile); }

// ---------------------------------------------------------------------------
// runAll
// ---------------------------------------------------------------------------

/**
 * Run cross-validation on all fixture files.
 * @returns {FileResult[]}
 */
function runAll() {
  const files = _getFixtureFiles();
  const parsed = parseFiles(files);
  const results = [];

  for (const ktFile of files) {
    const basename = path.relative(FIXTURES_DIR, ktFile).split(path.sep).join('/').replace(/\.kts?$/, '');

    // Find corresponding PSI .txt file
    const psiFile = path.join(FIXTURES_DIR, basename + '.txt');
    if (!fs.existsSync(psiFile)) {
      results.push(new FileResult(
        basename,
        Status.PSI_PARSE_ERROR,
        null,
        null,
        'No corresponding .txt PSI file found',
      ));
      continue;
    }

    try {
      // 1. Run tree-sitter parse
      const tsResult = parsed.get(ktFile);

      if (!tsResult) {
        results.push(new FileResult(
          basename,
          Status.TS_PARSE_ERROR,
          null,
          'tree-sitter parse failed to execute',
          null,
        ));
        continue;
      }

      // 2. Check for tree-sitter parse errors
      if (tsResult.hasErrors) {
        results.push(new FileResult(
          basename,
          Status.TS_PARSE_ERROR,
          null,
          tsResult.output.slice(0, 500),
          null,
        ));
        continue;
      }

      // 3. Parse tree-sitter output into Node tree
      const tsTree = parseTreeSitter(tsResult.output);

      // 4. Parse PSI .txt file into Node tree
      const psiText = fs.readFileSync(psiFile, 'utf-8');
      const psiTree = parsePsi(psiText);

      // 5. Normalize both trees
      const tsNorm = normalizeTs(tsTree);
      const psiNorm = normalizePsi(psiTree);

      // 6. Compare
      const compareResult = compareTrees(tsNorm, psiNorm);

      results.push(new FileResult(
        basename,
        compareResult.status,
        compareResult,
        null,
        null,
      ));
    } catch (err) {
      throw new Error(`PSI comparison failed for ${basename}: ${err.message}`);
    }
  }

  return results;
}

/**
 * Run cross-validation on a single fixture file (for debug mode).
 * @param {string} name - Fixture base name (without extension).
 * @returns {{ tsTree: import('./models').Node|null, psiTree: import('./models').Node|null, tsNorm: import('./models').Node|null, psiNorm: import('./models').Node|null, result: FileResult }}
 */
function runOne(name) {
  const { ktFile, psiFile } = fixturePaths(name, FIXTURES_DIR);

  if (!fs.existsSync(ktFile)) {
    throw new Error(`Fixture not found: ${ktFile}`);
  }
  if (!fs.existsSync(psiFile)) {
    throw new Error(`PSI file not found: ${psiFile}`);
  }

  // Parse tree-sitter
  const tsResult = _runTreeSitterParse(ktFile);
  let tsTree = null;
  let tsNorm = null;

  if (tsResult && !tsResult.hasErrors) {
    tsTree = parseTreeSitter(tsResult.output);
    tsNorm = normalizeTs(tsTree);
  }

  // Parse PSI
  const psiText = fs.readFileSync(psiFile, 'utf-8');
  const psiTree = parsePsi(psiText);
  const psiNorm = normalizePsi(psiTree);

  // Compare
  const compareResult = compareTrees(tsNorm, psiNorm);
  const result = new FileResult(
    name,
    compareResult.status,
    compareResult,
    tsResult && tsResult.hasErrors ? tsResult.output.slice(0, 500) : null,
    null,
  );

  return { tsTree, psiTree, tsNorm, psiNorm, result };
}

module.exports = { runAll, runOne, FileResult };
