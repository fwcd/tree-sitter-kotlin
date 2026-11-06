import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const directory = path.join(import.meta.dirname, 'grammar-bugs');
const { sha256 } = require('../safety');
const cases = JSON.parse(fs.readFileSync(path.join(directory, 'catalog-ledger.json'))).cases
  .filter(entry => entry.id.startsWith('coverage-'));

it('retains completed, bounded coverage witnesses and their source/PSI hashes', () => {
  expect(cases.length).toBeGreaterThanOrEqual(7);
  for (const entry of cases) {
    const source = fs.readFileSync(path.join(directory, entry.file));
    const psi = fs.readFileSync(path.join(directory, entry.psiFile));
    expect(sha256(source), entry.id).toBe(entry.sourceSha256);
    expect(sha256(psi), entry.id).toBe(entry.psiSha256);
    expect(source.length, entry.id).toBe(entry.minimizedBytes);
    expect(source.length, entry.id).toBeLessThanOrEqual(1000);
    expect(entry.timeBoundReached, entry.id).toBe(false);
    expect(entry.origin.feature, entry.id).toBeTruthy();
  }
});

