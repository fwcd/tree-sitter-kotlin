import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { generate } = require('./vendor-jetbrains-tests');

let directory, fixtures;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jetbrains-suite-test-'));
  fixtures = path.join(directory, 'fixtures'); fs.mkdirSync(fixtures);
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
function pair(name, source, golden = 'PROPERTY') {
  const file = path.join(fixtures, name + '.kt'); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source); fs.writeFileSync(path.join(fixtures, name + '.txt'), `KtFile: ${path.basename(name)}.kt\n  ${golden}\n`);
}
const parser = {
  parse(source) { return { rootNode: { hasError: source.includes('untyped'), toString: () => '(source_file)' } }; },
};

describe('complete JetBrains corpus', () => {
  it('keeps supported-policy parse failures as explicit error tests and records them', () => {
    pair('Clean', 'val x=1'); pair('Gap', 'fun f(untyped){}', 'FUN');
    const report = generate({ fixturesDir: fixtures, root: directory, parser });
    expect(report.generated).toEqual(['Clean', 'Gap']); expect(report.gaps).toEqual([{ id: 'Gap', reason: 'TS_PARSE_ERROR' }]);
    const gap = fs.readFileSync(path.join(directory, 'test/corpus/jetbrains/Gap.txt'), 'utf8');
    expect(gap).toContain('JetBrains PSI: Gap\n:error\n'); expect(gap).toContain('fun f(untyped){}'); expect(gap).not.toContain(':skip');
    const suite = JSON.parse(fs.readFileSync(path.join(directory, 'test/jetbrains-fixtures.json'), 'utf8'));
    expect(suite.comparedFixtures).toBe(2); expect(suite.structuralTests).toEqual(['Clean']); expect(suite.expectedFailures).toEqual(['Gap']);
  });
  it('preserves colliding basenames and rejects an invalid golden before replacing tests', () => {
    pair('a/Same', 'val a=1'); pair('b/Same', 'val b=2');
    generate({ fixturesDir: fixtures, root: directory, parser });
    expect(fs.existsSync(path.join(directory, 'test/corpus/jetbrains/a/Same.txt'))).toBe(true);
    expect(fs.existsSync(path.join(directory, 'test/corpus/jetbrains/b/Same.txt'))).toBe(true);
    pair('Bad', 'val x=', 'PsiErrorElement:missing expression');
    expect(() => generate({ fixturesDir: fixtures, root: directory, parser })).toThrow(/PSI-invalid/);
    expect(fs.existsSync(path.join(directory, 'test/corpus/jetbrains/a/Same.txt'))).toBe(true);
  });
  it('refuses to invent an expectation when the native parser provides no verdict', () => {
    pair('Input', 'val x=1');
    expect(() => generate({ fixturesDir: fixtures, root: directory,
      parser: { parse: () => ({ rootNode: { toString: () => '(source_file)' } }) } })).toThrow(/could not classify/);
  });
});
