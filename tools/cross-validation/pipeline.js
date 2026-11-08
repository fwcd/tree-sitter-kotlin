/**
 * One comparison of a tree-sitter tree with a PSI dump: parse both, normalize both, compare.
 * @module cross-validation/pipeline
 */

'use strict';

const { parseTreeSitter } = require('./parser-ts');
const { parsePsi } = require('./parser-psi');
const { normalizeTs, normalizePsi } = require('./normalizer');
const { compareTrees } = require('./comparator');
const { attachNative, attachPsi } = require('./native-metadata');

/**
 * @param {string|null} tsSexp - The tree-sitter tree as an s-expression, or null when it has no usable tree.
 * @param {string} psiDump - The PSI dump text.
 * @returns {{ tsTree: import('./models').Node|null, psiTree: import('./models').Node, tsNorm: import('./models').Node|null, psiNorm: import('./models').Node, result: import('./comparator').CompareResult }}
 */
function compareWithPsi(tsSexp, psiDump, options = {}) {
  const tsTree = tsSexp === null ? null : parseTreeSitter(tsSexp);
  if (tsTree && options.nativeRoot) attachNative(tsTree, options.nativeRoot);
  const tsNorm = tsTree === null ? null : normalizeTs(tsTree);
  const psiTree = parsePsi(psiDump);
  if (options.source !== undefined) attachPsi(psiTree, psiDump, options.source);
  const psiNorm = normalizePsi(psiTree);
  return { tsTree, psiTree, tsNorm, psiNorm, result: compareTrees(tsNorm, psiNorm) };
}

module.exports = { compareWithPsi };
