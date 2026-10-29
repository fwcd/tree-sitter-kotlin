/**
 * Authoritative parse-failure detection, via the parser binding.
 *
 * `tree-sitter parse` decides what to print with `ts_node_string`, which walks
 * only the nodes the public API exposes. A MISSING token inserted inside a
 * *hidden* rule behind an alias is therefore printed nowhere, and the CLI exits
 * 0 for a tree the parser knows is broken. PR #297 is the worked example:
 *
 *     class C { inner object }
 *
 * prints a clean `(object_declaration …)` and exits 0, while the binding
 * reports `rootNode.hasError === true`.
 *
 * Note what does *not* work: walking the tree and counting `isMissing` nodes.
 * Hidden rules are not enumerable through the node API either, so that walk
 * also returns zero. `rootNode.hasError` is the only signal that sees it, which
 * is why this module reports a boolean rather than a count.
 *
 * @module cross-validation/binding-errors
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let cached;

/**
 * Load the grammar's parser binding.
 *
 * Both the `tree-sitter` runtime and the compiled language are resolved from
 * the selected grammar checkout: they share a native ABI, and
 * mixing a runtime from one install with a language built against another is
 * how you get a segfault instead of a parse.
 *
 * @param {string} root Grammar checkout.
 * @returns {{parser: object}|{error: string}}
 */
function load(root) {
  if (cached && cached.root === root) return cached.value;
  let value;
  try {
    const runtimePath = require.resolve('tree-sitter', { paths: [root] });
    const Parser = require(runtimePath);
    const language = require(path.join(root, 'bindings', 'node'));
    const parser = new Parser();
    parser.setLanguage(language);
    value = { parser };
  } catch (error) {
    value = { error: error.message };
  }
  cached = { root, value };
  return value;
}

/** Forget the cached parser; used by tests that switch grammars. */
function reset() { cached = undefined; }

/**
 * Does this source fail to parse, according to the parser itself?
 *
 * @param {object} parser Loaded binding parser.
 * @param {string} source
 * @returns {boolean}
 */
function sourceHasError(parser, source) {
  // node-tree-sitter reads a string through a fixed scratch buffer, 32 KiB by
  // default, and throws "Invalid argument" for anything larger. That limit is
  // a property of the binding, not of the grammar: CoroutineScope.kt is 52 KiB
  // and parses cleanly once the buffer fits it. Size the buffer to the source
  // so file length never decides whether we can answer.
  const bytes = Buffer.byteLength(source, 'utf8');
  const bufferSize = Math.max(32 * 1024, bytes * 2 + 1024);
  return parser.parse(source, undefined, { bufferSize }).rootNode.hasError;
}

/**
 * Probe a batch of files.
 *
 * @param {string[]} filePaths
 * @param {object} [options]
 * @param {string} [options.root] Grammar checkout; defaults to the resolver's.
 * @param {(reason: string) => void} [options.onUnavailable] Called once when
 *   the binding cannot be loaded, so the caller can say so loudly instead of
 *   quietly falling back to the weaker signal.
 * @returns {Map<string, boolean>|null} path → hasError, or null when the
 *   binding is unavailable.
 */
function probeFiles(filePaths, options = {}) {
  const root = options.root || require('../grammar-root').grammarRoot();
  if (!root) {
    if (options.onUnavailable) options.onUnavailable('no grammar checkout found');
    return null;
  }
  const loaded = load(root);
  if (loaded.error) {
    if (options.onUnavailable) options.onUnavailable(`parser binding unavailable: ${loaded.error}`);
    return null;
  }
  const out = new Map();
  for (const filePath of filePaths) {
    try {
      out.set(filePath, sourceHasError(loaded.parser, fs.readFileSync(filePath, 'utf8')));
    } catch (error) {
      // Deliberately NOT recorded as a parse failure. An earlier version did
      // exactly that — "fail closed" — and it turned the binding's 32 KiB
      // buffer limit into 33 fabricated grammar errors across the real-world
      // corpus. A probe that cannot answer must say so and leave the verdict
      // to the caller, not invent a finding.
      if (options.onProbeError) options.onProbeError(filePath, error.message);
    }
  }
  return out;
}

/**
 * Make sure a checkout has a loadable parser binding, building it if not.
 *
 * The gates must never fall back to text detection by accident, so the paths
 * that run them check here first rather than discovering the loss halfway
 * through a measurement. A stale `build/Release` survives `npm ci` — it lives
 * outside node_modules — so a failed load is retried once after a rebuild.
 *
 * @param {string} root Grammar checkout.
 * @param {(message: string) => void} [log]
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function ensureBinding(root, log = () => {}) {
  reset();
  if (!load(root).error) return { ok: true };
  log(`parser binding not loadable in ${root}; rebuilding`);
  const built = spawnSync('npx', ['node-gyp', 'rebuild'],
    { cwd: root, encoding: 'utf8', timeout: 900000 });
  reset();
  const after = load(root);
  if (!after.error) return { ok: true };
  return { ok: false, reason: `${after.error}${built.status ? ` (rebuild exited ${built.status})` : ''}` };
}

module.exports = { load, reset, probeFiles, sourceHasError, ensureBinding };
