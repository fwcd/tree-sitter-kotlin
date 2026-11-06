import {describe, it, expect} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawnSync} from 'child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const api = {...require('../cross-validation/diff-classify'), ...require('../cross-validation/diff-execute')};
const buildSetup = require('./test-prerequisites').variantBuild(ROOT);
const output = result => result.stdout + result.stderr;
function build(root) {
  const result = spawnSync(process.execPath, [buildSetup.nodeGyp, 'rebuild'], {
    cwd: root, encoding: 'utf8', timeout: 180000,
  });
  expect(result.status, output(result)).toBe(0);
}
function variant(dir, name, modify) {
  const root = path.join(dir, name);
  fs.mkdirSync(root);
  for (const name of ['src', 'bindings']) fs.cpSync(path.join(ROOT, name), path.join(root, name), { recursive: true });
  for (const name of ['package.json', 'binding.gyp']) fs.copyFileSync(path.join(ROOT, name), path.join(root, name));
  fs.mkdirSync(path.join(root, 'node_modules'));
  for (const name of ['node-addon-api', 'node-gyp-build'])
    fs.cpSync(buildSetup.dependencies[name], path.join(root, 'node_modules', name), { recursive: true });
  modify(root);
  build(root);
  return root;
}
function input(dir, name, text) {
  const root = path.join(dir, name);
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'a.kt'), text);
  return root;
}
function replace(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  expect(source).toContain(before);
  fs.writeFileSync(file, source.replace(before, after));
}
function correctQuest(root) {
  const file = path.join(root, 'src/scanner.c');
  const source = fs.readFileSync(file, 'utf8');
  const at = source.indexOf("if (valid_symbols[CALLABLE_REFERENCE_QUEST] && lexer->lookahead == '?')");
  expect(at).toBeGreaterThan(0);
  const needle = "while (lexer->lookahead == ' ' || lexer->lookahead == '\\t') skip(lexer);";
  expect(source.slice(at)).toContain(needle);
  fs.writeFileSync(file, source.slice(0, at) + source.slice(at).replace(needle, needle.replace('skip(lexer)', 'advance(lexer)')));
}
const missing = [...buildSetup.missing];
try { require('../safety').javaExecutable(); } catch (error) { missing.push(error.message); }
if (!require('../psi-oracle/fetch').isFetched()) missing.push('npm run psi-oracle:fetch (verified PSI jars)');
const available = missing.length === 0;
if (!available) process.stderr.write('Native comparison tests skipped; missing: ' + missing.join('; ') + '\n');
function reference(dir, text) {
  const source = input(dir, 'input', text), out = path.join(dir, 'psi');
  const [psi] = require('../psi-oracle/oracle').runOracle(['a.kt'], {root: source, out});
  return {text, psi, dump: fs.readFileSync(path.join(out, psi.dump), 'utf8')};
}
function comparison(root, ref) {
  const [{parser}] = api.loadParsers([{label: 'candidate', root}]);
  const tree = api.parseText(parser, ref.text);
  try { return {result: api.compareInput({...ref, tree}), error: tree.rootNode.hasError,
    cst: tree.rootNode.toString(), facts: api.lexicalFacts(tree.rootNode)}; }
  finally { tree.delete?.(); }
}
describe.skipIf(!available)('permanent native comparison regressions', () => {
  it('retains ERROR recovery and comments in complete fingerprints', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-recovery-'));
    try {
      const unwrapped = variant(dir, 'unwrapped', root => replace(path.join(root, 'src/parser.c'),
        '[sym_type_projection] = {\n    .visible = true,', '[sym_type_projection] = {\n    .visible = false,'));
      const ref = reference(dir, 'fun f() {\n  1 < x = y\n}\n');
      const a = comparison(ROOT, ref), b = comparison(unwrapped, ref);
      expect(a.error && b.error).toBe(true); expect(a.facts.tokens).toEqual(b.facts.tokens);
      expect(a.result.treeHash).not.toBe(b.result.treeHash);
      const hidden = variant(dir, 'hidden-comment', root => replace(path.join(root, 'src/parser.c'),
        '[sym_line_comment] = {\n    .visible = true,', '[sym_line_comment] = {\n    .visible = false,'));
      ref.text = 'val x=1 // retained comment\n';
      const [psi] = require('../psi-oracle/oracle').runOracle(['a.kt'], {root: (() => {
        fs.writeFileSync(path.join(dir, 'input/a.kt'), ref.text); return path.join(dir, 'input');
      })(), out: path.join(dir, 'psi2')});
      ref.psi = psi; ref.dump = fs.readFileSync(path.join(dir, 'psi2', psi.dump), 'utf8');
      expect(comparison(ROOT, ref).result.verdict).toBe('ok');
      expect(comparison(hidden, ref).result.verdict).toBe('C');
    } finally { fs.rmSync(dir, {recursive: true}); }
  }, 180000);
  it('detects a later named-tree discrepancy behind an unchanged comment discrepancy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-masked-'));
    try {
      const hide = root => replace(path.join(root, 'src/parser.c'),
        '[sym_line_comment] = {\n    .visible = true,', '[sym_line_comment] = {\n    .visible = false,');
      const first = variant(dir, 'comment', hide), second = variant(dir, 'named', root => {
        hide(root); replace(path.join(root, 'src/parser.c'),
          '[sym_type_projection] = {\n    .visible = true,', '[sym_type_projection] = {\n    .visible = false,');
      });
      const ref = reference(dir, 'val ref: List<Int> = xs // comment\n');
      const a = comparison(first, ref), b = comparison(second, ref);
      expect(ref.psi.psiErrors).toBe(0); expect(a.error || b.error).toBe(false);
      expect(a.result.key).toBe(b.result.key); expect(a.result.treeHash).not.toBe(b.result.treeHash);
      expect(a.facts).toEqual(b.facts);
    } finally { fs.rmSync(dir, {recursive: true}); }
  }, 180000);
  it('rejects a rebuilt scanner that loses nested comments', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-nested-'));
    try {
      const bad = variant(dir, 'bad', root => {
        const start = 'static bool scan_multiline_comment(TSLexer *lexer, bool *newline, uint32_t *bytes) {';
        replace(path.join(root, 'src/scanner.c'), start, start + '\n  return false;\n');
      });
      const ref = reference(dir, 'val x=1 /* a /* b */ c */\n');
      expect(ref.psi.psiErrors).toBe(0); expect(comparison(ROOT, ref).result.verdict).toBe('ok');
      expect(comparison(bad, ref).result.verdict).not.toBe('ok');
    } finally { fs.rmSync(dir, {recursive: true}); }
  }, 180000);
  it('keeps nullable-reference token ownership distinct on real scanner variants', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-quest-'));
    try {
      const corrected = variant(dir, 'corrected', correctQuest);
      const source = path.join(dir, 'input'); fs.mkdirSync(source);
      for (const [i, form] of ['String?::plus', 'String? ::plus', 'String?\t::plus', 'String?? ::plus'].entries()) {
        const text = 'val ref = ' + form; fs.writeFileSync(path.join(source, 'a.kt'), text);
        const out = path.join(dir, 'psi' + i), [psi] = require('../psi-oracle/oracle').runOracle(['a.kt'], {root: source, out});
        const ref = {text, psi, dump: fs.readFileSync(path.join(out, psi.dump), 'utf8')};
        expect(comparison(corrected, ref).result.verdict).toBe('ok');
        expect(comparison(ROOT, ref).result.verdict).toBe(i ? 'C' : 'ok');
      }
    } finally { fs.rmSync(dir, {recursive: true}); }
  }, 180000);
});
