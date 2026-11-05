'use strict';

const { compareWithPsi } = require('./pipeline');
const { Status } = require('./comparator');

const { psiLayout, psiTypeAt } = require('./psi-layout');
const { firstTsError, leafLabel, namedAncestorType } = require('./error-location');
const { lexicalFacts, tokenDifference } = require('./native-facts');
const { layoutDifference, layoutDifferences } = require('./native-layout');
const { sha256 } = require('../safety');

function trimPath(diffPath, keep = 3) {
  const parts = diffPath.split(' > ');
  return (parts.length > keep ? '… > ' : '') + parts.slice(-keep).join(' > ');
}

/**
 * First structural divergence of two normalized trees in document order.
 *
 * Unlike the comparator's difference list this names the first child that
 * differs, not the child counts, so one cause yields one key whatever the
 * size of the file around it.
 *
 * @returns {{ path: string, psi: string, ts: string }|null}
 */
function firstDivergence(ts, psi, at = ts.name) {
  if (ts.name !== psi.name) return { path: at, psi: psi.name, ts: ts.name };
  if (JSON.stringify(ts.literal) !== JSON.stringify(psi.literal)) {
    return { path: at, psi: 'literal content/source span', ts: 'different literal content/source span' };
  }
  const shared = Math.min(ts.children.length, psi.children.length);
  for (let i = 0; i < shared; i++) {
    const tsChild = ts.children[i],
      psiChild = psi.children[i];
    if (tsChild.name !== psiChild.name) return { path: at, psi: psiChild.name, ts: tsChild.name };
    const inner = firstDivergence(tsChild, psiChild, `${at} > ${tsChild.name}`);
    if (inner) return inner;
  }
  if (ts.children.length !== psi.children.length) {
    return {
      path: at,
      psi: psi.children[shared]?.name ?? '(none)',
      ts: ts.children[shared]?.name ?? '(none)',
    };
  }
  return null;
}

const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

function aKey(tree, layout) {
  const found = firstTsError(tree.rootNode);
  if (!found) return { key: 'A hidden error (rootNode.hasError only)', line: 1, offset: 0 };
  const { node, missing } = found;
  const parent = namedAncestorType(node.parent);
  const what = missing
    ? `MISSING ${node.isNamed ? node.type : JSON.stringify(node.type)}`
    : `ERROR ${leafLabel(node)}`;
  const offset = node.startIndex;
  const psiType = layout ? psiTypeAt(layout, offset) : '?';
  return {
    key: `A ${parent} > ${what} | psi ${psiType}`,
    line: node.startPosition.row + 1,
    offset,
  };
}

function bKey(text, tree, psi, layout) {
  const error = layout && layout.errors[0];
  const offset = psi.firstError ? psi.firstError.offset : error ? error.offset : 0;
  const tsNode = tree.rootNode.descendantForIndex(Math.min(offset, Math.max(text.length - 1, 0)));
  const message = error ? error.message : psi.firstError ? psi.firstError.message : '?';
  return {
    key: `B psi ${error ? error.parent : '?'}: ${message} | ts ${namedAncestorType(tsNode)}`,
    line: psi.firstError ? psi.firstError.line : lineAt(text, offset),
    offset,
  };
}

/**
 * Classify one input for one grammar.
 *
 * When both report an error, the first errors decide: a tree-sitter error on an earlier line than
 * PSI's first error is `A-prefix` (tree-sitter rejects code PSI reads cleanly up to there), a PSI
 * error on an earlier line is `B-prefix`; on the same line the input is `both-error`. Their keys
 * are those of `A` and `B`, so one cause yields one bucket whether the file has other errors or
 * not. When both are clean, comments are compared before the structure: a comment one side reads
 * where the other reads literal text or none (`'a/*c*\/b'`) is a `C comment` divergence. Then the first
 * token of every declaration: one that starts elsewhere (a modifier left behind as a statement of
 * its own) is a `C declaration start` divergence, which the normalized structures cannot show.
 *
 * @param {{ text: string, tree: object, psi: { psiErrors?: number, failure?: string }, dump: string|null }} input
 * @returns {{ verdict: string, key?: string, line?: number }}
 */
function classify({ text, tree, psi, dump, cst, layout: suppliedLayout, comparison, differences }) {
  if (psi.failure) return { verdict: 'oracle-failure', key: psi.failure.slice(0, 120) };
  const tsError = tree.rootNode.hasError;
  const psiError = psi.psiErrors > 0;
  const layout = suppliedLayout || (dump ? psiLayout(dump, text) : null);
  if (tsError && psiError) {
    const a = aKey(tree, layout),
      b = bKey(text, tree, psi, layout);
    if (a.offset < b.offset) return { verdict: 'A-prefix', key: a.key, line: a.line };
    if (b.offset < a.offset) return { verdict: 'B-prefix', key: b.key, line: b.line };
    return { verdict: 'both-error' };
  }
  if (tsError) {
    const { key, line } = aKey(tree, layout);
    return { verdict: 'A', key, line };
  }
  if (psiError) {
    const { key, line } = bKey(text, tree, psi, layout);
    return { verdict: 'B', key, line };
  }
  if (layout) {
    const difference = differences ? differences[0] : layoutDifference(text, tree.rootNode, layout, cst);
    if (difference) return { verdict: difference.verdict, key: difference.key, line: difference.line };
  }
  const { tsNorm, psiNorm, result } = comparison || compareWithPsi(tree.rootNode.toString(), dump);
  if (result.status === Status.MATCH) return { verdict: 'ok' };
  const first = firstDivergence(tsNorm, psiNorm) || {
    path: result.differences[0].path,
    psi: '?',
    ts: '?',
  };
  return { verdict: 'C', key: `C @ ${trimPath(first.path)}: psi ${first.psi} / ts ${first.ts}` };
}

/** Preorder names and child counts encode the entire normalized named tree. */
function normalizedShape(root) {
  if (!root) return null;
  const shape = [], pending = [root];
  while (pending.length) {
    const node = pending.pop();
    shape.push([node.name, node.children.length, ...(node.literal ? [node.literal] : [])]);
    for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
  }
  return shape;
}

/**
 * Gate identity covers the complete comparison on every path. A first bucket key
 * is a reporting/minimization label and must never stand in for that identity.
 */
function compareInput({ text, tree, psi, dump }) {
  if (psi.failure) return { ...classify({ text, tree, psi, dump }), treeHash: null };
  const cst = lexicalFacts(tree.rootNode);
  const layout = psiLayout(dump, text);
  const comparison = compareWithPsi(tree.rootNode.toString(), dump, { nativeRoot: tree.rootNode, source: text });
  const differences = layoutDifferences(text, tree.rootNode, layout, cst);
  const classification = classify({ text, tree, psi, dump, cst, layout, comparison, differences });
  return {
    ...classification,
    treeHash: sha256(JSON.stringify([
      cst.tokens, cst.comments, cst.recovery,
      normalizedShape(comparison.tsNorm), normalizedShape(comparison.psiNorm),
      comparison.result.status, comparison.result.differences,
      differences, layout.errors,
    ])),
  };
}

module.exports = {
  psiLayout,
  psiTypeAt,
  firstTsError,
  firstDivergence,
  classify,
  compareInput,
  trimPath,
  lexicalFacts,
  tokenDifference,
};
