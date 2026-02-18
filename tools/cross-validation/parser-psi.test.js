/**
 * Tests for the PSI indented tree parser.
 * Ported from Python test_parsers.py (TestPsiParser).
 */

import { describe, it, expect } from 'vitest';

const { parsePsi } = require('./parser-psi');
const { Node } = require('./models');

// ---------------------------------------------------------------------------
// BabySteps PSI test data (inline fixture)
// ---------------------------------------------------------------------------

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
// Tests
// ---------------------------------------------------------------------------

describe('parsePsi', () => {
  it('parses root node as KtFile', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    expect(tree.name).toBe('KtFile');
  });

  it('root has 3 children (PACKAGE_DIRECTIVE, IMPORT_LIST, CLASS)', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    expect(tree.children.length).toBe(3);
    expect(tree.children.map(c => c.name)).toEqual([
      'PACKAGE_DIRECTIVE',
      'IMPORT_LIST',
      'CLASS',
    ]);
  });

  it('skips PsiElement, PsiWhiteSpace, PsiComment nodes', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    // No child at any level should be named PsiElement, PsiWhiteSpace, or PsiComment
    function checkNoSkippedNodes(node) {
      for (const child of node.children) {
        expect(child.name).not.toMatch(/^PsiElement/);
        expect(child.name).not.toMatch(/^PsiWhiteSpace/);
        expect(child.name).not.toMatch(/^PsiComment/);
        checkNoSkippedNodes(child);
      }
    }
    checkNoSkippedNodes(tree);
  });

  it('PACKAGE_DIRECTIVE has REFERENCE_EXPRESSION child', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const pkgDir = tree.children[0];
    expect(pkgDir.name).toBe('PACKAGE_DIRECTIVE');
    expect(pkgDir.children.length).toBe(1);
    expect(pkgDir.children[0].name).toBe('REFERENCE_EXPRESSION');
  });

  it('IMPORT_LIST is empty (no children)', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const importList = tree.children[1];
    expect(importList.name).toBe('IMPORT_LIST');
    expect(importList.children.length).toBe(0);
  });

  it('CLASS has TYPE_PARAMETER_LIST child', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const cls = tree.children[2];
    expect(cls.name).toBe('CLASS');
    expect(cls.children.length).toBe(1);
    expect(cls.children[0].name).toBe('TYPE_PARAMETER_LIST');
  });

  it('TYPE_PARAMETER_LIST has TYPE_PARAMETER child', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const typeParamList = tree.children[2].children[0];
    expect(typeParamList.name).toBe('TYPE_PARAMETER_LIST');
    expect(typeParamList.children.length).toBe(1);
    expect(typeParamList.children[0].name).toBe('TYPE_PARAMETER');
  });

  it('TYPE_PARAMETER is a leaf (no composite children)', () => {
    const tree = parsePsi(BABY_STEPS_PSI);
    const typeParam = tree.children[2].children[0].children[0];
    expect(typeParam.name).toBe('TYPE_PARAMETER');
    expect(typeParam.children.length).toBe(0);
  });

  it('empty input returns KtFile node', () => {
    const tree = parsePsi('');
    expect(tree.name).toBe('KtFile');
    expect(tree.children.length).toBe(0);
  });

  it('whitespace-only input returns KtFile node', () => {
    const tree = parsePsi('   \n\n   ');
    expect(tree.name).toBe('KtFile');
    expect(tree.children.length).toBe(0);
  });

  it('full tree structure equality check', () => {
    const tree = parsePsi(BABY_STEPS_PSI);

    const expected = new Node('KtFile', [
      new Node('PACKAGE_DIRECTIVE', [
        new Node('REFERENCE_EXPRESSION'),
      ]),
      new Node('IMPORT_LIST'),
      new Node('CLASS', [
        new Node('TYPE_PARAMETER_LIST', [
          new Node('TYPE_PARAMETER'),
        ]),
      ]),
    ]);

    expect(tree.equals(expected)).toBe(true);
  });

  it('skips <empty list> entries', () => {
    const input = `KtFile: Test.kt
  IMPORT_LIST
    <empty list>`;
    const tree = parsePsi(input);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].name).toBe('IMPORT_LIST');
    expect(tree.children[0].children.length).toBe(0);
  });

  it('skips PsiErrorElement lines', () => {
    const input = `KtFile: Test.kt
  PsiErrorElement('Expected something')
  CLASS
    PsiElement(class)('class')`;
    const tree = parsePsi(input);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].name).toBe('CLASS');
  });

  it('handles deeply nested composite nodes', () => {
    const input = `KtFile: Test.kt
  CLASS
    CLASS_BODY
      FUN
        BLOCK
          CALL_EXPRESSION`;
    const tree = parsePsi(input);
    expect(tree.children[0].name).toBe('CLASS');
    expect(tree.children[0].children[0].name).toBe('CLASS_BODY');
    expect(tree.children[0].children[0].children[0].name).toBe('FUN');
    expect(tree.children[0].children[0].children[0].children[0].name).toBe('BLOCK');
    expect(tree.children[0].children[0].children[0].children[0].children[0].name).toBe('CALL_EXPRESSION');
  });

  it('handles multiple siblings at same indent level', () => {
    const input = `KtFile: Test.kt
  PROPERTY
  FUN
  CLASS`;
    const tree = parsePsi(input);
    expect(tree.children.length).toBe(3);
    expect(tree.children.map(c => c.name)).toEqual(['PROPERTY', 'FUN', 'CLASS']);
  });
});
