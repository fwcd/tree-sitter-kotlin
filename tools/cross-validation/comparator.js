/**
 * Structural tree comparison for cross-validation.
 * @module comparator
 */

'use strict';

// ---------------------------------------------------------------------------
// Status enum
// ---------------------------------------------------------------------------

/** @enum {string} */
const Status = {
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  TS_PARSE_ERROR: 'TS_PARSE_ERROR',
  PSI_PARSE_ERROR: 'PSI_PARSE_ERROR',
};

// ---------------------------------------------------------------------------
// DiffKind enum
// ---------------------------------------------------------------------------

/** @enum {string} */
const DiffKind = {
  NAME_MISMATCH: 'name_mismatch',
  MISSING_CHILD: 'missing_child',
  EXTRA_CHILD: 'extra_child',
  CHILD_COUNT_MISMATCH: 'child_count_mismatch',
};

// ---------------------------------------------------------------------------
// Difference
// ---------------------------------------------------------------------------

/**
 * Represents a single structural difference between two trees.
 */
class Difference {
  /**
   * @param {string} path - Path to the differing node (` > ` separated).
   * @param {string} expected - Expected value (from PSI).
   * @param {string} actual - Actual value (from tree-sitter).
   * @param {string} kind - DiffKind value.
   */
  constructor(path, expected, actual, kind) {
    this.path = path;
    this.expected = expected;
    this.actual = actual;
    this.kind = kind;
  }
}

// ---------------------------------------------------------------------------
// CompareResult
// ---------------------------------------------------------------------------

/**
 * Result of comparing two trees.
 */
class CompareResult {
  /**
   * @param {string} status - Status enum value.
   * @param {Difference[]} [differences] - List of differences found.
   */
  constructor(status, differences = []) {
    this.status = status;
    this.differences = differences;
  }
}

// ---------------------------------------------------------------------------
// compareTrees
// ---------------------------------------------------------------------------

/**
 * Recursively compare two normalized AST trees.
 *
 * @param {import('./models').Node|null} tsTree - Normalized tree-sitter tree.
 * @param {import('./models').Node|null} psiTree - Normalized PSI tree.
 * @returns {CompareResult}
 */
function compareTrees(tsTree, psiTree) {
  if (tsTree == null) {
    return new CompareResult(Status.TS_PARSE_ERROR);
  }
  if (psiTree == null) {
    return new CompareResult(Status.PSI_PARSE_ERROR);
  }

  const differences = [];
  _compareNodes(tsTree, psiTree, tsTree.name, differences);

  if (differences.length === 0) {
    return new CompareResult(Status.MATCH);
  }
  return new CompareResult(Status.MISMATCH, differences);
}

/**
 * Recursively compare two nodes and collect differences.
 *
 * @param {import('./models').Node} tsNode
 * @param {import('./models').Node} psiNode
 * @param {string} path - Current path (` > ` separated).
 * @param {Difference[]} differences - Accumulator for differences.
 */
function _compareNodes(tsNode, psiNode, path, differences) {
  // Check name match
  if (tsNode.name !== psiNode.name) {
    differences.push(new Difference(
      path,
      psiNode.name,
      tsNode.name,
      DiffKind.NAME_MISMATCH,
    ));
    return; // No point comparing children if names differ
  }

  const tsChildren = tsNode.children;
  const psiChildren = psiNode.children;

  // Check child count
  if (tsChildren.length !== psiChildren.length) {
    differences.push(new Difference(
      path,
      String(psiChildren.length),
      String(tsChildren.length),
      DiffKind.CHILD_COUNT_MISMATCH,
    ));

    // Report extra/missing children
    if (tsChildren.length > psiChildren.length) {
      for (let i = psiChildren.length; i < tsChildren.length; i++) {
        differences.push(new Difference(
          path,
          '(none)',
          tsChildren[i].name,
          DiffKind.EXTRA_CHILD,
        ));
      }
    } else {
      for (let i = tsChildren.length; i < psiChildren.length; i++) {
        differences.push(new Difference(
          path,
          psiChildren[i].name,
          '(none)',
          DiffKind.MISSING_CHILD,
        ));
      }
    }

    // Still compare overlapping children
    const minLen = Math.min(tsChildren.length, psiChildren.length);
    for (let i = 0; i < minLen; i++) {
      const childPath = path + ' > ' + tsChildren[i].name;
      _compareNodes(tsChildren[i], psiChildren[i], childPath, differences);
    }
    return;
  }

  // Same number of children — compare pairwise
  for (let i = 0; i < tsChildren.length; i++) {
    const childPath = path + ' > ' + tsChildren[i].name;
    _compareNodes(tsChildren[i], psiChildren[i], childPath, differences);
  }
}

module.exports = {
  Status,
  DiffKind,
  Difference,
  CompareResult,
  compareTrees,
};
