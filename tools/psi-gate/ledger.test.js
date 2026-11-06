import { it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const { readLedger, readGrammarInput } = require('./fuzz-state');

it('keeps the tracked ledger within its completed-promotion and hash invariants', () => {
  const tracked = path.join(import.meta.dirname, 'grammar-bugs');
  const entries = readLedger(tracked);
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    expect(entry.timeBoundReached, entry.id).toBe(false);
    expect(Buffer.byteLength(readGrammarInput(tracked, entry).text), entry.id).toBeLessThanOrEqual(1000);
    expect(Object.keys(entry.provenance || {}).length, entry.id).toBeGreaterThan(0);
  }
});
