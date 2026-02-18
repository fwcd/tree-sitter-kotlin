/**
 * Data model for cross-validation AST nodes.
 * @module models
 */

'use strict';

/**
 * Represents a node in an abstract syntax tree.
 */
class Node {
  /**
   * @param {string} name - The node type name.
   * @param {Node[]} [children] - Child nodes.
   */
  constructor(name, children = []) {
    this.name = name;
    this.children = children;
  }

  /**
   * Deep equality comparison with another Node.
   * @param {*} other - The value to compare against.
   * @returns {boolean} True if structurally equal.
   */
  equals(other) {
    if (!(other instanceof Node)) return false;
    if (this.name !== other.name) return false;
    if (this.children.length !== other.children.length) return false;
    return this.children.every((c, i) => c.equals(other.children[i]));
  }

  /**
   * Returns a human-readable string representation for debugging.
   * @param {number} [indent] - Current indentation level.
   * @returns {string}
   */
  toString(indent = 0) {
    const prefix = '  '.repeat(indent);
    if (this.children.length === 0) {
      return `${prefix}${this.name}`;
    }
    const childStr = this.children.map(c => c.toString(indent + 1)).join('\n');
    return `${prefix}${this.name}\n${childStr}`;
  }
}

module.exports = { Node };
