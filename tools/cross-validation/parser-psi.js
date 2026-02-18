/**
 * Parser for JetBrains PSI indented tree format.
 * @module parser-psi
 */

'use strict';

const { Node } = require('./models');

/**
 * Regex for composite PSI node names (e.g. PACKAGE_DIRECTIVE, CLASS_BODY).
 * @type {RegExp}
 */
const COMPOSITE_RE = /^[A-Z][A-Z_0-9]*$/;

/**
 * Lines to skip — PsiElement, PsiWhiteSpace, PsiComment, PsiErrorElement, <empty list>.
 * @type {RegExp}
 */
const SKIP_RE = /^(?:PsiElement\(|PsiWhiteSpace\(|PsiComment\(|PsiErrorElement|<empty list>)/;

/**
 * Root line pattern: "KtFile: <filename>"
 * @type {RegExp}
 */
const ROOT_RE = /^KtFile:\s+/;

/**
 * Count leading spaces on a line.
 * @param {string} line
 * @returns {number}
 */
function indentLevel(line) {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ' ') count++;
    else break;
  }
  return count;
}

/**
 * Parse PSI indented text into a tree of Nodes.
 * @param {string} text - The PSI dump text.
 * @returns {Node} The root KtFile node.
 */
function parsePsi(text) {
  const lines = text.split('\n');

  // Collect relevant (indent, name) pairs
  /** @type {{indent: number, name: string}[]} */
  const entries = [];

  for (const line of lines) {
    if (line.trim() === '') continue;

    const trimmed = line.trimStart();

    // Root line
    if (ROOT_RE.test(trimmed)) {
      entries.push({ indent: indentLevel(line), name: 'KtFile' });
      continue;
    }

    // Skip terminal/leaf PSI elements
    if (SKIP_RE.test(trimmed)) continue;

    // Only keep composite node names
    if (COMPOSITE_RE.test(trimmed)) {
      entries.push({ indent: indentLevel(line), name: trimmed });
    }
  }

  if (entries.length === 0) {
    return new Node('KtFile');
  }

  // Build tree from indent levels using a stack
  // Stack entries: { node, indent }
  const root = new Node(entries[0].name);
  /** @type {{node: Node, indent: number}[]} */
  const stack = [{ node: root, indent: entries[0].indent }];

  for (let i = 1; i < entries.length; i++) {
    const { indent, name } = entries[i];
    const child = new Node(name);

    // Pop stack until we find the parent (with smaller indent)
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    // Add as child of current top of stack
    stack[stack.length - 1].node.children.push(child);
    stack.push({ node: child, indent });
  }

  return root;
}

module.exports = { parsePsi };
