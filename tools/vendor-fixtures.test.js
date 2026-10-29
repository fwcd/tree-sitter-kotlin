import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { copyFiles } = require('./vendor-fixtures');
const { listFixtureNames } = require('./cross-validation/fixture-files');

let directory, source, destination;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-vendor-test-'));
  source = path.join(directory, 'source'); destination = path.join(directory, 'fixtures');
  fs.mkdirSync(source); fs.mkdirSync(destination);
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
function pair(name, text, error = false) {
  const file = path.join(source, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text); fs.writeFileSync(file.replace(/\.kts?$/, '.txt'), `KtFile: ${path.basename(name)}\n  ${error ? 'PsiErrorElement:missing expression' : 'PROPERTY'}\n`);
}
describe('PSI-positive fixture selection', () => {
  it('filters actual PSI errors while preserving scripts, namespaces and semantic-negative names', () => {
    pair('a/Same.kt', '// COMPILATION_ERRORS\nval x=1'); pair('b/Same.kt', 'val x=2');
    pair('Clean_ERR.kts', 'val x=3'); pair('Broken.kt', 'val x=', true);
    const report = copyFiles(source, destination);
    expect(report.pairs).toBe(3); expect(report.rejected.map(record => record.id)).toEqual(['Broken']);
    expect(listFixtureNames(destination)).toEqual(['Clean_ERR', 'a/Same', 'b/Same']);
    expect(fs.existsSync(path.join(destination, 'Clean_ERR.kts'))).toBe(true);
  });
  it('fails on modified experimental input instead of silently broadening its exclusion', () => {
    pair('companionBlocks/smoke.kt', 'changed fixture');
    expect(() => copyFiles(source, destination, ['.kt'], '.txt',
      { upstreamRoot: 'compiler/psi/psi-impl/testData/psi' })).toThrow(/policy needs review/);
  });
  it('does not apply a policy by basename to another source path', () => {
    pair('other/companionBlocks/smoke.kt', 'val x=1');
    const report = copyFiles(source, destination, ['.kt'], '.txt',
      { upstreamRoot: 'compiler/psi/psi-impl/testData/psi' });
    expect(report.pairs).toBe(1); expect(report.contextExclusions).toEqual([]);
  });
});
