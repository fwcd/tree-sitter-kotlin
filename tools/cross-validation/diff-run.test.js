import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { psiLayout, psiTypeAt, firstDivergence, classify, summarize, trimPath, markMutants, gatedKey, triage } = require('./diff-run');
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

  it('reads a leaf holding a line separator as one leaf', () => {
    const dump = ['KtFile: a.kt', '  STRING_TEMPLATE', "    PsiElement(REGULAR_STRING_PART)('a\u2028b')", '  PROPERTY',
      "    PsiElement(val)('val')"].join('\n');
    expect(psiLayout(dump).composites.find(entry => entry.type === 'PROPERTY')).toMatchObject({ start: 3 });
  });

  it('records the first token of a composite, past whitespace, comments and KDoc', () => {
    const dump = ['KtFile: a.kt', '  FUN', '    KDoc', "      PsiElement(KDOC_START)('/**')", "      PsiElement(KDOC_END)('*/')",
      "    PsiWhiteSpace('\\n')", "    PsiComment(EOL_COMMENT)('//')", "    PsiWhiteSpace('\\n')", "    PsiElement(fun)('fun')"].join('\n');
    expect(psiLayout(dump).composites.find(entry => entry.type === 'FUN')).toMatchObject({ start: 0, token: 9 });
  });

  it('counts a backslash of the source as itself, and resolves \\n against the source', () => {
    const dump = ['KtFile: a.kt', "  PsiElement(A)('\\!')", "  PsiElement(B)('\\n')", "  PsiComment(EOL_COMMENT)('//')"].join('\n');
    expect(psiLayout(dump, '\\!\n//').comments).toEqual([3]);
    expect(psiLayout(dump, '\\!\\n//').comments).toEqual([4]);
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

describe('mutants and the registry', () => {
  const records = [
    { path: 'original/a.kt', bytes: 1, results: { head: { verdict: 'ok' } } },
    { path: 'op/a~0.kt', bytes: 1, results: { head: { verdict: 'C', key: 'C @ KtFile: psi FUN / ts BINARY_EXPRESSION' } } },
    { path: 'original/b.kt', bytes: 1, results: { head: { verdict: 'C', key: 'C @ x' } } },
    { path: 'op/b~0.kt', bytes: 1, results: { head: { verdict: 'C', key: 'C @ x' } } },
    { path: 'op/c~0.kt', bytes: 1, results: { head: { verdict: 'B', key: 'B psi BLOCK: m | ts statements' } } },
  ];
  const origins = { 'op/a~0.kt': 'original/a.kt', 'op/b~0.kt': 'original/b.kt', 'op/c~0.kt': 'original/a.kt' };

  it('marks a C the mutation made, not one the original had', () => {
    const marked = markMutants(records, ['head'], origins);
    expect(marked[1].results.head).toMatchObject({ verdict: 'C-mutant', key: 'C* @ KtFile: psi FUN / ts BINARY_EXPRESSION' });
    expect(marked[3].results.head.verdict).toBe('C');
  });

  it('gates A, B, C* and comment buckets, every C when strict', () => {
    expect(['A x', 'B x', 'C* x', 'C comment only in ts @ x'].every(key => gatedKey(key))).toBe(true);
    expect(gatedKey('C @ x')).toBe(false);
    expect(gatedKey('C @ x', true)).toBe(true);
  });

  it('splits the gated buckets into registered and unexpected', () => {
    const summary = summarize(records, ['head'], origins);
    const expected = [{ key: /^B psi BLOCK: m /, status: 'open', reason: 'r' }, { key: /^A never/, status: 'deliberate', reason: 'unused' }];
    const { unexpected, registered, unused } = triage(summary, expected, 'head');
    expect(unexpected.map(bucket => bucket.key)).toEqual(['C* @ KtFile: psi FUN / ts BINARY_EXPRESSION']);
    expect(registered.map(({ bucket }) => bucket.key)).toEqual(['B psi BLOCK: m | ts statements']);
    expect(unused.map(entry => entry.reason)).toEqual(['unused']);
  });

  it('takes an entry with counts for the inputs it covers in the corpus', () => {
    const summary = summarize(records, ['head'], origins);
    const entry = { key: /^B psi BLOCK: m /, status: 'open', reason: 'r', counts: { mutations: 1 } };
    const unexpected = corpus => triage(summary, [entry], 'head', false, corpus).unexpected.map(b => b.key);
    expect(unexpected('mutations')).not.toContain('B psi BLOCK: m | ts statements');
    expect(unexpected('kotlin')).toContain('B psi BLOCK: m | ts statements');
    entry.counts.mutations = 0;
    expect(unexpected('mutations')).toContain('B psi BLOCK: m | ts statements');
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

  it('reports A-prefix when tree-sitter errs on an earlier line than PSI, both-error on the same line', () => {
    const text = 'val x = 1 )\nval y = 2\n';
    const tree = parseText(parser, text);
    const later = { psiErrors: 1, firstError: { offset: 12, line: 2, message: 'm' } };
    expect(classify({ text, tree, psi: later, dump: null })).toMatchObject({ verdict: 'A-prefix', line: 1 });
    const same = { psiErrors: 1, firstError: { offset: 10, line: 1, message: 'm' } };
    expect(classify({ text, tree, psi: same, dump: null })).toEqual({ verdict: 'both-error' });
  });

  it('reports a comment only one side reads', () => {
    const text = 'val x = 1 // c\n';
    const dump = CLEAN_DUMP.replace("  PsiWhiteSpace('\\n')", "  PsiWhiteSpace(' ')\n  PsiWhiteSpace('// c')\n  PsiWhiteSpace('\\n')");
    expect(classify({ text, tree: parseText(parser, text), psi: { psiErrors: 0, firstError: null }, dump }))
      .toMatchObject({ verdict: 'C', key: expect.stringMatching(/^C comment only in ts @ /) });
  });

  it('reports a declaration that starts elsewhere, which the normalized structures hide', () => {
    // 257 words exceed the scanner's lookahead, so the first `private` may be left as a statement.
    const text = 'private\n' + 'private '.repeat(256) + 'fun f() {}\n';
    const tree = parseText(parser, text);
    if (tree.rootNode.child(0).type === 'function_declaration') return; // a grammar that keeps them together
    const words = Array.from({ length: 257 }, (_, i) =>
      `      PsiElement(private)('private')\n      PsiWhiteSpace('${i === 0 ? '\\n' : ' '}')`).join('\n');
    const dump = ['KtFile: a.kt', '  PACKAGE_DIRECTIVE', '    <empty list>', '  IMPORT_LIST', '    <empty list>',
      '  FUN', '    MODIFIER_LIST', words, "    PsiElement(fun)('fun')", "    PsiWhiteSpace(' ')",
      "    PsiElement(IDENTIFIER)('f')", '    VALUE_PARAMETER_LIST', "      PsiElement(LPAR)('(')",
      "      PsiElement(RPAR)(')')", "    PsiWhiteSpace(' ')", '    BLOCK', "      PsiElement(LBRACE)('{')",
      "      PsiElement(RBRACE)('}')", "  PsiWhiteSpace('\\n')"].join('\n');
    expect(classify({ text, tree, psi: { psiErrors: 0, firstError: null }, dump }))
      .toMatchObject({ verdict: 'C', key: expect.stringMatching(/^C declaration start only in psi: FUN /) });
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
