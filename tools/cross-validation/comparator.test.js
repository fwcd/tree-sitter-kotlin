/**
 * Tests for the normalizer and comparator.
 * Ported from Python test_comparator.py (TestNormalizerTS, TestNormalizerPSI,
 * TestComparatorMatch, TestComparatorMismatch, TestComparatorEdgeCases,
 * TestRealFixtureFiles).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const { parseTreeSitter } = require('./parser-ts');
const { parsePsi } = require('./parser-psi');
const { normalizeTs, normalizePsi } = require('./normalizer');
const { compareTrees, Status, DiffKind } = require('./comparator');
const { Node } = require('./models');

// ---------------------------------------------------------------------------
// BabySteps inline test data
// ---------------------------------------------------------------------------

const BABY_STEPS_TS = `(source_file [0, 0] - [7, 0]
  (line_comment [0, 0] - [0, 21])
  (package_header [2, 0] - [2, 11]
    (identifier [2, 8] - [2, 11]
      (simple_identifier [2, 8] - [2, 11])))
  (class_declaration [4, 0] - [6, 1]
    (type_identifier [4, 6] - [4, 14])
    (type_parameters [4, 14] - [4, 19]
      (type_parameter [4, 15] - [4, 16]
        (type_identifier [4, 15] - [4, 16])))))`;

const BABY_STEPS_PSI = `KtFile: BabySteps.kt
  PsiComment(EOL_COMMENT)('// COMPILATION_ERRORS')
  PsiWhiteSpace('\\n\\n')
  PACKAGE_DIRECTIVE
    PsiElement(package)('package')
    PsiWhiteSpace(' ')
    REFERENCE_EXPRESSION
      PsiElement(IDENTIFIER)('foo')
  IMPORT_LIST
    <empty list>
  CLASS
    PsiElement(class)('class')
    PsiWhiteSpace(' ')
    PsiElement(IDENTIFIER)('Runnable')
    TYPE_PARAMETER_LIST
      PsiElement(LT)('<')
      TYPE_PARAMETER
        PsiElement(IDENTIFIER)('a')
      PsiElement(GT)('>')`;

// ---------------------------------------------------------------------------
// TestNormalizerTS
// ---------------------------------------------------------------------------

describe('normalizeTs', () => {
  it('maps source_file to KtFile', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);
    expect(norm.name).toBe('KtFile');
  });

  it('skips line_comment (mapped to null)', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);
    // line_comment is removed; KtFile should not have a child named line_comment
    const childNames = norm.children.map(c => c.name);
    expect(childNames).not.toContain('line_comment');
  });

  it('drops empty package_header → PACKAGE_DIRECTIVE (identifiers are transparent leaves)', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);
    // package_header > identifier > simple_identifier are all transparent,
    // resulting in empty PACKAGE_DIRECTIVE which is dropped
    const pkgDir = norm.children.find(c => c.name === 'PACKAGE_DIRECTIVE');
    expect(pkgDir).toBeUndefined();
  });

  it('skips identifiers (type_identifier, simple_identifier, identifier are transparent)', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);
    // identifiers should be skipped, and empty PACKAGE_DIRECTIVE is dropped
    const pkgDir = norm.children.find(c => c.name === 'PACKAGE_DIRECTIVE');
    expect(pkgDir).toBeUndefined();
    // CLASS should be the first child
    expect(norm.children[0].name).toBe('CLASS');
  });

  it('maps class_declaration to CLASS', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);
    const cls = norm.children.find(c => c.name === 'CLASS');
    expect(cls).toBeDefined();
  });

  it('maps type_parameters to TYPE_PARAMETER_LIST', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);
    const cls = norm.children.find(c => c.name === 'CLASS');
    const typeParamList = cls.children.find(c => c.name === 'TYPE_PARAMETER_LIST');
    expect(typeParamList).toBeDefined();
  });

  it('maps type_parameter to TYPE_PARAMETER', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);
    const cls = norm.children.find(c => c.name === 'CLASS');
    const typeParamList = cls.children.find(c => c.name === 'TYPE_PARAMETER_LIST');
    expect(typeParamList.children.length).toBe(1);
    expect(typeParamList.children[0].name).toBe('TYPE_PARAMETER');
  });

  it('normalized BabySteps TS tree matches expected structure', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const norm = normalizeTs(tree);

    // Empty PACKAGE_DIRECTIVE is dropped (identifiers are transparent leaves)
    const expected = new Node('KtFile', [
      new Node('CLASS', [
        new Node('TYPE_PARAMETER_LIST', [
          new Node('TYPE_PARAMETER'),
        ]),
      ]),
    ]);

    expect(norm.equals(expected)).toBe(true);
  });

  it('maps function_declaration to FUN', () => {
    const input = '(source_file [0,0]-[1,0] (function_declaration [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    expect(norm.children[0].name).toBe('FUN');
  });

  it('maps property_declaration to PROPERTY', () => {
    const input = '(source_file [0,0]-[1,0] (property_declaration [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    expect(norm.children[0].name).toBe('PROPERTY');
  });

  it('maps if_expression to IF', () => {
    const input = '(source_file [0,0]-[1,0] (if_expression [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    expect(norm.children[0].name).toBe('IF');
  });

  it('maps when_expression to WHEN', () => {
    const input = '(source_file [0,0]-[1,0] (when_expression [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    expect(norm.children[0].name).toBe('WHEN');
  });

  it('maps lambda_literal to FUNCTION_LITERAL', () => {
    const input = '(source_file [0,0]-[1,0] (lambda_literal [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    // FUNCTION_LITERAL with empty children gets a BLOCK injected
    expect(norm.children[0].name).toBe('FUNCTION_LITERAL');
  });

  it('maps string_literal to STRING_TEMPLATE', () => {
    const input = '(source_file [0,0]-[1,0] (string_literal [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    expect(norm.children[0].name).toBe('STRING_TEMPLATE');
  });

  it('maps for_statement to FOR', () => {
    const input = '(source_file [0,0]-[1,0] (for_statement [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    expect(norm.children[0].name).toBe('FOR');
  });

  it('maps while_statement to WHILE', () => {
    const input = '(source_file [0,0]-[1,0] (while_statement [0,0]-[1,0]))';
    const tree = parseTreeSitter(input);
    const norm = normalizeTs(tree);
    expect(norm.children[0].name).toBe('WHILE');
  });

  it('null input returns null', () => {
    const norm = normalizeTs(null);
    expect(norm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TestNormalizerPSI
// ---------------------------------------------------------------------------

describe('normalizePsi', () => {
  it('PSI root preserved as KtFile', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const norm = normalizePsi(tree);
    expect(norm.name).toBe('KtFile');
  });

  it('IMPORT_LIST skipped when empty (no children after normalization)', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const norm = normalizePsi(tree);
    // IMPORT_LIST with no children should be preserved but empty
    const importList = norm.children.find(c => c.name === 'IMPORT_LIST');
    // IMPORT_LIST is present but has no children
    if (importList) {
      expect(importList.children.length).toBe(0);
    }
  });

  it('REFERENCE_EXPRESSION is skipped (transparent)', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const norm = normalizePsi(tree);
    // After normalization, REFERENCE_EXPRESSION should be removed
    function findNode(node, name) {
      if (node.name === name) return true;
      return node.children.some(c => findNode(c, name));
    }
    expect(findNode(norm, 'REFERENCE_EXPRESSION')).toBe(false);
  });

  it('normalized BabySteps PSI tree has expected structure', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const norm = normalizePsi(tree);
    expect(norm.name).toBe('KtFile');

    // PACKAGE_DIRECTIVE: REFERENCE_EXPRESSION is skipped → empty → dropped
    const pkgDir = norm.children.find(c => c.name === 'PACKAGE_DIRECTIVE');
    expect(pkgDir).toBeUndefined();

    // IMPORT_LIST is empty → dropped
    const importList = norm.children.find(c => c.name === 'IMPORT_LIST');
    expect(importList).toBeUndefined();

    // CLASS should be the first (and only) child
    expect(norm.children[0].name).toBe('CLASS');
  });

  it('CLASS is preserved with TYPE_PARAMETER_LIST', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const norm = normalizePsi(tree);
    const cls = norm.children.find(c => c.name === 'CLASS');
    expect(cls).toBeDefined();
    const typeParamList = cls.children.find(c => c.name === 'TYPE_PARAMETER_LIST');
    expect(typeParamList).toBeDefined();
    expect(typeParamList.children.length).toBe(1);
    expect(typeParamList.children[0].name).toBe('TYPE_PARAMETER');
  });

  it('SAFE_ACCESS_EXPRESSION maps to DOT_QUALIFIED_EXPRESSION', () => {
    const node = new Node('SAFE_ACCESS_EXPRESSION', [
      new Node('REFERENCE_EXPRESSION'),
      new Node('CALL_EXPRESSION'),
    ]);
    const norm = normalizePsi(node);
    expect(norm.name).toBe('DOT_QUALIFIED_EXPRESSION');
  });

  it('null input returns null', () => {
    const norm = normalizePsi(null);
    expect(norm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TestComparatorMatch
// ---------------------------------------------------------------------------

describe('compareTrees — matching trees', () => {
  it('identical simple trees match', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS'),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS'),
    ]);
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MATCH);
    expect(result.differences.length).toBe(0);
  });

  it('identical empty trees match', () => {
    const tree1 = new Node('KtFile');
    const tree2 = new Node('KtFile');
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MATCH);
  });

  it('BabySteps inline fixture matches after normalization', () => {
    const tsTree = parseTreeSitter(BABY_STEPS_TS);
    const psiTree = parsePsi(BABY_STEPS_PSI);
    const tsNorm = normalizeTs(tsTree);
    const psiNorm = normalizePsi(psiTree);

    // After normalization, both trees should match:
    // KtFile > CLASS > TYPE_PARAMETER_LIST > TYPE_PARAMETER
    // (PACKAGE_DIRECTIVE and IMPORT_LIST are both dropped when empty)
    const result = compareTrees(tsNorm, psiNorm);
    expect(result.status).toBe(Status.MATCH);
  });

  it('deep trees match', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS', [
        new Node('CLASS_BODY', [
          new Node('FUN', [
            new Node('BLOCK'),
          ]),
        ]),
      ]),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS', [
        new Node('CLASS_BODY', [
          new Node('FUN', [
            new Node('BLOCK'),
          ]),
        ]),
      ]),
    ]);
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MATCH);
  });

  it('trees with multiple children at each level match', () => {
    const tree1 = new Node('KtFile', [
      new Node('PROPERTY'),
      new Node('FUN'),
      new Node('CLASS'),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('PROPERTY'),
      new Node('FUN'),
      new Node('CLASS'),
    ]);
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MATCH);
  });

  it('empty children match', () => {
    const tree1 = new Node('KtFile', [
      new Node('IMPORT_LIST'),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('IMPORT_LIST'),
    ]);
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MATCH);
  });
});

// ---------------------------------------------------------------------------
// TestComparatorMismatch
// ---------------------------------------------------------------------------

describe('compareTrees — mismatches', () => {
  it('root name mismatch detected', () => {
    const tree1 = new Node('KtFile');
    const tree2 = new Node('CLASS');
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MISMATCH);
    expect(result.differences.length).toBe(1);
    expect(result.differences[0].kind).toBe(DiffKind.NAME_MISMATCH);
    expect(result.differences[0].actual).toBe('KtFile');
    expect(result.differences[0].expected).toBe('CLASS');
  });

  it('child count mismatch detected', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS'),
      new Node('FUN'),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS'),
    ]);
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MISMATCH);
    const countMismatch = result.differences.find(d => d.kind === DiffKind.CHILD_COUNT_MISMATCH);
    expect(countMismatch).toBeDefined();
  });

  it('extra child detected', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS'),
      new Node('FUN'),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS'),
    ]);
    const result = compareTrees(tree1, tree2);
    const extra = result.differences.find(d => d.kind === DiffKind.EXTRA_CHILD);
    expect(extra).toBeDefined();
    expect(extra.actual).toBe('FUN');
  });

  it('missing child detected', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS'),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS'),
      new Node('PROPERTY'),
    ]);
    const result = compareTrees(tree1, tree2);
    const missing = result.differences.find(d => d.kind === DiffKind.MISSING_CHILD);
    expect(missing).toBeDefined();
    expect(missing.expected).toBe('PROPERTY');
  });

  it('nested name mismatch detected', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS', [
        new Node('FUN'),
      ]),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS', [
        new Node('PROPERTY'),
      ]),
    ]);
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MISMATCH);
    const nameMismatch = result.differences.find(d => d.kind === DiffKind.NAME_MISMATCH);
    expect(nameMismatch).toBeDefined();
    expect(nameMismatch.actual).toBe('FUN');
    expect(nameMismatch.expected).toBe('PROPERTY');
  });

  it('difference path tracks nesting', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS', [
        new Node('FUN'),
      ]),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS', [
        new Node('PROPERTY'),
      ]),
    ]);
    const result = compareTrees(tree1, tree2);
    const nameMismatch = result.differences.find(d => d.kind === DiffKind.NAME_MISMATCH);
    expect(nameMismatch.path).toContain('KtFile');
    expect(nameMismatch.path).toContain('CLASS');
  });
});

// ---------------------------------------------------------------------------
// TestComparatorEdgeCases
// ---------------------------------------------------------------------------

describe('compareTrees — edge cases', () => {
  it('null TS tree returns TS_PARSE_ERROR status', () => {
    const psiTree = new Node('KtFile');
    const result = compareTrees(null, psiTree);
    expect(result.status).toBe(Status.TS_PARSE_ERROR);
  });

  it('null PSI tree returns PSI_PARSE_ERROR status', () => {
    const tsTree = new Node('KtFile');
    const result = compareTrees(tsTree, null);
    expect(result.status).toBe(Status.PSI_PARSE_ERROR);
  });

  it('both null — TS_PARSE_ERROR takes precedence', () => {
    const result = compareTrees(null, null);
    expect(result.status).toBe(Status.TS_PARSE_ERROR);
  });

  it('empty children on both sides match', () => {
    const tree1 = new Node('KtFile');
    const tree2 = new Node('KtFile');
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MATCH);
    expect(result.differences.length).toBe(0);
  });

  it('single node tree matches', () => {
    const result = compareTrees(new Node('A'), new Node('A'));
    expect(result.status).toBe(Status.MATCH);
  });

  it('single node tree mismatches', () => {
    const result = compareTrees(new Node('A'), new Node('B'));
    expect(result.status).toBe(Status.MISMATCH);
    expect(result.differences[0].kind).toBe(DiffKind.NAME_MISMATCH);
  });

  it('overlapping children are still compared when counts differ', () => {
    const tree1 = new Node('KtFile', [
      new Node('CLASS'),
      new Node('FUN'),
      new Node('PROPERTY'),
    ]);
    const tree2 = new Node('KtFile', [
      new Node('CLASS'),
      new Node('WHILE'),
    ]);
    const result = compareTrees(tree1, tree2);
    expect(result.status).toBe(Status.MISMATCH);
    // Should have child_count_mismatch + extra_child + name_mismatch (FUN vs WHILE)
    expect(result.differences.length).toBeGreaterThanOrEqual(2);
    const countDiff = result.differences.find(d => d.kind === DiffKind.CHILD_COUNT_MISMATCH);
    expect(countDiff).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TestRealFixtureFiles
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(__dirname, 'fixtures');

describe('real fixture files', () => {
  it('BabySteps.kt fixture exists and can be parsed', () => {
    const ktFile = join(FIXTURES_DIR, 'BabySteps.kt');
    const psiFile = join(FIXTURES_DIR, 'BabySteps.txt');

    if (!existsSync(ktFile) || !existsSync(psiFile)) {
      // Skip if fixtures not vendored
      return;
    }

    const psiText = readFileSync(psiFile, 'utf-8');
    const psiTree = parsePsi(psiText);
    expect(psiTree.name).toBe('KtFile');
    expect(psiTree.children.length).toBeGreaterThan(0);
  });

  it('fixture directory contains .kt and .txt pairs', () => {
    if (!existsSync(FIXTURES_DIR)) return;

    const files = readdirSync(FIXTURES_DIR);
    const ktFiles = files.filter(f => f.endsWith('.kt'));
    const txtFiles = files.filter(f => f.endsWith('.txt') && !f.endsWith('.stubs.txt'));

    expect(ktFiles.length).toBeGreaterThan(0);
    expect(txtFiles.length).toBeGreaterThan(0);
  });

  it('all PSI .txt fixture files parse without throwing', () => {
    if (!existsSync(FIXTURES_DIR)) return;

    const files = readdirSync(FIXTURES_DIR);
    const txtFiles = files.filter(f => f.endsWith('.txt') && !f.endsWith('.stubs.txt'));

    for (const txt of txtFiles) {
      const content = readFileSync(join(FIXTURES_DIR, txt), 'utf-8');
      // Should not throw
      const tree = parsePsi(content);
      expect(tree).toBeDefined();
      expect(tree.name).toBe('KtFile');
    }
  });
});
