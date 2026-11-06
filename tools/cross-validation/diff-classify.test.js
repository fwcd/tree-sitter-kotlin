import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  psiLayout,
  psiTypeAt,
  firstDivergence,
  classify,
  trimPath,
} = {...require('./diff-classify'), ...require('./diff-execute')};
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
    const property = layout.composites.find((entry) => entry.type === 'PROPERTY');
    expect(property).toMatchObject({ start: 0, end: 9 });
    expect(psiTypeAt(layout, 8)).toBe('INTEGER_CONSTANT');
    expect(psiTypeAt(layout, 4)).toBe('PROPERTY');
    expect(layout.errors).toEqual([]);
  });

  it('reads a leaf holding a line separator as one leaf', () => {
    const dump = [
      'KtFile: a.kt',
      '  STRING_TEMPLATE',
      "    PsiElement(REGULAR_STRING_PART)('a\u2028b')",
      '  PROPERTY',
      "    PsiElement(val)('val')",
    ].join('\n');
    expect(psiLayout(dump).composites.find((entry) => entry.type === 'PROPERTY')).toMatchObject({
      start: 3,
    });
  });

  it('records the first token of a composite, past whitespace, comments and KDoc', () => {
    const dump = [
      'KtFile: a.kt',
      '  FUN',
      '    KDoc',
      "      PsiElement(KDOC_START)('/**')",
      "      PsiElement(KDOC_END)('*/')",
      "    PsiWhiteSpace('\\n')",
      "    PsiComment(EOL_COMMENT)('//')",
      "    PsiWhiteSpace('\\n')",
      "    PsiElement(fun)('fun')",
    ].join('\n');
    expect(psiLayout(dump).composites.find((entry) => entry.type === 'FUN')).toMatchObject({
      start: 0,
      token: 9,
    });
  });

  it('counts a backslash of the source as itself, and resolves \\n against the source', () => {
    const dump = [
      'KtFile: a.kt',
      "  PsiElement(A)('\\!')",
      "  PsiElement(B)('\\n')",
      "  PsiComment(EOL_COMMENT)('//')",
    ].join('\n');
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
    expect(firstDivergence(ts, psi)).toEqual({
      path: 'KtFile > FUN > BLOCK',
      psi: 'LABELED_EXPRESSION',
      ts: 'CALL_EXPRESSION',
    });
  });

  it('reports a missing tail child and agrees on equal trees', () => {
    expect(firstDivergence(n('A', n('B')), n('A', n('B'), n('C')))).toEqual({
      path: 'A',
      psi: 'C',
      ts: '(none)',
    });
    expect(firstDivergence(n('A', n('B')), n('A', n('B')))).toBeNull();
  });

  it('shortens long paths', () => {
    expect(trimPath('A > B > C > D')).toBe('… > B > C > D');
  });
});

// classify needs the grammar's native binding, which a checkout without `node-gyp rebuild` lacks.
const binding = grammarRoot()
  ? require('./binding-errors').load(grammarRoot())
  : { error: MISSING };

describe.skipIf(binding.error)('classify', () => {
  const { loadParsers, parseText } = {...require('./diff-classify'), ...require('./diff-execute')};
  // vitest runs a skipped describe's body to collect it, so load only when the binding is there.
  const [{ parser }] = binding.error ? [{}] : loadParsers([{ label: 'head', root: grammarRoot() }]);

  it('reports B when only PSI has an error, keyed by the PSI message', () => {
    const text = 'val typeof = 1\n';
    const tree = parseText(parser, text);
    if (tree.rootNode.hasError) return; // a grammar that already rejects typeof gives both-error
    const result = classify({
      text,
      tree,
      psi: { psiErrors: 1, firstError: { offset: 4, line: 1, message: 'x' } },
      dump: ERROR_DUMP,
    });
    expect(result.verdict).toBe('B');
    expect(result.key).toMatch(/^B psi PROPERTY: Expecting property name or receiver type \| ts /);
  });

  it('reports A with the first ERROR node and the PSI node at its offset', () => {
    const text = 'val x = 1 )\n';
    const result = classify({
      text,
      tree: parseText(parser, text),
      psi: { psiErrors: 0, firstError: null },
      dump: CLEAN_DUMP,
    });
    expect(result.verdict).toBe('A');
    // The key names the ERROR node's parent, its first token and the PSI node there.
    expect(result.key).toMatch(/^A source_file > ERROR "(val|\))" \| psi (PROPERTY|FILE)$/);
  });

  it('reports A-prefix when tree-sitter errs on an earlier line than PSI, both-error at the same offset', () => {
    const text = 'val x = 1 )\nval y = 2\n';
    const tree = parseText(parser, text);
    const later = { psiErrors: 1, firstError: { offset: 12, line: 2, message: 'm' } };
    expect(classify({ text, tree, psi: later, dump: null })).toMatchObject({
      verdict: 'A-prefix',
      line: 1,
    });
    const same = { psiErrors: 1, firstError: { offset: 0, line: 1, message: 'm' } };
    expect(classify({ text, tree, psi: same, dump: null })).toEqual({ verdict: 'both-error' });
  });

  it('reports a comment only one side reads', () => {
    const text = 'val x = 1 // c\n';
    const dump = CLEAN_DUMP.replace(
      "  PsiWhiteSpace('\\n')",
      "  PsiWhiteSpace(' ')\n  PsiWhiteSpace('// c')\n  PsiWhiteSpace('\\n')",
    );
    expect(
      classify({
        text,
        tree: parseText(parser, text),
        psi: { psiErrors: 0, firstError: null },
        dump,
      }),
    ).toMatchObject({ verdict: 'C', key: expect.stringMatching(/^C comment only in ts @ /) });
  });

  it('reports a declaration that starts elsewhere, which the normalized structures hide', () => {
    // 257 words exceed the scanner's lookahead, so the first `private` may be left as a statement.
    const text = 'private\n' + 'private '.repeat(256) + 'fun f() {}\n';
    const tree = parseText(parser, text);
    if (tree.rootNode.child(0).type === 'function_declaration') return; // a grammar that keeps them together
    const words = Array.from(
      { length: 257 },
      (_, i) =>
        `      PsiElement(private)('private')\n      PsiWhiteSpace('${i === 0 ? '\\n' : ' '}')`,
    ).join('\n');
    const dump = [
      'KtFile: a.kt',
      '  PACKAGE_DIRECTIVE',
      '    <empty list>',
      '  IMPORT_LIST',
      '    <empty list>',
      '  FUN',
      '    MODIFIER_LIST',
      words,
      "    PsiElement(fun)('fun')",
      "    PsiWhiteSpace(' ')",
      "    PsiElement(IDENTIFIER)('f')",
      '    VALUE_PARAMETER_LIST',
      "      PsiElement(LPAR)('(')",
      "      PsiElement(RPAR)(')')",
      "    PsiWhiteSpace(' ')",
      '    BLOCK',
      "      PsiElement(LBRACE)('{')",
      "      PsiElement(RBRACE)('}')",
      "  PsiWhiteSpace('\\n')",
    ].join('\n');
    expect(classify({ text, tree, psi: { psiErrors: 0, firstError: null }, dump })).toMatchObject({
      verdict: 'C',
      key: expect.stringMatching(/^C declaration start only in psi: FUN /),
    });
  });

  it('reports ok when both are clean and agree', () => {
    const text = 'val x = 1\n';
    expect(
      classify({
        text,
        tree: parseText(parser, text),
        psi: { psiErrors: 0, firstError: null },
        dump: CLEAN_DUMP,
      }),
    ).toEqual({ verdict: 'ok' });
  });
});

describe.skipIf(!binding.error)('classify (unavailable)', () => {
  it.skip(binding.error || MISSING, () => {});
});
