import { it, expect, describe, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const { argumentsOf, run } = require('./fuzz');
const { InspectorPool } = require('./fuzz-compare');
const { BudgetExceeded } = require('./fuzz-budget');
const state = require('./fuzz-state');

it('uses current grammar, local suspects, and honors explicit continuous input caps', () => {
  expect(argumentsOf([]).base).toBeUndefined();
  expect(argumentsOf([]).out).toBeUndefined();
  expect(argumentsOf(['--continuous']).maxInputs).toBe(Infinity);
  expect(argumentsOf(['--continuous', '--max-inputs', '1']).maxInputs).toBe(1);
  expect(() => argumentsOf(['--promote'])).toThrow(/removed/);
  expect(() => argumentsOf(['--base', 'old'])).toThrow(/removed/);
});

it('carries the outer deadline through reductions and never starts a final inspection after expiry', async () => {
  let now = 0, calls = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const input = { text: 'val x = 1\n', extension: '.kt' };
  const inspector = { inspect: async (inputs, { deadline }) => {
    expect(deadline).toBe(5); expect(now).toBeLessThan(deadline);
    calls++; now += 4;
    return inputs.map(() => ({ accepted: true, classes: [{ id: 'selected' }] }));
  } };
  try {
    const result = await state.minimize(input, 'selected', inspector, { seconds: 20, deadline: 5 });
    expect(result).toMatchObject({ text: input.text, exhausted: true });
    expect(calls).toBe(2);
  } finally { vi.restoreAllMocks(); }
});

it('requires explicit, completed and compact promotion before touching tracked corpus entries', () => {
  const tracked = path.join(ROOT, 'tools/psi-gate/grammar-bugs');
  const before = fs.readFileSync(path.join(tracked, 'ledger.json'));
  const metadata = { signature: ['grammar', 'test'] };
  const representative = { text: 'x'.repeat(1001), exhausted: false,
    result: { accepted: true, grammarError: true } };
  expect(() => state.saveGrammarBug(tracked, representative, metadata)).toThrow(/--promote/);
  expect(() => state.saveGrammarBug(tracked, representative, { ...metadata, promote: true })).toThrow(/1000 bytes/);
  expect(() => state.saveGrammarBug(tracked, { ...representative, text: 'x', exhausted: true },
    { ...metadata, promote: true })).toThrow(/completed reduction/);
  expect(fs.readFileSync(path.join(tracked, 'ledger.json'))).toEqual(before);
});

let available = false;
try {
  available = require('../psi-oracle/fetch').isFetched() &&
    fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));
} catch {}
describe.skipIf(!available)('actual native rejection and continuous controls', () => {
  it('can inspect new inputs after a representative-level oracle deadline expires', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-budget-'));
    const inspector = new InspectorPool({ grammar: ROOT, runtime: ROOT, out: dir });
    try {
      await inspector.inspect([{ text: 'val x=1\n', extension: '.kt' }]);
      const input = { text: 'fun f(x:Any?) = listOf(x,x,x,x)\n'.repeat(2000), extension: '.kt' };
      await expect(inspector.inspect([input], { deadline: Date.now() + 50 })).rejects.toBeInstanceOf(BudgetExceeded);
      const [result] = await inspector.inspect([{ text: 'val x=1\n', extension: '.kt' }]);
      expect(result.accepted).toBe(true);
    } finally { inspector.close(); fs.rmSync(dir, { recursive: true }); }
  }, 30000);
  it('stores control characters as reviewable JSON without changing the parsed input', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-budget-'));
    const inspector = new InspectorPool({ grammar: ROOT, runtime: ROOT, out: dir });
    try {
      const input = { text: "fun f(){append('" + String.fromCharCode(0) + "')}\n", extension: '.kt' };
      const [original] = await inspector.inspect([input]);
      expect(original.accepted && original.grammarError).toBe(true);
      const c = original.classes[0];
      const min = await state.minimize(input, c.id, inspector, { seconds: 5 });
      const bugs = path.join(dir, 'bugs');
      state.saveGrammarBug(bugs, min, { seed: 'control', signature: c.signature, revision: 'test' });
      const [entry] = state.readLedger(bugs);
      expect(entry).toMatchObject({ sourceEncoding: 'json', extension: '.kt', timeBoundReached: false });
      expect(fs.readFileSync(path.join(bugs, entry.file)).includes(0)).toBe(false);
      expect(state.readGrammarInput(bugs, entry).text).toBe(min.text);
      const [replayed] = await inspector.inspect([state.readGrammarInput(bugs, entry)]);
      expect(replayed.expectedPsi).toEqual(min.result.expectedPsi);
      expect(replayed.classes.map(x => x.id)).toContain(c.id);
    } finally { inspector.close(); fs.rmSync(dir, { recursive: true }); }
  }, 30000);

  it('bounds a real grammar-rejection reduction with a warm oracle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-budget-'));
    const inspector = new InspectorPool({ grammar: ROOT, runtime: ROOT, out: dir });
    try {
      const input = { text: ("fun f(){append('" + String.fromCharCode(0) + "')}\n").repeat(100), extension: '.kt' };
      const [original] = await inspector.inspect([input]);
      expect(original.accepted && original.grammarError).toBe(true);
      const started = Date.now();
      try {
        const result = await state.minimize(input, original.classes[0].id, inspector,
          { seconds: 20, deadline: started + 80, candidates: 128, rounds: 100 });
        expect(result.exhausted).toBe(true);
      } catch (error) { expect(error).toBeInstanceOf(BudgetExceeded); }
      expect(Date.now() - started).toBeLessThan(1000);
    } finally { inspector.close(); fs.rmSync(dir, { recursive: true }); }
  }, 30000);

  it('returns partial/exit2 within the outer budget, including ledger validation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-budget-'));
    const inspector = new InspectorPool({ grammar: ROOT, runtime: ROOT, out: dir });
    try {
      const input = { text: 'val regex = """\\$"""\n', extension: '.kt' };
      const [original] = await inspector.inspect([input]);
      const bugs = path.join(dir, 'bugs');
      state.saveGrammarBug(bugs, { text: input.text, extension: '.kt', exhausted: false, result: original },
        { seed: 'ledger', signature: original.classes[0].signature, revision: 'test' });
      // JVM startup speed is not a deadline control. Expire the clock exactly
      // as ledger inspection returns, independent of source/precompiled launch.
      let now = Date.now();
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const inspect = vi.spyOn(InspectorPool.prototype, 'inspect').mockImplementation(async (inputs, { deadline }) => {
        now = deadline;
        return inputs.map(() => original);
      });
      try {
        const result = await run({ ...argumentsOf([]), grammar: ROOT, runtime: ROOT, maxInputs: 1,
          maxSeconds: 1, minSeconds: 20, batchSize: 1, bugs, out: path.join(dir, 'run') });
        expect(result).toMatchObject({ partial: true, exitCode: 2, stopReason: 'time-budget' });
        expect(result.seconds).toBeLessThan(1.5);
        expect(inspect).toHaveBeenCalledTimes(1);
        expect(state.readLedger(bugs)).toHaveLength(1);
      } finally { vi.restoreAllMocks(); }
    } finally { inspector.close(); fs.rmSync(dir, { recursive: true }); }
  }, 30000);

  it('stops continuous mode at the explicit input limit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-budget-'));
    try {
      const source = path.join(dir, 'source'); fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'a.kt'), 'val a = 1\n');
      const result = await run({ ...argumentsOf(['--continuous', '--max-inputs', '1']), grammar: ROOT,
        runtime: ROOT, corpus: source, maxSeconds: 15, bugs: path.join(dir, 'bugs'), out: path.join(dir, 'run') });
      expect(result).toMatchObject({ exitCode: 0, stopReason: 'input-budget', metrics: { attempted: 1 } });
    } finally { fs.rmSync(dir, { recursive: true }); }
  }, 30000);
});
