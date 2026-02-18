/**
 * Parser for tree-sitter S-expression output.
 * @module parser-ts
 */

'use strict';

const { Node } = require('./models');

/**
 * Regex to match position annotations like [0, 0] - [7, 0]
 * @type {RegExp}
 */
const POSITION_RE = /\[\d+, \d+\] - \[\d+, \d+\]/g;

/**
 * Tokenize S-expression string into tokens: '(', ')', and word tokens.
 * @param {string} text - Cleaned S-expression text (positions stripped).
 * @returns {string[]} Array of tokens.
 */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      // Word token
      let start = i;
      while (i < text.length && text[i] !== '(' && text[i] !== ')' && !/\s/.test(text[i])) {
        i++;
      }
      tokens.push(text.slice(start, i));
    }
  }
  return tokens;
}

/**
 * Parse tokens into a Node tree recursively.
 * @param {string[]} tokens - Token array.
 * @param {{pos: number}} state - Mutable parsing state.
 * @returns {Node} Parsed node.
 */
function parseNode(tokens, state) {
  // Expect '('
  if (tokens[state.pos] !== '(') {
    throw new Error(`Expected '(' at position ${state.pos}, got '${tokens[state.pos]}'`);
  }
  state.pos++; // consume '('

  // Read node name
  const name = tokens[state.pos];
  state.pos++;

  // Read children until ')'
  const children = [];
  while (state.pos < tokens.length && tokens[state.pos] !== ')') {
    if (tokens[state.pos] === '(') {
      children.push(parseNode(tokens, state));
    } else {
      // Skip unexpected non-paren tokens (shouldn't normally happen)
      state.pos++;
    }
  }

  // Expect ')'
  if (tokens[state.pos] === ')') {
    state.pos++; // consume ')'
  }

  return new Node(name, children);
}

/**
 * Parse tree-sitter S-expression output into a Node tree.
 * @param {string} text - The S-expression text from tree-sitter.
 * @returns {Node} The root node.
 */
function parseTreeSitter(text) {
  // Strip position annotations
  const cleaned = text.replace(POSITION_RE, '');

  const tokens = tokenize(cleaned);
  if (tokens.length === 0) {
    return new Node('source_file');
  }

  const state = { pos: 0 };
  return parseNode(tokens, state);
}

module.exports = { parseTreeSitter };
