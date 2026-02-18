/**
 * Tests for the tree-sitter S-expression parser.
 * Ported from Python test_parsers.py (TestTreeSitterParser).
 */

import { describe, it, expect } from 'vitest';

const { parseTreeSitter } = require('./parser-ts');
const { Node } = require('./models');

// ---------------------------------------------------------------------------
// BabySteps test data (inline fixture)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseTreeSitter', () => {
  it('parses root node as source_file', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    expect(tree.name).toBe('source_file');
  });

  it('root has 3 children (line_comment, package_header, class_declaration)', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    expect(tree.children.length).toBe(3);
    expect(tree.children.map(c => c.name)).toEqual([
      'line_comment',
      'package_header',
      'class_declaration',
    ]);
  });

  it('nested structure: package_header → identifier → simple_identifier', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const pkgHeader = tree.children[1];
    expect(pkgHeader.name).toBe('package_header');
    expect(pkgHeader.children.length).toBe(1);

    const ident = pkgHeader.children[0];
    expect(ident.name).toBe('identifier');
    expect(ident.children.length).toBe(1);

    const simpleIdent = ident.children[0];
    expect(simpleIdent.name).toBe('simple_identifier');
    expect(simpleIdent.children.length).toBe(0);
  });

  it('class_declaration has type_identifier and type_parameters children', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const classDecl = tree.children[2];
    expect(classDecl.name).toBe('class_declaration');
    expect(classDecl.children.length).toBe(2);
    expect(classDecl.children[0].name).toBe('type_identifier');
    expect(classDecl.children[1].name).toBe('type_parameters');
  });

  it('type_parameters contains a type_parameter with a type_identifier child', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    const typeParams = tree.children[2].children[1];
    expect(typeParams.name).toBe('type_parameters');
    expect(typeParams.children.length).toBe(1);

    const typeParam = typeParams.children[0];
    expect(typeParam.name).toBe('type_parameter');
    expect(typeParam.children.length).toBe(1);
    expect(typeParam.children[0].name).toBe('type_identifier');
  });

  it('leaf nodes have no children', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    // line_comment is a leaf
    expect(tree.children[0].children.length).toBe(0);
    // type_identifier under class_declaration is a leaf
    expect(tree.children[2].children[0].children.length).toBe(0);
    // simple_identifier is a leaf
    const simpleIdent = tree.children[1].children[0].children[0];
    expect(simpleIdent.children.length).toBe(0);
  });

  it('positions are stripped from names', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);
    // No node name should contain position markers like [0, 0]
    function checkNoPositions(node) {
      expect(node.name).not.toMatch(/\[\d+, \d+\]/);
      for (const child of node.children) {
        checkNoPositions(child);
      }
    }
    checkNoPositions(tree);
  });

  it('empty input returns source_file node', () => {
    const tree = parseTreeSitter('');
    expect(tree.name).toBe('source_file');
    expect(tree.children.length).toBe(0);
  });

  it('whitespace-only input returns source_file node', () => {
    const tree = parseTreeSitter('   \n\n  ');
    expect(tree.name).toBe('source_file');
    expect(tree.children.length).toBe(0);
  });

  it('full tree structure equality check', () => {
    const tree = parseTreeSitter(BABY_STEPS_TS);

    const expected = new Node('source_file', [
      new Node('line_comment'),
      new Node('package_header', [
        new Node('identifier', [
          new Node('simple_identifier'),
        ]),
      ]),
      new Node('class_declaration', [
        new Node('type_identifier'),
        new Node('type_parameters', [
          new Node('type_parameter', [
            new Node('type_identifier'),
          ]),
        ]),
      ]),
    ]);

    expect(tree.equals(expected)).toBe(true);
  });

  it('parses a simple single-node expression', () => {
    const tree = parseTreeSitter('(source_file [0, 0] - [1, 0])');
    expect(tree.name).toBe('source_file');
    expect(tree.children.length).toBe(0);
  });

  it('parses deeply nested structures', () => {
    const input = '(a [0,0]-[1,0] (b [0,0]-[1,0] (c [0,0]-[1,0] (d [0,0]-[1,0]))))';
    const tree = parseTreeSitter(input);
    expect(tree.name).toBe('a');
    expect(tree.children[0].name).toBe('b');
    expect(tree.children[0].children[0].name).toBe('c');
    expect(tree.children[0].children[0].children[0].name).toBe('d');
    expect(tree.children[0].children[0].children[0].children.length).toBe(0);
  });

  it('parses multiple siblings at same level', () => {
    const input = '(root [0,0]-[1,0] (a [0,0]-[0,1]) (b [0,1]-[0,2]) (c [0,2]-[0,3]))';
    const tree = parseTreeSitter(input);
    expect(tree.name).toBe('root');
    expect(tree.children.length).toBe(3);
    expect(tree.children.map(c => c.name)).toEqual(['a', 'b', 'c']);
  });
});
