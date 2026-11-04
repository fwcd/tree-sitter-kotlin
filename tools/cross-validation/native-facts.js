'use strict';

const COMMENT_TYPES = new Set(['line_comment', 'multiline_comment', 'shebang_line']);
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

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
  const recovery = root.hasError ? [] : null;
  const comments = [];
  const cursor = root.walk();
  for (;;) {
    const node = cursor.currentNode;
    const comment = COMMENT_TYPES.has(node.type);
    if (comment) comments.push([node.type, node.startIndex, node.endIndex, node.text]);
    // Preorder plus child counts preserves nesting, including ERROR and zero-width MISSING.
    // No composite text or fields: only topology, type, naming and source range.
    if (recovery)
      recovery.push([
        node.type, node.startIndex, node.endIndex,
        Number(node.isNamed), Number(node.isMissing), node.childCount,
      ]);
    if (ownerTypes.has(node.type))
      owners.push({ type: node.type, start: node.startIndex, end: node.endIndex });
    if (
      node.childCount === 0 &&
      node !== root &&
      !comment &&
      !node.isMissing
    ) {
      tokens.push({ type: node.type, start: node.startIndex, end: node.endIndex, text: node.text });
    }
    if (cursor.gotoFirstChild()) continue;
    while (!cursor.gotoNextSibling()) {
      if (!cursor.gotoParent()) return { tokens, owners, recovery, comments };
    }
  }
}

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

/** Different lexers may split/merge tokens, but no PSI token character may disappear. */
function tokenDifferences(text, root, layout, cst) {
  const differences = [];
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
        const end = Math.min(token.end, span?.start ?? token.end);
        differences.push({
          start: offset,
          end,
          verdict: 'C',
          key: `C token span: PSI ${token.type} is not represented`,
          line: lineAt(text, offset),
        });
        offset = end;
        continue;
      }
      if (span.text !== text.slice(span.start, span.end))
        throw new Error('Native token text/range is inconsistent');
      offset = Math.min(token.end, span.end);
    }
  }
  return differences;
}

function tokenDifference(...args) {
  return tokenDifferences(...args)[0] || null;
}

module.exports = { lexicalFacts, tokenDifference, tokenDifferences };
