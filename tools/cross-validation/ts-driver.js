/**
 * Drives `tree-sitter parse` over fixture files.
 *
 * The CLI is invoked once for the whole fixture set rather than once per file.
 * Parsing 681 fixtures costs tree-sitter about 0.3 s in total; the per-file
 * loop this replaces spent ~290 ms of Node/npx startup on each one, so over
 * 99% of the old wall time was process spawn. A `--no-batch` fallback keeps the
 * per-file path available, and batched runs fall back to it automatically if
 * the output cannot be aligned to the inputs.
 *
 * @module ts-driver
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Resolve the repository containing the parser and its native CLI. An explicit
// KOTLIN_GRAMMAR_ROOT can select another checkout for comparison.
const REPO_ROOT = require('../grammar-root').grammarRoot() || path.resolve(__dirname, '..', '..');
const TREE_SITTER_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'tree-sitter');

// `tree-sitter parse` prints one S-expression per input file, each starting in
// column 0, and follows the tree of any file that failed with a tab-separated
// "<path>\t<time>\t<rate>\t(ERROR …)" summary line. Splitting on a column-0 '('
// therefore yields exactly one chunk per input, in input order.
const CHUNK_START_RE = /^\(/;
const SUMMARY_LINE_RE = /^(\S.*?)\t.*?\t.*?\t(.*)$/;
const ERROR_NODE_RE = /\(ERROR|\(MISSING/g;

/**
 * Result of parsing one fixture with tree-sitter.
 *
 * `output` holds the printed tree only — the CLI's summary line is stripped,
 * since it embeds the first error as "(ERROR [r, c] - [r, c])" and would be
 * miscounted as an extra node by anything scanning the tree text.
 *
 * @typedef {{ output: string, hasErrors: boolean, errorCount: number } | null} TsParseResult
 */

/**
 * Count ERROR and MISSING nodes in a printed tree.
 * @param {string} tree - S-expression text for a single file.
 * @returns {number}
 */
function countErrorNodes(tree) {
  return (tree.match(ERROR_NODE_RE) || []).length;
}

/**
 * Build a parse result from a tree and the CLI's summary line for that file.
 *
 * Both signals are needed. `ts_node_string` prints named nodes only, so an
 * inserted anonymous token — `(MISSING "val")`, `(MISSING ">")` — appears
 * nowhere in the tree and is visible only in the summary line. Six of the 681
 * fixtures fail exactly that way, so dropping the summary would silently
 * reclassify them as clean parses.
 *
 * @param {string} tree - Printed tree for the file.
 * @param {boolean} summaryReportedError - Whether the CLI emitted an error
 *   summary line for this file.
 * @returns {{ output: string, hasErrors: boolean, errorCount: number }}
 */
function makeResult(tree, summaryReportedError) {
  const inTree = countErrorNodes(tree);
  return {
    output: tree,
    hasErrors: inTree > 0 || summaryReportedError,
    // Nodes the printed tree actually shows, floored at 1 when the CLI saw an
    // error we cannot see — "at least one" is the honest claim there.
    errorCount: Math.max(inTree, summaryReportedError ? 1 : 0),
  };
}

/**
 * Split CLI output into one chunk per input file.
 *
 * @param {string} stdout - Combined stdout of a parse run.
 * @returns {Array<{ tree: string, summaryPath: string|null, summaryReportedError: boolean }>}
 *   One entry per file, in input order.
 */
/**
 * Put a chunk's text into one canonical form: no trailing blank lines, exactly
 * one newline at the end.
 *
 * Without this a file's text depends on where it sat in the batch. The CLI
 * writes no blank line between trees, so splitting stdout on newlines leaves a
 * final empty element that only the *last* chunk absorbs: a file parsed last,
 * alone, or one-at-a-time ends with "\n", and the same file parsed anywhere
 * else does not. Every consumer of this text — the corpus shape hash, the PSI
 * s-expression parser — then sees a different value for an identical parse.
 *
 * @param {string} tree
 * @returns {string}
 */
function normaliseTree(tree) {
  return tree.replace(/\s*$/, '') + '\n';
}

function splitChunks(stdout) {
  const chunks = [];
  let current = null;

  const flush = () => {
    if (current === null) return;
    chunks.push({
      tree: normaliseTree(current.tree.join('\n')),
      summaryPath: current.summaryPath,
      summaryReportedError: current.summaryReportedError,
    });
  };

  for (const line of stdout.split('\n')) {
    if (CHUNK_START_RE.test(line)) {
      flush();
      current = { tree: [line], summaryPath: null, summaryReportedError: false };
      continue;
    }
    if (current === null) continue; // CLI chatter before the first tree

    const summary = SUMMARY_LINE_RE.exec(line);
    if (summary) {
      current.summaryPath = summary[1].trim();
      current.summaryReportedError = ERROR_NODE_RE.test(summary[2]);
      ERROR_NODE_RE.lastIndex = 0; // the regex is global; don't carry state
    } else {
      current.tree.push(line);
    }
  }
  flush();

  return chunks;
}

/**
 * Check that each chunk belongs to the file we think it does.
 *
 * Only files with parse errors carry a summary line naming their path, so this
 * verifies the subset it can and reports the first contradiction. That is
 * enough to catch an off-by-one: a shift would misname every erroring file
 * after it.
 *
 * @param {Array<{ summaryPath: string|null }>} chunks - Chunks in input order.
 * @param {string[]} filePaths - Input paths in the same order.
 * @returns {string|null} Description of the first misalignment, or null.
 */
function findMisalignment(chunks, filePaths) {
  for (let i = 0; i < chunks.length; i++) {
    const named = chunks[i].summaryPath;
    if (named !== null && named !== filePaths[i]) {
      return `chunk ${i} is summarised as '${named}' but was given '${filePaths[i]}'`;
    }
  }
  return null;
}

/**
 * Parse a single file by spawning the CLI for it.
 * @param {string} filePath - Path to the .kt file.
 * @returns {TsParseResult}
 */
function _parseOneText(filePath) {
  let stdout;
  try {
    stdout = execFileSync('npx', ['tree-sitter', 'parse', '--no-ranges', filePath], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
  } catch (err) {
    // tree-sitter parse exits non-zero when a file has parse errors, but still
    // prints the tree.
    if (!err.stdout) return null;
    stdout = err.stdout.toString();
  }

  const chunks = splitChunks(stdout);
  if (chunks.length !== 1) return null;
  return makeResult(chunks[0].tree, chunks[0].summaryReportedError);
}

function parseOne(filePath, options = {}) {
  return applyBindingErrors(new Map([[filePath, _parseOneText(filePath)]]), options).get(filePath);
}

/**
 * Parse many files, preferring a single batched CLI invocation.
 *
 * @param {string[]} filePaths - Paths to .kt files, relative to the repo root
 *   or absolute.
 * @param {{ batch?: boolean, onFallback?: (reason: string) => void }} [options]
 * @returns {Map<string, TsParseResult>} Keyed by the given path.
 */
function parseFiles(filePaths, options = {}) {
  const { batch = true, onFallback = () => {} } = options;

  if (filePaths.length === 0) return new Map();

  if (batch) {
    const batched = _tryBatch(filePaths, onFallback);
    if (batched) return applyBindingErrors(batched, options);
  }

  const results = new Map();
  for (const filePath of filePaths) {
    results.set(filePath, _parseOneText(filePath));
  }
  return applyBindingErrors(results, options);
}

/**
 * Overwrite the text-derived error flag with the parser's own verdict.
 *
 * The printed tree and the CLI summary are both renderings, and a renderer can
 * omit what it cannot name: a MISSING token inside a hidden rule behind an
 * alias is invisible to `ts_node_string` and leaves the exit status at 0. Only
 * the binding's `rootNode.hasError` sees it, so that is what decides here.
 *
 * `errorCount` stays text-derived — it counts what is actually printed — but it
 * is floored at 1 whenever the parser disagrees with the text, so a caller can
 * never read "zero errors" from a tree the parser considers broken.
 *
 * Detection only: the tree text is left exactly as the CLI produced it, because
 * the PSI comparison re-parses that text and the corpus differ hashes it.
 *
 * @param {Map<string, TsParseResult>} results
 * @param {object} options
 * @returns {Map<string, TsParseResult>}
 */
function applyBindingErrors(results, options = {}) {
  // Always tell the caller which detector actually ran. A gate that cannot see
  // this cannot know whether its numbers mean anything: the text detector is
  // blind to exactly the bug class the binding detector exists to catch.
  const announce = name => { if (options.onDetector) options.onDetector(name); };
  const paths = [...results.keys()];
  if (paths.length === 0) { announce('binding'); return results; }
  if (paths.some(file => !results.get(file))) throw new Error('Parser rendering failed; refusing to classify a harness failure as a grammar gap');
  // Seam for tests: inject verdicts instead of requiring a built grammar.
  const probe = options.probe || require('./binding-errors').probeFiles;
  const failures = [];
  const verdicts = probe(paths, {
    root: options.grammarRoot,
    onUnavailable: reason => {
      failures.push(reason);
    },
    onProbeError: (filePath, message) => {
      failures.push(`${filePath}: ${message}`);
    },
  });
  if (!verdicts || failures.length || paths.some(file => !verdicts.has(file))) {
    throw new Error(`Parser binding could not answer every input; no text fallback is allowed. ${failures.join('; ')}`);
  }
  announce('binding');
  for (const [filePath, hasError] of verdicts) {
    const result = results.get(filePath);
    if (!result || result.hasErrors === hasError) continue;
    results.set(filePath, {
      ...result,
      hasErrors: hasError,
      errorCount: hasError ? Math.max(result.errorCount, 1) : 0,
      // Recorded so a reader of the report can tell "the CLI and the parser
      // disagreed here" from "the tree visibly contains an ERROR".
      hiddenError: hasError && result.errorCount === 0,
    });
  }
  return results;
}

/**
 * Attempt one batched invocation. Returns null if the result cannot be trusted,
 * in which case the caller should fall back to per-file parsing.
 *
 * @param {string[]} filePaths
 * @param {(reason: string) => void} onFallback
 * @returns {Map<string, TsParseResult>|null}
 */
function _tryBatch(filePaths, onFallback) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-parse-'));
  const listFile = path.join(tmpDir, 'paths.txt');

  try {
    fs.writeFileSync(listFile, filePaths.join('\n') + '\n', 'utf-8');

    let stdout;
    try {
      stdout = execFileSync(
        TREE_SITTER_BIN,
        ['parse', '--paths', listFile, '--no-ranges'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 512 * 1024 * 1024,
        },
      );
    } catch (err) {
      // Exit 1 just means some file had parse errors; the trees are on stdout.
      // No stdout at all — a crash, a missing binary — is fatal to the batch,
      // and we hand back to the per-file path rather than guess.
      if (!err.stdout) {
        onFallback(`tree-sitter batch produced no output: ${err.message}`);
        return null;
      }
      stdout = err.stdout.toString();
    }

    const chunks = splitChunks(stdout);
    if (chunks.length !== filePaths.length) {
      onFallback(
        `tree-sitter batch returned ${chunks.length} trees for ${filePaths.length} files`,
      );
      return null;
    }

    const misaligned = findMisalignment(chunks, filePaths);
    if (misaligned) {
      onFallback(`tree-sitter batch output misaligned: ${misaligned}`);
      return null;
    }

    const results = new Map();
    for (let i = 0; i < filePaths.length; i++) {
      results.set(filePaths[i], makeResult(chunks[i].tree, chunks[i].summaryReportedError));
    }
    return results;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = {
  applyBindingErrors,
  normaliseTree,
  parseFiles,
  parseOne,
  countErrorNodes,
  makeResult,
  splitChunks,
  findMisalignment,
};
