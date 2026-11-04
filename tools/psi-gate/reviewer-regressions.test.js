import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const api = require('../cross-validation/diff-run');
const { variantBuild } = require('./test-prerequisites');
const buildSetup = variantBuild(ROOT);
const output = (result) => result.stdout + result.stderr;
const invoke = (script, args, env = {}) => spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env },
});
const diff = (source, out, grammars, extra = [], env = {}) => invoke('tools/cross-validation/diff-run.js', [
  '--corpus', 'reviewer', '--root', source, '--out', out, '--jobs', '1',
  ...grammars.flatMap(([label, root]) => ['--grammar', label + '=' + root]), ...extra,
], env);
const minimize = (out) => invoke('tools/cross-validation/minimize.js', ['--run', out, '--label', 'head', '--failing', '--limit', '1']);
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
let hasJava = false;
try { hasJava = Boolean(require('../safety').javaExecutable()); } catch {}
const missing = [
  !hasJava && 'JDK 17+',
  !require('../psi-oracle/fetch').isFetched() && 'npm run psi-oracle:fetch',
  !fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node')) &&
    'npm install (native binding)',
  ...buildSetup.missing,
].filter(Boolean);
const available = missing.length === 0;
if (!available)
  process.stderr.write('Reviewer native regressions skipped; missing: ' + missing.join(', ') + '\n');

describe.skipIf(!available)('permanent reviewer native reproductions', () => {
  it('detects identical-leaf ERROR recovery structure and retained-comment loss', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-recovery-'));
    try {
      // A hermetic visibility variant pins the real a806574 recovery change without fetching history.
      const unwrapped = variant(dir, 'unwrapped', (root) => replace(path.join(root, 'src/parser.c'),
        '[sym_type_projection] = {\n    .visible = true,', '[sym_type_projection] = {\n    .visible = false,'));
      const hiddenComment = variant(dir, 'hidden-comment', (root) => replace(path.join(root, 'src/parser.c'),
        '[sym_line_comment] = {\n    .visible = true,', '[sym_line_comment] = {\n    .visible = false,'));
      const source = input(dir, 'structure', 'fun f() {\n    1 < x = y\n}\n');
      const text = fs.readFileSync(path.join(source, 'a.kt'), 'utf8');
      const trees = api.loadParsers([
        { label: 'base', root: unwrapped }, { label: 'head', root: ROOT },
      ]).map(({ parser }) => parser.parse(text).rootNode);
      expect(trees.every((tree) => tree.hasError)).toBe(true);
      expect(trees[0].toString()).not.toBe(trees[1].toString());
      expect(api.lexicalFacts(trees[0]).tokens).toEqual(api.lexicalFacts(trees[1]).tokens);
      let out = path.join(dir, 'structure-run');
      let result = diff(source, out, [['head', ROOT], ['base', unwrapped]]);
      expect(result.status, output(result)).toBe(1);
      expect(JSON.parse(fs.readFileSync(path.join(out, 'gate.json'))).failures).toHaveLength(1);
      for (const [name, text] of [['error', '} // retained comment\n'], ['clean', 'val x=1 // retained comment\n']]) {
        const source = input(dir, name, text);
        out = path.join(dir, name + '-run');
        result = diff(source, out, [['head', hiddenComment], ['base', ROOT]]);
        expect(result.status, output(result)).toBe(1);
        expect(JSON.parse(fs.readFileSync(path.join(out, 'gate.json'))).failures).toHaveLength(1);
      }
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 180000);

  it('detects a new clean named-tree mismatch behind the same old comment discrepancy', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-clean-masked-'));
    try {
      const hideComment = (root) => replace(path.join(root, 'src/parser.c'),
        '[sym_line_comment] = {\n    .visible = true,',
        '[sym_line_comment] = {\n    .visible = false,');
      const base = variant(dir, 'old-comment-gap', hideComment);
      const head = variant(dir, 'new-named-gap', (root) => {
        hideComment(root);
        replace(path.join(root, 'src/parser.c'),
          '[sym_type_projection] = {\n    .visible = true,',
          '[sym_type_projection] = {\n    .visible = false,');
      });
      const text = 'val ref: List<Int> = xs // retained comment\n';
      const source = input(dir, 'input', text);
      const out = path.join(dir, 'run');
      const result = diff(source, out, [['head', head], ['base', base]]);
      expect(result.status, output(result)).toBe(1);
      const meta = JSON.parse(fs.readFileSync(path.join(out, 'meta.json')));
      const [record] = require('./state').complete(out, meta.identity);
      expect(record.psiErrors).toBe(0);
      expect(record.results.head.hasError).toBe(false);
      expect(record.results.base.hasError).toBe(false);
      expect(record.results.head.key).toBe(record.results.base.key);
      expect(record.results.head.treeHash).not.toBe(record.results.base.treeHash);
      const facts = api.loadParsers([{ label: 'base', root: base }, { label: 'head', root: head }])
        .map(({ parser }) => api.lexicalFacts(parser.parse(text).rootNode));
      expect(facts[0]).toEqual(facts[1]);
      expect(output(result)).toMatch(/Complete comparison changed behind the same first bucket/);
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 180000);

  it('builds a documented-setup clone from project dependencies without the gate runtime', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-setup-clone-'));
    try {
      const clone = path.join(dir, 'clone');
      const result = spawnSync('git', ['clone', '--shared', ROOT, clone], {
        encoding: 'utf8', timeout: 30000,
      });
      expect(result.status, output(result)).toBe(0);
      expect(fs.existsSync(path.join(clone, 'tools/psi-gate/node_modules'))).toBe(false);
      // npm install provides these public packages at the project prefix. Copy the
      // installed packages for this hermetic test; the complete recipe is run separately.
      fs.mkdirSync(path.join(clone, 'node_modules'));
      for (const name of ['node-addon-api', 'node-gyp-build'])
        fs.cpSync(buildSetup.dependencies[name], path.join(clone, 'node_modules', name), { recursive: true });
      const setup = variantBuild(clone, buildSetup.nodeGyp);
      expect(setup.missing).toEqual([]);
      for (const file of Object.values(setup.dependencies))
        expect(file.startsWith(path.join(clone, 'node_modules') + path.sep)).toBe(true);
      const built = spawnSync(process.execPath, [setup.nodeGyp, 'rebuild'], {
        cwd: clone, encoding: 'utf8', timeout: 180000,
      });
      expect(built.status, output(built)).toBe(0);
      const [{ parser }] = api.loadParsers([{ label: 'clone', root: clone }]);
      expect(parser.parse('val x=1').rootNode.hasError).toBe(false);
      expect(fs.existsSync(path.join(clone, 'tools/psi-gate/node_modules'))).toBe(false);
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 180000);

  it('detects the nested-comment scanner regression as sole and later candidate in both orders', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-nested-'));
    try {
      const bad = variant(dir, 'bad', (root) => {
        const start = 'static bool scan_multiline_comment(TSLexer *lexer, bool *newline, uint32_t *bytes) {';
        replace(path.join(root, 'src/scanner.c'), start, start + '\n  return false;\n');
      });
      const source = input(dir, 'input', 'val x = 1 /* a /* b */ c */\n');
      for (const [i, candidates] of [ [['head', bad]], [['head1', ROOT], ['head2', bad]], [['head2', bad], ['head1', ROOT]] ].entries()) {
        const out = path.join(dir, 'run-' + i);
        const result = diff(source, out, [...candidates, ['base', ROOT]]);
        expect(result.status, output(result)).toBe(1);
        const gate = JSON.parse(fs.readFileSync(path.join(out, 'gate.json')));
        expect(gate.failures.some((failure) => failure.grammar === (i ? 'head2' : 'head'))).toBe(true);
      }
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 180000);

  it('rejects cached minima after live input edits and a corrected/rebuilt grammar', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-min-cache-'));
    try {
      const base = variant(dir, 'base', correctQuest);
      const head = variant(dir, 'mutable-head', () => {});
      const source = input(dir, 'input', 'val ref = String? ::plus\n');
      const out = path.join(dir, 'run');
      expect(diff(source, out, [['head', head], ['base', base]]).status).toBe(1);
      let result = minimize(out);
      expect(result.status, output(result)).toBe(0);
      const cached = fs.readFileSync(path.join(out, 'minimized.json'));
      // A forged cached snippet must be rechecked, even while the run identity is current.
      const entries = JSON.parse(cached);
      entries[0].snippet = 'val x=1\n';
      fs.writeFileSync(path.join(out, 'minimized.json'), JSON.stringify(entries));
      result = minimize(out);
      expect(result.status, output(result)).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(out, 'minimized.json')))[0].snippet).not.toBe(entries[0].snippet);
      fs.writeFileSync(path.join(source, 'a.kt'), 'val x=1\n');
      for (const withCache of [true, false]) {
        if (withCache) fs.writeFileSync(path.join(out, 'minimized.json'), cached);
        else fs.rmSync(path.join(out, 'minimized.json'));
        result = minimize(out);
        expect(result.status, output(result)).toBe(1);
        expect(output(result)).toMatch(/run is stale.*rerun the gate/);
      }
      fs.writeFileSync(path.join(source, 'a.kt'), 'val ref = String? ::plus\n');
      correctQuest(head);
      build(head);
      for (const withCache of [true, false]) {
        if (withCache) fs.writeFileSync(path.join(out, 'minimized.json'), cached);
        else fs.rmSync(path.join(out, 'minimized.json'));
        result = minimize(out);
        expect(result.status, output(result)).toBe(1);
        expect(output(result)).toMatch(/run is stale.*rerun the gate/);
      }
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 180000);

  it('rejects checksummed count swaps and corrupted report-only shards through the CLI', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-inventory-'));
    try {
      const source = input(dir, 'input', 'val x=1\n');
      fs.writeFileSync(path.join(source, 'regressed.kt'), 'val y=2\n');
      const out = path.join(dir, 'run');
      expect(diff(source, out, [['head', ROOT], ['base', ROOT]]).status).toBe(0);
      const shard = path.join(out, 'shards/00000.jsonl');
      const records = fs.readFileSync(shard, 'utf8').trim().split('\n').map(JSON.parse);
      for (const record of records) {
        const bad = { verdict: 'A', key: 'A same bucket', treeHash: 'bad' };
        const good = { verdict: 'ok', treeHash: 'good' };
        record.results = record.path === 'a.kt' ? { base: bad, head: good } : { base: good, head: bad };
      }
      const bytes = records.map((row) => JSON.stringify(row)).join('\n') + '\n';
      fs.writeFileSync(shard, bytes);
      fs.writeFileSync(shard + '.sha256', require('../safety').sha256(bytes));
      let result = diff(source, out, [['head', ROOT], ['base', ROOT]], ['--report-only']);
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toMatch(/regressed.kt/);
      fs.appendFileSync(shard, 'corrupt\n');
      result = diff(source, out, [['head', ROOT], ['base', ROOT]], ['--report-only']);
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toMatch(/Corrupt shard/);
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 60000);

  it('keeps the two ERROR corpus examples and generated JetBrains gaps distinct', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-corpus-review-'));
    try {
      const exported = path.join(dir, 'exported');
      require('./corpus').main([path.join(ROOT, 'test/corpus'), exported]);
      const all = JSON.parse(fs.readFileSync(path.join(exported, 'cases.json')));
      const source = path.join(dir, 'input');
      fs.mkdirSync(source);
      const claims = {};
      for (const file of ['literals/0007.kt', 'comments/0026.kt', 'jetbrains/DoubleColon/0000.kt']) {
        expect(all[file].error).toBe(true);
        expect(all[file].psiClean).toBe(file.startsWith('jetbrains/'));
        fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
        fs.copyFileSync(path.join(exported, file), path.join(source, file));
        claims[file] = all[file];
      }
      fs.writeFileSync(path.join(source, 'cases.json'), JSON.stringify(claims));
      const baseClaims = path.join(dir, 'base-cases.json');
      fs.writeFileSync(baseClaims, JSON.stringify(claims));
      const out = path.join(dir, 'run');
      const result = diff(source, out, [['head', ROOT], ['base', ROOT]], ['--base-cases', baseClaims]);
      expect(result.status, output(result)).toBe(0);
      const gate = JSON.parse(fs.readFileSync(path.join(out, 'gate.json')));
      expect(gate.existingClaims).toEqual([]);
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 60000);

  it('retains exact old positive claims, rejects strict mode and changed bytes with a stale claim', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-claim-review-'));
    try {
      const exported = path.join(dir, 'exported');
      require('./corpus').main([path.join(ROOT, 'test/corpus'), exported]);
      const all = JSON.parse(fs.readFileSync(path.join(exported, 'cases.json')));
      const original = fs.readFileSync(path.join(exported, 'comments/0020.kt'), 'utf8');
      const source = input(dir, 'input', original);
      const claims = { 'a.kt': all['comments/0020.kt'] };
      fs.writeFileSync(path.join(source, 'cases.json'), JSON.stringify(claims));
      const baseClaims = path.join(dir, 'base-cases.json');
      fs.writeFileSync(baseClaims, JSON.stringify(claims));
      const out = path.join(dir, 'run');
      const grammars = [['head', ROOT], ['base', ROOT]];
      let result = diff(source, out, grammars, ['--base-cases', baseClaims]);
      expect(result.status, output(result)).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(out, 'gate.json'))).existingClaims).toHaveLength(1);
      result = diff(source, out, grammars, ['--base-cases', baseClaims, '--strict']);
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toMatch(/corpus-claim/);
      fs.writeFileSync(path.join(source, 'a.kt'), original + '\nval changed = 1\n');
      result = diff(source, out, grammars, ['--base-cases', baseClaims, '--fresh']);
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toMatch(/corpus-claim/);
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 60000);

  it('fails a JVM process exit after a successful version probe', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-jvm-crash-'));
    try {
      const java = path.join(dir, 'java');
      fs.writeFileSync(java, [
        '#!/usr/bin/env node',
        'if(process.argv.includes("-version")){console.error(\'openjdk version "17.0.1"\')}',
        'else{console.error("Injected JVM crash");process.exit(23)}',
        '',
      ].join('\n'));
      fs.chmodSync(java, 0o755);
      const source = input(dir, 'input', 'val x=1\n');
      const result = diff(source, path.join(dir, 'run'), [['head', ROOT]], [], { PSI_JAVA: java });
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toMatch(/Injected JVM crash/);
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 60000);
});

it.skipIf(!available)('refuses CLI traversal, symlink escape and unmarked output without touching sentinels', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-cli-boundaries-'));
  try {
    const source = input(dir, 'input', 'val x=1\n');
    const outside = input(dir, 'outside', 'outside sentinel');
    const list = path.join(source, 'list');
    for (const entry of ['../outside/a.kt', 'escape/a.kt']) {
      if (entry.startsWith('escape')) fs.symlinkSync(outside, path.join(source, 'escape'), 'dir');
      fs.writeFileSync(list, entry + '\n');
      const result = diff(source, path.join(dir, 'out'), [['head', ROOT]], ['--list', list]);
      expect(result.status, output(result)).toBe(1);
      expect(output(result)).toMatch(/Unsafe|escapes/);
    }
    const unmarked = path.join(dir, 'unmarked');
    fs.mkdirSync(unmarked);
    fs.writeFileSync(path.join(unmarked, 'keep'), 'output sentinel');
    const result = diff(source, unmarked, [['head', ROOT]], ['--fresh']);
    expect(result.status, output(result)).toBe(1);
    expect(output(result)).toMatch(/unmarked output/);
    expect(fs.readFileSync(path.join(outside, 'a.kt'), 'utf8')).toBe('outside sentinel');
    expect(fs.readFileSync(path.join(unmarked, 'keep'), 'utf8')).toBe('output sentinel');
  } finally { fs.rmSync(dir, { recursive: true }); }
});
