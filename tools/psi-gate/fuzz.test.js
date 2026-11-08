import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const { generated, mutated, FEATURES } = require('./fuzz-generate');
const { InspectorPool } = require('./fuzz-compare');
const state = require('./fuzz-state');
const { argumentsOf, sourceInputs, run } = require('./fuzz');
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psi-fuzz-test-'));

it('generates reproducible nested construct combinations and single-site mutants', () => {
  const a = Array.from({ length: FEATURES.length * 2 }, (_, i) => generated('seed', i, 3));
  expect(a).toEqual(Array.from({ length: FEATURES.length * 2 }, (_, i) => generated('seed', i, 3)));
  expect(a).not.toEqual(Array.from({ length: FEATURES.length * 2 }, (_, i) => generated('other', i, 3)));
  expect(new Set(a.map(input => input.origin.feature)).size).toBe(FEATURES.length);
  expect(mutated(a[0], 'seed', 0)).toEqual(mutated(a[0], 'seed', 0));
  expect(a.some(input => input.text.includes('finally'))).toBe(true);
});
it('checks budgets and confines manifest inputs before any work', () => {
  expect(() => argumentsOf(['--max-inputs', '0'])).toThrow(/integer/);
  expect(() => argumentsOf(['--jobs', '3'])).toThrow(/integer/);
  expect(() => argumentsOf(['--list', 'x'])).toThrow(/--corpus/);
  const dir = temporary();
  try {
    const file = path.join(dir, 'manifest.json');
    fs.writeFileSync(file, JSON.stringify({ seeds: [{ root: dir, path: '../outside.kt' }] }));
    expect(() => sourceInputs({ sources: file })).toThrow(/Unsafe/);
    fs.writeFileSync(path.join(dir, 'bad.kt'), Buffer.from([0xff]));
    fs.writeFileSync(file, JSON.stringify({ seeds: [{ root: dir, path: 'bad.kt' }] }));
    expect(() => sourceInputs({ sources: file })).toThrow();
  } finally { fs.rmSync(dir, { recursive: true }); }
});
it('refuses an unowned grammar ledger and serializes writers', () => {
  const dir = temporary();
  try {
    fs.writeFileSync(path.join(dir, 'sentinel'), 'keep');
    expect(() => state.readLedger(dir)).toThrow(/not owned/);
    const lock = path.join(dir, 'lock');
    const release = state.acquireLock(lock);
    expect(() => state.acquireLock(lock)).toThrow(/Another fuzz process/);
    release();
    expect(fs.readFileSync(path.join(dir, 'sentinel'), 'utf8')).toBe('keep');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

let available = false;
try {
  available = Boolean(require('../safety').javaExecutable()) && require('../psi-oracle/fetch').isFetched() &&
    fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));
} catch {}
if (!available) process.stderr.write('Fuzzer native tests skipped; need JDK 17+, npm install and npm run psi-oracle:fetch\n');

describe.skipIf(!available)('live PSI-valid differential fuzzing', () => {
  it('keeps every generator feature PSI-valid and filters invalid mutations', async () => {
    const dir = temporary();
    const inspector = new InspectorPool({ grammar: ROOT, runtime: ROOT, out: dir }, 2);
    try {
      const inputs = FEATURES.map((_, i) => generated('test', i, 2));
      const results = await inspector.inspect(inputs);
      expect(results.map((r, i) => [FEATURES[i], r.accepted])).toEqual(FEATURES.map(f => [f, true]));
      const [bad] = await inspector.inspect([{ text: 'val =', extension: '.kt' }]);
      expect(bad).toMatchObject({ accepted: false });
      expect(bad.classes).toBeUndefined();
    } finally { inspector.close(); fs.rmSync(dir, { recursive: true }); }
  }, 30000);
  it('separates a confirmed empty quest span from unresolved clean AST mismatches', async () => {
    const dir = temporary();
    const inspector = new InspectorPool({ grammar: ROOT, runtime: ROOT, out: dir });
    try {
      const [result] = await inspector.inspect([{ text: 'val ref = String? ::plus', extension: '.kt' }]);
      expect(result.accepted).toBe(true);
      expect(result.grammarDefect).toBe('empty-quest-span');
      expect(result.spanEvidence.native.every(token => token.start === token.end)).toBe(true);
      expect(result.classes[0].signature).toEqual(['grammar', 'token-span', 'quest']);
    } finally { inspector.close(); fs.rmSync(dir, { recursive: true }); }
  }, 30000);
  it('reverifies minimized grammar cases, persists PSI expectations and detects corruption', async () => {
    const dir = temporary();
    const inspector = new InspectorPool({ grammar: ROOT, runtime: ROOT, out: dir });
    try {
      const input = { text: 'val regex = """\\$"""\n', extension: '.kt' };
      const [result] = await inspector.inspect([input]);
      expect(result.accepted).toBe(true);
      expect(result.grammarError).toBe(true);
      const c = result.classes[0];
      const min = await state.minimize(input, c.id, inspector, { candidates: 16, rounds: 8, seconds: 5 });
      expect(min.result.accepted).toBe(true);
      expect(min.result.classes.some(other => other.id === c.id)).toBe(true);
      const bugs = path.join(dir, 'bugs');
      const saved = state.saveGrammarBug(bugs, min, { seed: 'first', revision: 'main', signature: c.signature });
      expect(saved.added).toBe(true);
      expect(state.saveGrammarBug(bugs, min, { seed: 'next', revision: 'main', signature: c.signature }).added).toBe(false);
      const [entry] = state.readLedger(bugs);
      const expected = JSON.parse(fs.readFileSync(path.join(bugs, entry.expected), 'utf8'));
      expect(expected.psi).toEqual(min.result.expectedPsi);
      expect(expected).not.toHaveProperty('dump');
      fs.appendFileSync(path.join(bugs, entry.file), 'corrupt');
      expect(() => state.readLedger(bugs)).toThrow(/Corrupt grammar-bug source/);
    } finally { inspector.close(); fs.rmSync(dir, { recursive: true }); }
  }, 30000);
  it('reproduces identical buckets/minima across seeds and worker scheduling', async () => {
    const dir = temporary();
    try {
      const base = { ...argumentsOf([]), grammar: ROOT, runtime: ROOT, seed: 'determinism', maxInputs: 24,
        depth: 2, minCandidates: 16, minRounds: 8, minSeconds: 5, maxSeconds: 90 };
      const first = await run({ ...base, jobs: 1, out: path.join(dir, 'one'), bugs: path.join(dir, 'bugs') });
      const second = await run({ ...base, jobs: 2, out: path.join(dir, 'two'), bugs: path.join(dir, 'bugs') });
      const comparable = result => result.files.map(b => [b.id, fs.readFileSync(b.file, 'utf8')]);
      expect(comparable(second)).toEqual(comparable(first));
      expect(second.metrics).toEqual(first.metrics);
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 120000);
  it('fails an all-invalid corpus and preserves a source/output overlap', async () => {
    const dir = temporary();
    try {
      const source = path.join(dir, 'source'); fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'a.kt'), 'val =');
      const base = { ...argumentsOf([]), grammar: ROOT, runtime: ROOT, corpus: source, maxInputs: 1,
        out: path.join(dir, 'out'), bugs: path.join(dir, 'bugs') };
      await expect(run(base)).rejects.toThrow(/No PSI-valid inputs/);
      await expect(run({ ...base, out: source })).rejects.toThrow(/must be separate/);
      expect(fs.readFileSync(path.join(source, 'a.kt'), 'utf8')).toBe('val =');
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 30000);
});
