import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { psiLayout, psiTypeAt, firstDivergence, classify, summarize, trimPath } = require('./diff-run');
const { Node } = require('./models');
const { grammarRoot, MISSING } = require('../grammar-root');

const CLEAN_DUMP = [
  'KtFile: a.kt',
  '  PACKAGE_DIRECTIVE',
  '    <empty list>',
  '  IMPORT_LIST',
  '    <empty list>',
  '  PROPERTY',
  "    PsiElement(val)('val')",
  "    PsiWhiteSpace(' ')",
  "    PsiElement(IDENTIFIER)('x')",
  "    PsiWhiteSpace(' ')",
  "    PsiElement(EQ)('=')",
  "    PsiWhiteSpace(' ')",
  '    INTEGER_CONSTANT',
  "      PsiElement(INTEGER_LITERAL)('1')",
  "  PsiWhiteSpace('\\n')",
].join('\n');

const ERROR_DUMP = [
  'KtFile: a.kt',
  '  PACKAGE_DIRECTIVE',
  '    <empty list>',
  '  IMPORT_LIST',
  '    <empty list>',
  '  PROPERTY',
  "    PsiElement(val)('val')",
  "    PsiWhiteSpace(' ')",
  '    PsiErrorElement:Expecting property name or receiver type',
  "      PsiElement(typeof)('typeof')",
].join('\n');

describe('psiLayout', () => {
  it('recovers offsets from leaf texts, unescaping line breaks', () => {
    const layout = psiLayout(CLEAN_DUMP);
    const property = layout.composites.find(entry => entry.type === 'PROPERTY');
    expect(property).toMatchObject({ start: 0, end: 9 });
    expect(psiTypeAt(layout, 8)).toBe('INTEGER_CONSTANT');
    expect(psiTypeAt(layout, 4)).toBe('PROPERTY');
    expect(layout.errors).toEqual([]);
  });

  it('locates error elements and their parent', () => {
    expect(psiLayout(ERROR_DUMP).errors).toEqual([
      { offset: 4, parent: 'PROPERTY', message: 'Expecting property name or receiver type' },
    ]);
  });
});

describe('firstDivergence', () => {
  const n = (name, ...children) => new Node(name, children);

  it('names the first differing child instead of the child counts', () => {
    const ts = n('KtFile', n('FUN', n('BLOCK', n('CALL_EXPRESSION'), n('REFERENCE_EXPRESSION'))));
    const psi = n('KtFile', n('FUN', n('BLOCK', n('LABELED_EXPRESSION'))));
    expect(firstDivergence(ts, psi)).toEqual({ path: 'KtFile > FUN > BLOCK', psi: 'LABELED_EXPRESSION', ts: 'CALL_EXPRESSION' });
  });

  it('reports a missing tail child and agrees on equal trees', () => {
    expect(firstDivergence(n('A', n('B')), n('A', n('B'), n('C')))).toEqual({ path: 'A', psi: 'C', ts: '(none)' });
    expect(firstDivergence(n('A', n('B')), n('A', n('B')))).toBeNull();
  });

  it('shortens long paths', () => {
    expect(trimPath('A > B > C > D')).toBe('… > B > C > D');
  });
});

describe('summarize', () => {
  it('counts verdicts and buckets per grammar, smallest example first', () => {
    const records = [
      { path: 'big.kt', bytes: 90, results: { pr: { verdict: 'A', key: 'A k', line: 3 }, main: { verdict: 'ok' } } },
      { path: 'small.kt', bytes: 10, results: { pr: { verdict: 'A', key: 'A k', line: 1 }, main: { verdict: 'A', key: 'A k', line: 1 } } },
      { path: 'both.kt', bytes: 5, results: { pr: { verdict: 'both-error' }, main: { verdict: 'B', key: 'B m' } } },
    ];
    const summary = summarize(records, ['pr', 'main']);
    expect(summary.totals).toEqual({ pr: { A: 2, 'both-error': 1 }, main: { ok: 1, A: 1, B: 1 } });
    expect(summary.buckets.map(bucket => [bucket.key, bucket.counts])).toEqual([
      ['A k', { pr: 2, main: 1 }],
      ['B m', { pr: 0, main: 1 }],
    ]);
    expect(summary.buckets[0].examples.pr[0].path).toBe('small.kt');
  });
});

// classify needs the grammar's native binding, which a checkout without `node-gyp rebuild` lacks.
const binding = grammarRoot() ? require('./binding-errors').load(grammarRoot()) : { error: MISSING };

describe.skipIf(binding.error)('classify', () => {
  const { loadParsers, parseText } = require('./diff-run');
  // vitest runs a skipped describe's body to collect it, so load only when the binding is there.
  const [{ parser }] = binding.error ? [{}] : loadParsers([{ label: 'head', root: grammarRoot() }]);

  it('reports B when only PSI has an error, keyed by the PSI message', () => {
    const text = 'val typeof = 1\n';
    const tree = parseText(parser, text);
    if (tree.rootNode.hasError) return; // a grammar that already rejects typeof gives both-error
    const result = classify({ text, tree, psi: { psiErrors: 1, firstError: { offset: 4, line: 1, message: 'x' } }, dump: ERROR_DUMP });
    expect(result.verdict).toBe('B');
    expect(result.key).toMatch(/^B psi PROPERTY: Expecting property name or receiver type \| ts /);
  });

  it('reports A with the first ERROR node and the PSI node at its offset', () => {
    const text = 'val x = 1 )\n';
    const result = classify({ text, tree: parseText(parser, text), psi: { psiErrors: 0, firstError: null }, dump: CLEAN_DUMP });
    expect(result.verdict).toBe('A');
    // The key names the ERROR node's parent, its first token and the PSI node there.
    expect(result.key).toMatch(/^A source_file > ERROR "(val|\))" \| psi (PROPERTY|FILE)$/);
  });

  it('reports ok when both are clean and agree', () => {
    const text = 'val x = 1\n';
    expect(classify({ text, tree: parseText(parser, text), psi: { psiErrors: 0, firstError: null }, dump: CLEAN_DUMP }))
      .toEqual({ verdict: 'ok' });
  });
});

describe.skipIf(!binding.error)('classify (unavailable)', () => {
  it.skip(binding.error || MISSING, () => {});
});
