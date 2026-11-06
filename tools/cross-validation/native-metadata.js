'use strict';

const { psiLayout } = require('./psi-layout');
const NATIVE_METADATA = new Set([
  'string_literal', 'string_content', 'interpolated_identifier',
  'control_structure_body', 'secondary_constructor', 'navigation_suffix',
  'directly_assignable_expression',
  'source_file', 'statements', 'value_argument', 'annotated_expression', 'function_type_parameters', 'anonymous_function',
  'function_body', 'type_arguments',
  'if_expression', 'for_statement', 'while_statement', 'do_while_statement',
]);
const PSI_METADATA = new Set([
  'LITERAL_STRING_TEMPLATE_ENTRY', 'ESCAPE_STRING_TEMPLATE_ENTRY', 'STRING_INTERPOLATION_PREFIX',
]);

/** The grammar owns these intervals; recover only its non-emitted delimiters. */
function triviaToken(text, start, end) {
  const tokens = [];
  for (let i = start; i < end;) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text.startsWith('//', i)) {
      while (i < end && text[i] !== '\n') i++;
      continue;
    }
    if (text.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < end && depth) {
        if (text.startsWith('/*', i)) { depth++; i += 2; }
        else if (text.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) return [];
      continue;
    }
    const from = i;
    while (i < end && !/\s/.test(text[i]) && !text.startsWith('/*', i) && !text.startsWith('//', i)) i++;
    tokens.push({ start: from, end: i, text: text.slice(from, i) });
  }
  return tokens;
}

function stringDelimiter(text) {
  const prefix = /^\$+/.exec(text)?.[0] || '';
  const rest = text.slice(prefix.length);
  if (!rest.startsWith('"')) return null;
  return { prefix: prefix.length, raw: rest.startsWith('"""'), width: rest.startsWith('"""') ? 3 : 1 };
}

function hiddenSpans(node) {
  const spans = [];
  // N1: only the parsed wildcard-import gap owns the hidden DOT token.
  if (node.type === 'import_header') {
    const identifier = node.namedChildren.find(n => n.type === 'identifier');
    const star = node.namedChildren.find(n => n.type === 'wildcard_import');
    if (identifier && star) {
      const tokens = triviaToken(node.text, identifier.endIndex - node.startIndex, star.startIndex - node.startIndex);
      if (tokens.length === 1 && tokens[0].text === '.') spans.push({
        type: 'DOT', start: node.startIndex + tokens[0].start, end: node.startIndex + tokens[0].end,
      });
    }
  }
  // N2: only a parsed constructor header owns its hidden constructor keyword.
  if (node.type === 'primary_constructor') {
    const modifiers = node.namedChildren.find(n => n.type === 'modifiers');
    const parameters = node.children.find(n => n.type === '(');
    if (parameters) {
      const tokens = triviaToken(node.text, (modifiers?.endIndex || node.startIndex) - node.startIndex, parameters.startIndex - node.startIndex);
      if (tokens.length === 1 && tokens[0].text === 'constructor') spans.push({
        type: 'constructor', start: node.startIndex + tokens[0].start, end: node.startIndex + tokens[0].end,
      });
    }
  }
  if (node.type === 'unsigned_literal') spans.push({ type: 'INTEGER_LITERAL', start: node.startIndex, end: node.endIndex });
  if (node.type === 'string_literal') {
    const delimiter = stringDelimiter(node.text);
    if (delimiter) {
      spans.push({ type: 'OPEN_QUOTE', start: node.startIndex + delimiter.prefix, end: node.startIndex + delimiter.prefix + delimiter.width });
      if (delimiter.prefix) spans.push({ type: 'INTERPOLATION_PREFIX', start: node.startIndex, end: node.startIndex + delimiter.prefix });
    }
  }
  return spans;
}

/** Attach source facts by named-node type and document order, without changing tree shape. */
function attachNative(tree, root) {
  const byType = new Map(), cursor = root.walk();
  for (;;) {
    const node = cursor.currentNode;
    if (node.isNamed && NATIVE_METADATA.has(node.type)) {
      if (!byType.has(node.type)) byType.set(node.type, []);
      const tokens = node.children.filter(n => !n.isNamed).map(n => ({ type: n.type, start: n.startIndex, end: n.endIndex, text: n.text }));
      const literal = node.type === 'string_literal' ? node : node.parent?.type === 'string_literal' ? node.parent : null;
      byType.get(node.type).push({
        start: node.startIndex, end: node.endIndex, tokens,
        postfixSequence: node.type === 'directly_assignable_expression' ? postfixSequence(node) : undefined,
        typeParameterSequence: node.type === 'function_type_parameters' ? postfixSequence(node) : undefined,
        statementSpans: ['source_file', 'statements', 'control_structure_body', 'value_argument'].includes(node.type)
          ? node.namedChildren.map((child, i, children) => ({start: child.startIndex, end: child.endIndex,
            newlineBefore: i > 0 && /[\r\n]/.test(node.text.slice(
              children[i - 1].endIndex - node.startIndex, child.startIndex - node.startIndex)),
          })) : undefined,
        inlineAssignmentAnnotation: node.type === 'annotated_expression'
          ? inlineAssignmentAnnotation(node) : undefined,
        text: ['string_literal', 'string_content', 'interpolated_identifier'].includes(node.type) ? node.text : undefined,
        string: literal ? stringDelimiter(literal.text) : null,
        braced: tokens.some(n => n.type === '{') && tokens.some(n => n.type === '}'),
        controlHeader: controlHeader(node),
      });
    }
    if (cursor.gotoFirstChild()) continue;
    while (!cursor.gotoNextSibling()) if (!cursor.gotoParent()) return assign(tree, byType);
  }
}

// N42: loop headers have no named fields; only their parsed delimiters own the slot.
function controlHeader(node) {
  if (!['for_statement', 'while_statement', 'do_while_statement'].includes(node.type)) return undefined;
  const start = node.children.find(child => child.type === (node.type === 'for_statement' ? 'in' : '('));
  const end = node.children.find(child => child.type === ')' && child.startIndex > (start?.endIndex ?? Infinity));
  if (!start || !end) return undefined;
  return { role: node.type === 'for_statement' ? 'LOOP_RANGE' : 'CONDITION',
    indices: node.namedChildren.flatMap((child, index) =>
      child.startIndex >= start.endIndex && child.endIndex <= end.startIndex ? [index] : []),
  };
}

function postfixSequence(node) {
  let index = 0;
  return node.children.map(child => ({ type: child.type, named: child.isNamed,
    index: child.isNamed ? index++ : null }));
}

function inlineAssignmentAnnotation(node) {
  const annotations = node.namedChildren.filter(child => child.type === 'annotation');
  const assignment = node.namedChildren.find(child => child.type === 'assignment');
  return annotations.length && assignment
    ? !/[\r\n]/.test(node.text.slice(annotations[annotations.length - 1].endIndex - node.startIndex, assignment.startIndex - node.startIndex))
    : false;
}

function assign(tree, byType) {
  const indices = new Map();
  function visit(node) {
    const index = indices.get(node.name) || 0;
    indices.set(node.name, index + 1);
    const info = byType.get(node.name)?.[index];
    if (info) Object.defineProperty(node, 'sourceInfo', { value: info, enumerable: false });
    node.children.forEach(visit);
  }
  visit(tree);
  return tree;
}

function attachPsi(tree, dump, source) {
  const byType = new Map();
  for (const node of psiLayout(dump, source).composites) {
    if (!PSI_METADATA.has(node.type)) continue;
    if (!byType.has(node.type)) byType.set(node.type, []);
    byType.get(node.type).push({ start: node.start, end: node.end, text: source.slice(node.start, node.end) });
  }
  return assign(tree, byType);
}

module.exports = { attachNative, attachPsi, hiddenSpans, stringDelimiter };
