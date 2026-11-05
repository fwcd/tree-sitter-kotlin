'use strict';

const { psiTypeAt } = require('./psi-layout');
const { namedAncestorType } = require('./error-location');
const { tokenDifferences } = require('./native-facts');
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

// PSI reads a shebang as a comment.
const COMMENT_TYPES = new Set(['line_comment', 'multiline_comment', 'shebang_line']);

/**
 * Start offsets of every comment node of a tree, in document order. The Node binding parses a
 * JavaScript string as UTF-16, so its indexes are the UTF-16 offsets PSI reports.
 */
function tsComments(root, spans = false) {
  const out = [];
  const cursor = root.walk();
  let descend = true;
  for (;;) {
    if (descend && COMMENT_TYPES.has(cursor.nodeType))
      out.push(spans ? [cursor.startIndex, cursor.endIndex] : cursor.startIndex);
    if (descend && cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) {
      descend = true;
      continue;
    }
    if (!cursor.gotoParent()) break;
    descend = false;
  }
  return out;
}

// Declarations whose first token both trees must agree on, by tree-sitter type. The structure
// comparison skips names and modifiers, so a modifier read as a statement of its own (`private`
// on the line above `private fun f() {}`) normalizes to the same tree as PSI's FUN with its
// MODIFIER_LIST; where the declaration starts tells them apart.
// Left out on both sides: the anonymous OBJECT_DECLARATION inside an OBJECT_LITERAL, a destructuring
// declaration (a PROPERTY in tree-sitter, its entries elsewhere in PSI) and the PROPERTY of a `when`
// subject, which tree-sitter has no declaration node for.
const DECLARATIONS = new Map(
  Object.entries({
    function_declaration: 'FUN',
    anonymous_function: 'FUN',
    class_declaration: 'CLASS',
    object_declaration: 'OBJECT_DECLARATION',
    companion_object: 'OBJECT_DECLARATION',
    property_declaration: 'PROPERTY',
    type_alias: 'TYPEALIAS',
    secondary_constructor: 'SECONDARY_CONSTRUCTOR',
    getter: 'PROPERTY_ACCESSOR',
    setter: 'PROPERTY_ACCESSOR',
  }),
);
const PSI_DECLARATIONS = new Set(DECLARATIONS.values());
const PSI_NO_DECLARATION_IN = { OBJECT_DECLARATION: 'OBJECT_LITERAL', PROPERTY: 'WHEN' };

/** `TYPE@offset` of each declaration's first token that is no comment, in document order. */
function tsDeclarationStarts(root) {
  const out = [];
  const cursor = root.walk();
  let descend = true;
  for (;;) {
    const type = descend && DECLARATIONS.get(cursor.nodeType);
    const node = type && cursor.currentNode;
    if (
      node &&
      !(
        type === 'PROPERTY' &&
        node.namedChildren.some((child) => child.type === 'multi_variable_declaration')
      )
    ) {
      let first = node.firstChild;
      while (first && COMMENT_TYPES.has(first.type)) first = first.nextSibling;
      out.push(`${type}@${annotatedStart(node, (first || node).startIndex)}`);
    }
    if (descend && cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) {
      descend = true;
      continue;
    }
    if (!cursor.gotoParent()) break;
    descend = false;
  }
  return out.sort();
}

// An anonymous function's annotations are a prefix_expression around it in tree-sitter and the
// FUN's own MODIFIER_LIST in PSI (`g(@Ann fun() {})`): the function starts at the first of them.
function annotatedStart(node, start) {
  if (node.type !== 'anonymous_function') return start;
  for (
    let parent = node.parent;
    parent && parent.type === 'prefix_expression' && parent.lastNamedChild?.id === node.id;
    node = parent, parent = parent.parent
  ) {
    const prefix = parent.namedChildren.slice(0, -1);
    if (!prefix.every((child) => child.type === 'annotation' || COMMENT_TYPES.has(child.type))) break;
    const first = prefix.find(child => child.type === 'annotation');
    if (!first) break;
    start = first.startIndex;
  }
  // Hidden statement/argument annotation tuples have the same FUN modifier prefix.
  const parent = node.parent;
  if (!parent || !['source_file', 'statements', 'control_structure_body', 'value_argument'].includes(parent.type)) return start;
  if (parent.type === 'value_argument' && parent.children.some(child => ['=', '*'].includes(child.type))) return start;
  const siblings = parent.namedChildren, index = siblings.findIndex(child => child.id === node.id);
  let begin = index;
  while (begin > 0 && (siblings[begin - 1].type === 'annotation' || COMMENT_TYPES.has(siblings[begin - 1].type))) begin--;
  const first = siblings.slice(begin, index).find(child => child.type === 'annotation');
  if (first && !parent.children.some(child => child.type === ';' && child.startIndex >= first.endIndex && child.endIndex <= node.startIndex))
    start = first.startIndex;
  return start;
}

function psiDeclarationStarts(layout) {
  return layout.composites
    .filter(
      (c) =>
        PSI_DECLARATIONS.has(c.type) &&
        c.token !== null &&
        PSI_NO_DECLARATION_IN[c.type] !== c.parent,
    )
    .map((c) => `${c.type}@${c.token}`)
    .sort();
}

/** Collect every layout discrepancy; reporting may still choose the first. */
function layoutDifferences(text, root, layout, cst) {
  const differences = [];
  const ts = tsComments(root), psi = layout.comments;
  for (let i = 0; i < Math.max(ts.length, psi.length); i++) {
    if (ts[i] === psi[i]) continue;
    const offset = Math.min(ts[i] ?? Infinity, psi[i] ?? Infinity);
    const side = ts[i] === offset ? (psi.includes(offset) ? 'both' : 'ts') : 'psi';
    const node = root.descendantForIndex(offset);
    differences.push({
      verdict: 'C',
      key: `C comment only in ${side} @ ts ${namedAncestorType(node.parent)} / psi ${psiTypeAt(layout, offset)}`,
      line: lineAt(text, offset),
      offset,
    });
  }
  const tsSpans = tsComments(root, true);
  const psiSpans = layout.commentSpans.map((c) => [c.start, c.end]);
  for (let i = 0; i < Math.max(tsSpans.length, psiSpans.length); i++) {
    if (JSON.stringify(tsSpans[i]) === JSON.stringify(psiSpans[i])) continue;
    const offset = (tsSpans[i] || psiSpans[i])[0];
    differences.push({
      verdict: 'C', key: 'C comment extent differs from PSI', line: lineAt(text, offset),
      native: tsSpans[i] || null, psi: psiSpans[i] || null,
    });
  }
  const tsStarts = tsDeclarationStarts(root), psiStarts = psiDeclarationStarts(layout);
  const only = (a, b) => a.filter((x) => !b.includes(x));
  const tsOnly = only(tsStarts, psiStarts), psiOnly = only(psiStarts, tsStarts);
  const offsetOf = (entry) => Number(entry.split('@')[1]);
  for (const entry of [...tsOnly, ...psiOnly].sort((x, y) => offsetOf(x) - offsetOf(y))) {
    const offset = offsetOf(entry), side = tsOnly.includes(entry) ? 'ts' : 'psi';
    const node = root.descendantForIndex(offset);
    differences.push({
      verdict: 'C',
      key: `C declaration start only in ${side}: ${entry.split('@')[0]} @ ts ${namedAncestorType(node.parent)} / psi ${psiTypeAt(layout, offset)}`,
      line: lineAt(text, offset), offset,
    });
  }
  return differences.concat(tokenDifferences(text, root, layout, cst));
}

function layoutDifference(...args) {
  return layoutDifferences(...args)[0] || null;
}

module.exports = { layoutDifference, layoutDifferences };
