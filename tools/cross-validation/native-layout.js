'use strict';

const { psiTypeAt } = require('./psi-layout');
const { namedAncestorType } = require('./error-location');
const { tokenDifference } = require('./native-facts');
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
    if (!parent.namedChildren.slice(0, -1).every((child) => child.type === 'annotation')) break;
    start = parent.startIndex;
  }
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

function layoutDifference(text, root, layout, cst) {
  {
    const ts = tsComments(root),
      psiComments = layout.comments;
    const at = ts.findIndex((offset, i) => offset !== psiComments[i]);
    if (at >= 0 || ts.length !== psiComments.length) {
      const i = at >= 0 ? at : Math.min(ts.length, psiComments.length);
      const offset = Math.min(ts[i] ?? Infinity, psiComments[i] ?? Infinity);
      const side = ts[i] === offset ? (psiComments.includes(offset) ? 'both' : 'ts') : 'psi';
      const node = root.descendantForIndex(offset);
      return {
        verdict: 'C',
        key: `C comment only in ${side} @ ts ${namedAncestorType(node.parent)} / psi ${psiTypeAt(layout, offset)}`,
        line: lineAt(text, offset),
      };
    }
  }
  {
    const ts = tsComments(root, true),
      psi = layout.commentSpans.map((c) => [c.start, c.end]);
    const at = ts.findIndex((span, i) => JSON.stringify(span) !== JSON.stringify(psi[i]));
    if (at >= 0)
      return {
        verdict: 'C',
        key: 'C comment extent differs from PSI',
        line: lineAt(text, ts[at][0]),
      };
  }
  {
    const ts = tsDeclarationStarts(root),
      psiStarts = psiDeclarationStarts(layout);
    const only = (a, b) => a.filter((x) => !b.includes(x));
    const tsOnly = only(ts, psiStarts),
      psiOnly = only(psiStarts, ts);
    if (tsOnly.length || psiOnly.length) {
      const offsetOf = (entry) => Number(entry.split('@')[1]);
      const first = [...tsOnly, ...psiOnly].sort((x, y) => offsetOf(x) - offsetOf(y))[0];
      const offset = offsetOf(first),
        side = tsOnly.includes(first) ? 'ts' : 'psi';
      const node = root.descendantForIndex(offset);
      return {
        verdict: 'C',
        key: `C declaration start only in ${side}: ${first.split('@')[0]} @ ts ${namedAncestorType(node.parent)} / psi ${psiTypeAt(layout, offset)}`,
        line: lineAt(text, offset),
      };
    }
  }
  return tokenDifference(text, root, layout, cst);
}
module.exports = { layoutDifference };
