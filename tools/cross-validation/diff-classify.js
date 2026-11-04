'use strict';

const { compareWithPsi } = require('./pipeline');
const { Status } = require('./comparator');

// `s`: a leaf's text may hold a line or paragraph separator (U+2028, U+2029), which DebugUtil
// prints raw and `.` would not match without it.
const LEAF_RE = /^(PsiElement|PsiWhiteSpace|PsiComment)(?:\(([^)]*)\))?\('(.*)'\)$/s;

const LINE_ESCAPES = { n: '\n', r: '\r', t: '\t' };

/**
 * Source length of a leaf's printed text. `DebugUtil` prints a line break, a carriage return and
 * a tab as `\n`, `\r` and `\t` and every other character as itself, so a backslash in the
 * source (`"a\nb"`, a KDoc escape) prints unchanged and `\n` is ambiguous; with the source text
 * at hand the ambiguity resolves against it.
 *
 * @param {string} leaf - The printed text.
 * @param {string|null} source - The source text, or null.
 * @param {number} offset - Where the leaf starts in `source`.
 */
function leafLength(leaf, source, offset) {
  let o = offset;
  for (let i = 0; i < leaf.length; i++, o++) {
    const real = leaf[i] === '\\' && LINE_ESCAPES[leaf[i + 1]];
    if (real && (source === null || source[o] === real)) i++;
  }
  return o - offset;
}

/**
 * Recover source offsets from a PSI dump by concatenating its leaf texts.
 *
 * @param {string} dump - `DebugUtil.psiToString(file, true, false)` output.
 * @param {string|null} [source] - The parsed text, which makes the offsets exact, see `leafLength`.
 * @returns {{ composites: Array<{ type: string, parent: string, start: number, end: number, depth: number, token: number|null }>,
 *   errors: Array<{ offset: number, parent: string, message: string }>, comments: number[] }}
 *   Composites in document order, `parent` the type of the enclosing one; `end` is exclusive, `token` is the start of the composite's first
 *   leaf that is no whitespace, comment or KDoc (null when it has none). `comments` holds the start
 *   of every comment (a `PsiComment` leaf or a `KDoc`). Offsets count UTF-16 code units, as Java
 *   and JavaScript do.
 */
function psiLayout(dump, source = null) {
  const composites = [];
  const errors = [];
  const comments = [];
  const commentSpans = [];
  const tokens = [];
  const open = []; // { indent, entry }
  let offset = 0;
  const close = (indent) => {
    while (open.length && open[open.length - 1].indent >= indent) open.pop().entry.end = offset;
  };
  for (const line of dump.split('\n').slice(1)) {
    const indent = line.length - line.trimStart().length;
    const node = line.trim();
    if (!node || node === '<empty list>') continue;
    close(indent);
    const leaf = LEAF_RE.exec(node);
    if (leaf) {
      if (leaf[1] === 'PsiComment') {
        comments.push(offset);
        commentSpans.push({ start: offset, end: offset + leafLength(leaf[3], source, offset) });
      }
      if (leaf[1] === 'PsiElement' && !open.some((o) => o.entry.type === 'KDoc')) {
        for (let i = open.length - 1; i >= 0 && open[i].entry.token === null; i--)
          open[i].entry.token = offset;
      }
      const end = offset + leafLength(leaf[3], source, offset);
      if (leaf[1] === 'PsiElement' && !open.some((o) => o.entry.type === 'KDoc')) {
        tokens.push({ type: leaf[2], start: offset, end });
      }
      offset = end;
      continue;
    }
    const parent = open.length ? open[open.length - 1].entry.type : 'FILE';
    if (node.startsWith('PsiErrorElement')) {
      errors.push({ offset, parent, message: node.replace(/^PsiErrorElement:?/, '') });
      const entry = {
        type: 'PsiErrorElement',
        start: offset,
        end: offset,
        depth: open.length,
        token: null,
      };
      open.push({ indent, entry });
      continue;
    }
    if (node === 'KDoc') comments.push(offset);
    const entry = {
      type: node,
      parent,
      start: offset,
      end: offset,
      depth: open.length,
      token: null,
    };
    composites.push(entry);
    if (node === 'KDoc') commentSpans.push(entry);
    open.push({ indent, entry });
  }
  close(-1);
  return { composites, errors, comments, commentSpans, tokens };
}

/** Innermost PSI composite that starts at or covers `offset`. */
function psiTypeAt(layout, offset) {
  let best = null;
  for (const entry of layout.composites) {
    if (entry.start > offset) break;
    if (entry.end > offset || (entry.start === offset && entry.end === offset)) {
      if (!best || entry.depth >= best.depth) best = entry;
    }
  }
  return best ? best.type : 'FILE';
}

// ---------------------------------------------------------------------------
// tree-sitter error location
// ---------------------------------------------------------------------------

function leafLabel(node) {
  let leaf = node;
  while (leaf.childCount > 0) leaf = leaf.child(0);
  if (leaf === node && node.type === 'ERROR') return '∅';
  // A keyword inside an ERROR node may carry another token's type; its text
  // is what a reader recognises.
  return leaf.isNamed ? leaf.type : JSON.stringify(leaf.text);
}

/**
 * First ERROR or MISSING node in document order, descending only into
 * subtrees that report an error.
 *
 * @returns {{ node: object, missing: boolean }|null}
 */
function firstTsError(root) {
  let node = root;
  for (;;) {
    let next = null;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.isMissing) return { node: child, missing: true };
      if (child.type === 'ERROR') return { node: child, missing: false };
      if (child.hasError) {
        next = child;
        break;
      }
    }
    if (!next) return node === root ? null : { node, missing: false };
    node = next;
  }
}

function namedAncestorType(node) {
  let current = node;
  while (current && !current.isNamed) current = current.parent;
  return current ? current.type : 'source_file';
}

// ---------------------------------------------------------------------------
// Verdict and bucket keys
// ---------------------------------------------------------------------------

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
function classify({ text, tree, psi, dump, cst }) {
  if (psi.failure) return { verdict: 'oracle-failure', key: psi.failure.slice(0, 120) };
  const tsError = tree.rootNode.hasError;
  const psiError = psi.psiErrors > 0;
  const layout = dump ? psiLayout(dump, text) : null;
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
    const difference = layoutDifference(text, tree.rootNode, layout, cst);
    if (difference) return difference;
  }
  const { tsNorm, psiNorm, result } = compareWithPsi(tree.rootNode.toString(), dump);
  if (result.status === Status.MATCH) return { verdict: 'ok' };
  const first = firstDivergence(tsNorm, psiNorm) || {
    path: result.differences[0].path,
    psi: '?',
    ts: '?',
  };
  return { verdict: 'C', key: `C @ ${trimPath(first.path)}: psi ${first.psi} / ts ${first.ts}` };
}

/** Capture only leaf lexemes and the spans needed to account for hidden delimiters. */
function lexicalFacts(root) {
  const ownerTypes = new Set([
    'string_literal',
    'primary_constructor',
    'secondary_constructor',
    'character_literal',
    'long_literal',
    'integer_literal',
    'hex_literal',
    'binary_literal',
    'identifier',
    'user_type',
  ]);
  const tokens = [];
  const owners = [];
  const cursor = root.walk();
  for (;;) {
    const node = cursor.currentNode;
    if (ownerTypes.has(node.type))
      owners.push({ type: node.type, start: node.startIndex, end: node.endIndex });
    if (
      node.childCount === 0 &&
      node !== root &&
      !['line_comment', 'multiline_comment', 'shebang_line'].includes(node.type) &&
      !node.isMissing
    ) {
      tokens.push({ type: node.type, start: node.startIndex, end: node.endIndex, text: node.text });
    }
    if (cursor.gotoFirstChild()) continue;
    while (!cursor.gotoNextSibling()) {
      if (!cursor.gotoParent()) return { tokens, owners };
    }
  }
}

/** Different lexers may split/merge tokens, but no PSI token character may disappear. */
/** Index token owners once: hidden lexer delimiters are not visible CST leaves. */
function hiddenTokenOwners(nodes) {
  const starts = { quotes: new Set(), constructors: new Set() };
  const ends = new Set();
  const characters = new Set();
  const integers = new Set();
  const identifiers = [];
  for (const node of nodes) {
    // String quote delimiters are hidden external tokens, owned by the literal range.
    if (node.type === 'string_literal') {
      starts.quotes.add(node.start);
      ends.add(node.end);
    }
    // The constructor keyword can be hidden inside its constructor node.
    if (['primary_constructor', 'secondary_constructor'].includes(node.type))
      starts.constructors.add(node.start);
    // Character contents are hidden; PSI represents the whole quoted token.
    if (node.type === 'character_literal') characters.add(`${node.start}:${node.end}`);
    // Numeric suffixes such as L are hidden under the atomic literal.
    if (['long_literal', 'integer_literal', 'hex_literal', 'binary_literal'].includes(node.type))
      integers.add(`${node.start}:${node.end}`);
    // Qualified-name separators may be hidden inside identifier/user-type nodes.
    if (['identifier', 'user_type'].includes(node.type)) identifiers.push([node.start, node.end]);
  }
  identifiers.sort((a, b) => a[0] - b[0]);
  let index = 0,
    extent = -1;
  return (token) => {
    if (token.type === 'SEMICOLON') return true; // _semi is intentionally hidden.
    if (token.type === 'OPEN_QUOTE') return starts.quotes.has(token.start);
    if (token.type === 'CLOSING_QUOTE') return ends.has(token.end);
    if (token.type === 'constructor') return starts.constructors.has(token.start);
    if (token.type === 'CHARACTER_LITERAL') return characters.has(`${token.start}:${token.end}`);
    if (token.type === 'INTEGER_LITERAL') return integers.has(`${token.start}:${token.end}`);
    if (token.type === 'DOT') {
      while (index < identifiers.length && identifiers[index][0] <= token.start)
        extent = Math.max(extent, identifiers[index++][1]);
      return extent >= token.end;
    }
    return false;
  };
}

function tokenDifference(text, root, layout, cst) {
  const facts = cst || lexicalFacts(root);
  const hiddenOwner = hiddenTokenOwners(facts.owners);
  const spans = facts.tokens.filter((node) => node.end > node.start);
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  let index = 0;
  for (const token of layout.tokens) {
    if (hiddenOwner(token)) continue;
    let offset = token.start;
    while (offset < token.end) {
      while (index < spans.length && spans[index].end <= offset) index++;
      const span = spans[index];
      if (!span || span.start > offset) {
        return {
          verdict: 'C',
          key: `C token span: PSI ${token.type} is not represented`,
          line: lineAt(text, offset),
        };
      }
      if (span.text !== text.slice(span.start, span.end))
        throw new Error('Native token text/range is inconsistent');
      offset = Math.min(token.end, span.end);
    }
  }
  return null;
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
module.exports = {
  psiLayout,
  psiTypeAt,
  firstTsError,
  firstDivergence,
  classify,
  trimPath,
  lexicalFacts,
  tokenDifference,
};
