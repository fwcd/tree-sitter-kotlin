import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const api = require('./diff-run');
const oracle = require('../psi-oracle/oracle');
const ledger = require('../psi-gate/grammar-bugs/catalog-ledger.json');
const available = require('../psi-oracle/fetch').isFetched() && fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));

describe.skipIf(!available)('confirmed grammar defects remain visible through normalization', () => {
  let output, refs, parser;
  beforeAll(() => {
    output = fs.mkdtempSync(path.join(os.tmpdir(), 'grammar-catalog-'));
    refs = oracle.runOracle(ledger.cases.map(c => c.file), { root: path.join(ROOT, 'tools/psi-gate/grammar-bugs'), out: output });
    const runtime = fs.existsSync(path.join(ROOT, 'tools/psi-gate/node_modules')) ? path.join(ROOT, 'tools/psi-gate') : ROOT;
    [{ parser }] = api.loadParsers([{ label: 'head', root: ROOT }], runtime);
  }, 120000);
  afterAll(() => { if (output) fs.rmSync(output, { recursive: true }); });
  it.each(ledger.cases.map((c, index) => [c.id, c, index]))('%s', (_, c, index) => {
    const reference = refs[index];
    expect(reference.psiErrors).toBe(0);
    const dump = fs.readFileSync(path.join(output, reference.dump), 'utf8');
    expect(dump).toBe(fs.readFileSync(path.join(ROOT, 'tools/psi-gate/grammar-bugs', c.psiFile), 'utf8'));
    const source = fs.readFileSync(path.join(ROOT, 'tools/psi-gate/grammar-bugs', c.file), 'utf8');
    const tree = api.parseText(parser, source);
    expect(tree.rootNode.hasError).toBe(c.nativeError);
    expect(api.compareInput({ text: source, tree, psi: reference, dump }).verdict).toBe(c.verdict);
  });
});
