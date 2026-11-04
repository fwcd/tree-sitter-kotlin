import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { isFetched } = require('../psi-oracle/fetch');
const { listInputs } = require('../cross-validation/diff-run');
const invoke = (root, out, extra = [], env = {}) =>
  spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'tools/cross-validation/diff-run.js'),
      '--corpus',
      'audit',
      '--root',
      root,
      '--out',
      out,
      ...extra,
    ],
    { cwd: ROOT, encoding: 'utf8', timeout: 30000, env: { ...process.env, ...env } },
  );
const output = (run) => run.stderr + run.stdout;
it('rejects an empty or missing input inventory before starting workers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-empty-'));
  try {
    const run = invoke(dir, path.join(dir, 'report'));
    expect(run.status).toBe(1);
    expect(output(run)).toMatch(/empty run/);
    fs.writeFileSync(path.join(dir, 'list'), 'missing.kt\n');
    expect(() => listInputs({ root: dir, list: path.join(dir, 'list') })).toThrow(/Missing/);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
let hasJava = false;
try {
  hasJava = Boolean(require('../safety').javaExecutable());
} catch {}
const missing = [
  !hasJava && 'JDK 17+',
  !isFetched() && 'npm run psi-oracle:fetch',
  !fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node')) &&
    'npm install (native binding)',
].filter(Boolean);
if (missing.length)
  process.stderr.write('PSI integration tests skipped; missing: ' + missing.join(', ') + '\n');
const available =
  hasJava &&
  isFetched() &&
  fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));
describe.skipIf(!available)('actual oracle and worker failures', () => {
  it('checks the four nullable-reference token ranges on real grammar variants', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-real-ranges-'));
    try {
      for (const name of ['src', 'bindings'])
        fs.cpSync(path.join(ROOT, name), path.join(dir, name), { recursive: true });
      for (const name of ['binding.gyp', 'package.json'])
        fs.copyFileSync(path.join(ROOT, name), path.join(dir, name));
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
      const scanner = path.join(dir, 'src/scanner.c');
      let source = fs.readFileSync(scanner, 'utf8');
      const at = source.indexOf(
        "if (valid_symbols[CALLABLE_REFERENCE_QUEST] && lexer->lookahead == '?')",
      );
      const before = source.slice(0, at),
        after = source.slice(at);
      source =
        before +
        after.replace(
          "while (lexer->lookahead == ' ' || lexer->lookahead == '\\t') skip(lexer);",
          "while (lexer->lookahead == ' ' || lexer->lookahead == '\\t') advance(lexer);",
        );
      fs.writeFileSync(scanner, source);
      const build = spawnSync(
        process.execPath,
        [
          process.env.npm_config_node_gyp ||
            require.resolve('node-gyp/bin/node-gyp.js', {
              paths: [path.join(ROOT, 'tools/psi-gate'), ROOT],
            }),
          'rebuild',
        ],
        { cwd: dir, encoding: 'utf8', timeout: 180000 },
      );
      expect(build.status, output(build)).toBe(0);
      const api = require('../cross-validation/diff-run');
      const parsers = api.loadParsers([
        { label: 'base', root: dir },
        { label: 'head', root: ROOT },
      ]);
      const inputs = path.join(dir, 'inputs');
      fs.mkdirSync(inputs);
      const forms = ['String?::plus', 'String? ::plus', 'String?\t::plus', 'String?? ::plus'];
      forms.forEach((form, i) =>
        fs.writeFileSync(path.join(inputs, i + '.kt'), 'val ref = ' + form),
      );
      const out = path.join(dir, 'psi');
      const entries = require('../psi-oracle/oracle').runOracle(
        forms.map((_, i) => i + '.kt'),
        { root: inputs, out },
      );
      for (let i = 0; i < forms.length; i++) {
        const text = 'val ref = ' + forms[i],
          psi = entries[i],
          dump = fs.readFileSync(path.join(out, psi.dump), 'utf8');
        const verdicts = parsers.map(({ parser }) =>
          api.classify({ text, tree: api.parseText(parser, text), psi, dump }),
        );
        expect(verdicts[0].verdict).toBe('ok');
        expect(verdicts[1].verdict).toBe(i === 0 ? 'ok' : 'C');
        if (i) expect(verdicts[1].key).toMatch(/token span/);
      }
      for (const labels of [
        ['head1=' + dir, 'head2=' + ROOT],
        ['head2=' + ROOT, 'head1=' + dir],
      ]) {
        const out = path.join(dir, 'multi-' + labels[0].slice(0, 5));
        const run = invoke(inputs, out, [
          '--grammar',
          labels[0],
          '--grammar',
          labels[1],
          '--grammar',
          'base=' + dir,
        ]);
        expect(run.status, output(run)).toBe(1);
        const failures = JSON.parse(fs.readFileSync(path.join(out, 'gate.json'), 'utf8')).failures;
        expect(failures.filter((f) => f.grammar === 'head2').map((f) => f.path).sort()).toEqual(['1.kt', '2.kt', '3.kt']);
        const minimize = spawnSync(
          process.execPath,
          [
            path.join(ROOT, 'tools/cross-validation/minimize.js'),
            '--run',
            out,
            '--label',
            'head2',
            '--failing',
            '--limit',
            '1',
          ],
          { cwd: ROOT, encoding: 'utf8', timeout: 30000 },
        );
        expect(minimize.status, output(minimize)).toBe(0);
        const reduced = JSON.parse(fs.readFileSync(path.join(out, 'minimized.json'), 'utf8'));
        expect(reduced).toHaveLength(1);
        expect(failures.some((f) => f.path === reduced[0].example)).toBe(true);
      }
      // Preserve the short old gap but fix the long reference only in base.
      const conditional = fs
        .readFileSync(scanner, 'utf8')
        .replace(
          "while (lexer->lookahead == ' ' || lexer->lookahead == '\\t') advance(lexer);",
          "while (lexer->lookahead == ' ' || lexer->lookahead == '\\t') { if (lexer->get_column(lexer) > 30) advance(lexer); else skip(lexer); }",
        );
      fs.writeFileSync(scanner, conditional);
      const rebuild = spawnSync(
        process.execPath,
        [
          process.env.npm_config_node_gyp ||
            require.resolve('node-gyp/bin/node-gyp.js', {
              paths: [path.join(ROOT, 'tools/psi-gate'), ROOT],
            }),
          'rebuild',
        ],
        { cwd: dir, encoding: 'utf8', timeout: 180000 },
      );
      expect(rebuild.status, output(rebuild)).toBe(0);
      for (const oldCount of [5, 3]) {
        const source = path.join(dir, 'mixed-' + oldCount);
        fs.mkdirSync(source);
        for (let n = 0; n < oldCount; n++)
          fs.writeFileSync(
            path.join(source, 'old' + n + '.kt'),
            'val x' + n + ' = String? ::plus\n',
          );
        fs.writeFileSync(
          path.join(source, 'regressed.kt'),
          'val deliberately_long_variable_name_for_failure = String? ::plus\n',
        );
        const runDir = path.join(dir, 'mixed-run-' + oldCount);
        const run = invoke(source, runDir, [
          '--grammar',
          'head=' + ROOT,
          '--grammar',
          'base=' + dir,
        ]);
        expect(run.status, output(run)).toBe(1);
        const gate = JSON.parse(fs.readFileSync(path.join(runDir, 'gate.json'), 'utf8'));
        expect([...new Set(gate.failures.map((f) => f.path))]).toEqual(['regressed.kt']);
        const bucket = JSON.parse(
          fs.readFileSync(path.join(runDir, 'buckets.json'), 'utf8'),
        ).buckets.find((b) => b.counts.head);
        fs.writeFileSync(
          path.join(runDir, 'minimized.json'),
          JSON.stringify([
            {
              key: bucket.key,
              label: 'head',
              example: 'old0.kt',
              reproduced: true,
              counts: bucket.counts,
              verdict: bucket.verdict,
              snippet: 'old unchanged witness',
            },
          ]),
        );
        const minimize = spawnSync(
          process.execPath,
          [
            path.join(ROOT, 'tools/cross-validation/minimize.js'),
            '--run',
            runDir,
            '--label',
            'head',
            '--failing',
            '--limit',
            '1',
          ],
          { cwd: ROOT, encoding: 'utf8', timeout: 30000 },
        );
        expect(minimize.status, output(minimize)).toBe(0);
        const reduced = JSON.parse(fs.readFileSync(path.join(runDir, 'minimized.json'), 'utf8'));
        expect(reduced).toHaveLength(1);
        expect(reduced[0]).toMatchObject({
          example: 'regressed.kt',
          label: 'head',
          reproduced: true,
        });
      }
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  }, 180000);
  it('detects a comment with matching start but an incorrect end', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-comment-'));
    fs.writeFileSync(path.join(dir, 'a.kt'), 'val x=1 //c\n');
    try {
      const api = require('../cross-validation/diff-run');
      const [{ parser }] = api.loadParsers([{ label: 'head', root: ROOT }]);
      const text = fs.readFileSync(path.join(dir, 'a.kt'), 'utf8'),
        tree = api.parseText(parser, text);
      const out = path.join(dir, 'out'),
        [psi] = require('../psi-oracle/oracle').runOracle(['a.kt'], { root: dir, out });
      const dump = fs.readFileSync(path.join(out, psi.dump), 'utf8');
      expect(api.classify({ text, tree, psi, dump }).verdict).toBe('ok');
      const node = tree.rootNode;
      const changed = {
        rootNode: {
          hasError: node.hasError,
          toString: node.toString.bind(node),
          walk: () => {
            const cursor = node.walk();
            return new Proxy(cursor, {
              get: (target, key) => {
                if (key === 'endIndex' && cursor.nodeType === 'line_comment')
                  return cursor.endIndex + 1;
                const value = cursor[key];
                return typeof value === 'function' ? value.bind(cursor) : value;
              },
            });
          },
        },
      };
      expect(api.classify({ text, tree: changed, psi, dump })).toMatchObject({
        verdict: 'C',
        key: 'C comment extent differs from PSI',
      });
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  }, 10000);
  it('rejects edited cached inputs, incomplete reports and incorrect corpus claims', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-execution-')),
      input = path.join(dir, 'input'),
      out = path.join(dir, 'run');
    fs.mkdirSync(input);
    const file = path.join(input, 'a.kt');
    fs.writeFileSync(file, 'val x=1\n');
    try {
      let run = invoke(input, out);
      expect(output(run)).toContain('PASS');
      expect(run.status).toBe(0);
      fs.writeFileSync(file, 'val typeof=1\n');
      run = invoke(input, out);
      expect(run.status).toBe(1);
      expect(output(run)).toMatch(/stale/);
      run = invoke(input, out, ['--fresh']);
      expect(run.status).toBe(1);
      expect(output(run)).toMatch(/difference/);
      fs.rmSync(path.join(out, 'shards/00000.jsonl.sha256'));
      run = invoke(input, out, ['--report-only']);
      expect(run.status).toBe(1);
      fs.writeFileSync(file, 'fun f() {}\n');
      fs.writeFileSync(
        path.join(input, 'cases.json'),
        JSON.stringify({ 'a.kt': { name: 'wrong claim', error: true } }),
      );
      run = invoke(input, out, ['--fresh']);
      expect(run.status).toBe(1);
      expect(output(run)).toMatch(/corpus-claim/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  }, 30000);
  it('fails invalid UTF-8, a worker startup crash, and a timed-out oracle', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-crash-')),
      input = path.join(dir, 'input');
    fs.mkdirSync(input);
    fs.writeFileSync(path.join(input, 'a.kt'), Buffer.from([0xff]));
    try {
      let run = invoke(input, path.join(dir, 'invalid'));
      expect(run.status).toBe(1);
      expect(output(run)).toMatch(/oracle-failure/);
      fs.writeFileSync(path.join(input, 'a.kt'), 'val x=1\n');
      run = invoke(input, path.join(dir, 'worker'), ['--grammar', 'head=' + dir]);
      expect(run.status).toBe(1);
      expect(output(run)).toMatch(/Worker .*failed/);
      run = invoke(input, path.join(dir, 'timeout'), ['--timeout-ms', '1']);
      expect(run.status).toBe(1);
      expect(output(run)).toMatch(/failed|complete/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  }, 30000);
});
