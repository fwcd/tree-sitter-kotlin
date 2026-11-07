import { it, expect, describe } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const { Coverage } = require('./fuzz-coverage');
const { renderer, grammar, graph, descendants } = require('./fuzz-grammar');
const { FEATURES, generated } = require('./fuzz-generate');
const { argumentsOf, run } = require('./fuzz');

it('renders grammar combinators and derives operator alternatives from the checked-in grammar', () => {
  const allowed = grammar.rules._additive_operator.members.map(n => n.value);
  const emit = renderer(() => 0, { _expression: 'x' });
  expect(emit('additive_expression')).toBe(`x ${allowed[0]} x`);
  expect(graph.additive_expression).toContain('_additive_operator');
});

it('records sets and file frequencies without crediting PSI-invalid inputs', () => {
  const c = new Coverage();
  c.add({ accepted: false });
  c.add({ accepted: true, nativeRejected: true, coverage: {
    nativeTypes: ['source_file', 'function_declaration'], nativePairs: ['source_file > function_declaration'],
    psiTypes: ['kotlin.FILE', 'FUN'], psiPairs: ['kotlin.FILE > FUN'],
  } }, { kind: 'generated', feature: 'f' });
  const snapshot = c.snapshot();
  expect(snapshot.files).toBe(1);
  expect(snapshot.views.generated.nativeTypes.function_declaration).toBe(1);
  expect(snapshot.views.nativeClean.nativeTypes).toEqual({});
  expect(snapshot.intended.nativeTypes).toHaveLength(145);
  expect(snapshot.notEmitted.FILE).toMatch(/wrapper/);
  expect(snapshot.views.all.summary.psiTokenTotal).toBe(150);
  expect(snapshot.intended.psiTypes).toContain('constructor');
});

it('handles prototype-named future grammar rules and context children as ordinary keys', () => {
  expect(Object.getPrototypeOf(graph)).toBeNull();
  expect([...descendants('constructor')]).toEqual(['constructor']);
  const c = new Coverage();
  c.views.all.nativePairs.set('source_file > constructor', 1);
  c.views.all.nativePairs.set('constructor > __proto__', 1);
  const parents = c.snapshot().views.all.nativeParentContexts;
  expect(parents.constructor).toEqual(['source_file']);
  expect(parents.__proto__).toEqual(['constructor']);
});

it('keeps deterministic initial coverage cycles and biases later choices toward missing productions', () => {
  const c = new Coverage();
  const first = Array.from({ length: FEATURES.length }, (_, i) => generated('cycle', i, 1, c));
  expect(first.map(i => i.origin.feature)).toEqual(FEATURES);
  expect(first).toEqual(Array.from({ length: FEATURES.length }, (_, i) => generated('cycle', i, 1, new Coverage())));
  expect(c.weight(['backing_field'])).toBeGreaterThan(1);
  c.views.generated.nativeTypes.set('backing_field', 100);
  expect(c.weight(['backing_field'])).toBeLessThan(new Coverage().weight(['backing_field']));
});

const available = require('../psi-oracle/fetch').isFetched() &&
  fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));
describe.skipIf(!available)('actual mixed generator coverage', () => {
  it('generates every family despite every-third source mutation and retains consumable clusters', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-coverage-'));
    try {
      const source = path.join(dir, 'source'); fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'a.kt'), 'val a = 1\n');
      const result = await run({ ...argumentsOf([]), grammar: ROOT, runtime: ROOT, corpus: source,
        seed: 'coverage-mixed', depth: 1, maxInputs: 1 + Math.ceil(FEATURES.length * 1.5),
        maxSeconds: 90, minSeconds: 5, minCandidates: 16, minRounds: 8,
        out: path.join(dir, 'out'), bugs: path.join(dir, 'bugs') });
      expect(Object.keys(result.coverage.generatedFeatures).sort()).toEqual([...FEATURES].sort());
      expect(result.coverage.views.generated.nativeTypes).toHaveProperty('backing_field');
      expect(result.files.every(item => item.id && fs.existsSync(item.file) && fs.existsSync(item.sidecar))).toBe(true);
      const index = JSON.parse(fs.readFileSync(result.indexPath));
      expect(index).not.toHaveProperty('coverage');
      const compact = JSON.parse(fs.readFileSync(path.join(result.out, index.coverageRef)));
      expect(compact.views.generated.summary).toEqual(result.coverage.views.generated.summary);
      expect(compact.missing).toEqual(result.coverage.views.all.missing);
      expect(compact.views.generated).not.toHaveProperty('nativeTypes');
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 120000);
});
