/**
 * Shared discovery of vendored JetBrains PSI fixtures.
 *
 * Fixtures are vendored with their JetBrains-relative paths preserved (see
 * tools/vendor-fixtures.js), because JetBrains reuses fixture names across
 * subdirectories — at commit fd4c284, 48 basenames occur in more than one
 * directory. Everything that reads the fixtures tree must therefore recurse and
 * key on the relative path, never on the bare basename.
 *
 * @module fixture-files
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { CONTEXT_EXCLUSIONS_DIR } = require('../psi-fixture-context');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Recursively list fixture files with a given extension.
 *
 * @param {string} extension - Extension to match, including the dot ('.kt').
 * @param {string} [dir] - Root to search; defaults to the fixtures directory.
 * @returns {string[]} Paths relative to dir, '/'-separated and sorted.
 */
function listFixtureFiles(extension, dir = FIXTURES_DIR) {
  if (!fs.existsSync(dir)) return [];

  const found = [];

  const walk = (relDir) => {
    const absDir = relDir ? path.join(dir, relDir) : dir;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        // Retained whole-file goldens are oracle validation inputs, with an
        // explicit context exclusion. They are not grammar-comparison inputs.
        if (rel === CONTEXT_EXCLUSIONS_DIR) continue;
        walk(rel);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        found.push(rel);
      }
    }
  };

  walk('');
  return found.sort();
}

/**
 * List fixture names: relative paths of every .kt fixture, without the
 * extension (e.g. 'BabySteps', 'contextParameters/contextReceiversOnClass').
 *
 * @param {string} [dir] - Root to search; defaults to the fixtures directory.
 * @returns {string[]} Sorted fixture names.
 */
function listFixtureNames(dir = FIXTURES_DIR) {
  const names = [...listFixtureFiles('.kt', dir), ...listFixtureFiles('.kts', dir)]
    .map(file => file.replace(/\.kts?$/, '')).sort();
  if (new Set(names).size !== names.length) throw new Error('Ambiguous .kt/.kts fixture IDs');
  return names;
}

/**
 * Resolve a fixture name to the absolute paths of its two halves.
 *
 * @param {string} name - Fixture name relative to dir, without extension.
 * @param {string} [dir] - Root to resolve against; defaults to the fixtures directory.
 * @returns {{ ktFile: string, psiFile: string }}
 */
function fixturePaths(name, dir = FIXTURES_DIR) {
  const stem = path.join(dir, ...name.split('/'));
  const kt = `${stem}.kt`, kts = `${stem}.kts`;
  if (fs.existsSync(kt) && fs.existsSync(kts)) throw new Error(`Ambiguous .kt/.kts fixture ID: ${name}`);
  return { ktFile: fs.existsSync(kts) ? kts : kt, psiFile: `${stem}.txt` };
}

module.exports = { FIXTURES_DIR, listFixtureFiles, listFixtureNames, fixturePaths };
