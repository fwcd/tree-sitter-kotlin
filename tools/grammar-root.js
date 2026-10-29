/** Locate this repository's grammar or an explicit KOTLIN_GRAMMAR_ROOT. */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** @returns {string|null} Directory containing `src/node-types.json`. */
function grammarRoot() {
  const candidates = [
    process.env.KOTLIN_GRAMMAR_ROOT,
    path.resolve(__dirname, '..'), // tools/ inside a grammar checkout
    path.resolve(__dirname, '..', '..'), // tools/ still inside a grammar checkout
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'src', 'node-types.json'))) return candidate;
  }
  return null;
}

/** @returns {object|null} Parsed `src/node-types.json`, or null when absent. */
function nodeTypes() {
  const root = grammarRoot();
  if (!root) return null;
  return JSON.parse(fs.readFileSync(path.join(root, 'src', 'node-types.json'), 'utf8'));
}

/** Message explaining a skip, so a skipped test is never mysterious. */
const MISSING = 'no grammar checkout found; set KOTLIN_GRAMMAR_ROOT';

module.exports = { grammarRoot, nodeTypes, MISSING };
