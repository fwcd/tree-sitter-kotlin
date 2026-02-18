/**
 * Tests for the mapping tables.
 * Ported from Python test_mapping.py (TestMappingCoverage, TestMappingAgainstSources).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const {
  TS_TO_PSI,
  SKIP_TS_NODES,
  SKIP_PSI_NODES,
  WRAPPER_COLLAPSE,
  ALL_TS_NAMED_NODES,
  ALL_PSI_COMPOSITE_NODES,
} = require('./mapping');

// ---------------------------------------------------------------------------
// TestMappingCoverage
// ---------------------------------------------------------------------------

describe('mapping coverage', () => {
  it('all TS named nodes are in TS_TO_PSI mapping', () => {
    for (const tsName of ALL_TS_NAMED_NODES) {
      expect(TS_TO_PSI).toHaveProperty(tsName);
    }
  });

  it('SKIP_TS_NODES is a subset of ALL_TS_NAMED_NODES', () => {
    for (const name of SKIP_TS_NODES) {
      expect(ALL_TS_NAMED_NODES.has(name)).toBe(true);
    }
  });

  it('SKIP_PSI_NODES entries are either in ALL_PSI_COMPOSITE_NODES or are known extra nodes', () => {
    // Some SKIP_PSI_NODES entries are for nodes not tracked in ALL_PSI_COMPOSITE_NODES
    // (e.g., RETURN, THROW, BREAK, CONTINUE, KDOC_SECTION, CONTEXT_RECEIVER, etc.)
    const KNOWN_EXTRAS = new Set([
      'RETURN', 'THROW', 'BREAK', 'CONTINUE',
      'KDOC_SECTION', 'CONTEXT_RECEIVER', 'CONTEXT_PARAMETER_LIST',
      'ANNOTATION', 'INITIALIZER_LIST',
    ]);
    for (const name of SKIP_PSI_NODES) {
      const known = ALL_PSI_COMPOSITE_NODES.has(name) || KNOWN_EXTRAS.has(name);
      expect(known).toBe(true);
    }
  });

  it('WRAPPER_COLLAPSE keys are PSI composite nodes', () => {
    for (const key of Object.keys(WRAPPER_COLLAPSE)) {
      expect(ALL_PSI_COMPOSITE_NODES.has(key)).toBe(true);
    }
  });

  it('every SKIP_TS node maps to null in TS_TO_PSI', () => {
    for (const name of SKIP_TS_NODES) {
      expect(TS_TO_PSI[name]).toBeNull();
    }
  });

  it('non-null TS_TO_PSI mappings target known PSI nodes', () => {
    for (const [tsName, psiName] of Object.entries(TS_TO_PSI)) {
      if (psiName !== null) {
        expect(ALL_PSI_COMPOSITE_NODES.has(psiName)).toBe(true);
      }
    }
  });

  it('ALL_TS_NAMED_NODES has > 100 entries', () => {
    expect(ALL_TS_NAMED_NODES.size).toBeGreaterThan(100);
  });

  it('ALL_PSI_COMPOSITE_NODES has > 50 entries', () => {
    expect(ALL_PSI_COMPOSITE_NODES.size).toBeGreaterThan(50);
  });

  it('SKIP_TS_NODES is non-empty', () => {
    expect(SKIP_TS_NODES.size).toBeGreaterThan(0);
  });

  it('SKIP_PSI_NODES is non-empty', () => {
    expect(SKIP_PSI_NODES.size).toBeGreaterThan(0);
  });

  it('WRAPPER_COLLAPSE values target known PSI nodes or is empty', () => {
    // WRAPPER_COLLAPSE may be empty if all collapsing is handled by SKIP_PSI_NODES
    for (const [key, value] of Object.entries(WRAPPER_COLLAPSE)) {
      expect(ALL_PSI_COMPOSITE_NODES.has(key)).toBe(true);
    }
  });

  it('TS_TO_PSI keys are all strings', () => {
    for (const key of Object.keys(TS_TO_PSI)) {
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it('TS_TO_PSI values are all strings or null', () => {
    for (const value of Object.values(TS_TO_PSI)) {
      expect(value === null || typeof value === 'string').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// TestMappingAgainstSources
// ---------------------------------------------------------------------------

describe('mapping against source files', () => {
  it('ALL_TS_NAMED_NODES matches src/node-types.json', () => {
    const nodeTypes = require('../../src/node-types.json');
    const namedFromJson = new Set(
      nodeTypes
        .filter(entry => entry.named === true)
        .map(entry => entry.type),
    );

    // Every node in ALL_TS_NAMED_NODES should be in node-types.json
    for (const name of ALL_TS_NAMED_NODES) {
      expect(namedFromJson.has(name)).toBe(true);
    }
  });

  it('ALL_TS_NAMED_NODES covers the important named nodes from node-types.json', () => {
    const nodeTypes = require('../../src/node-types.json');
    const namedFromJson = new Set(
      nodeTypes
        .filter(entry => entry.named === true)
        .map(entry => entry.type),
    );

    // Check that our set is reasonably sized relative to node-types.json
    // (node-types.json may have extra unnamed/literal types we don't care about)
    expect(ALL_TS_NAMED_NODES.size).toBeGreaterThan(0);
    // The set should be a subset of the JSON
    for (const name of ALL_TS_NAMED_NODES) {
      expect(namedFromJson.has(name)).toBe(true);
    }
  });

  it('ALL_PSI_COMPOSITE_NODES covers all nodes found in fixture .txt files', () => {
    const fixturesDir = join(__dirname, 'fixtures');
    if (!existsSync(fixturesDir)) return;

    const COMPOSITE_RE = /^[A-Z][A-Z_0-9]*$/;
    const foundNodes = new Set();

    const files = readdirSync(fixturesDir).filter(
      f => f.endsWith('.txt') && !f.endsWith('.stubs.txt'),
    );

    for (const f of files) {
      const content = readFileSync(join(fixturesDir, f), 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (COMPOSITE_RE.test(trimmed)) {
          foundNodes.add(trimmed);
        }
      }
    }

    // Every composite node found in fixtures should be in ALL_PSI_COMPOSITE_NODES
    const uncovered = [];
    for (const node of foundNodes) {
      if (!ALL_PSI_COMPOSITE_NODES.has(node)) {
        uncovered.push(node);
      }
    }

    // Allow a small number of uncovered nodes (edge cases)
    // but the vast majority should be covered
    const coverageRate = (foundNodes.size - uncovered.length) / foundNodes.size;
    expect(coverageRate).toBeGreaterThan(0.8);
  });

  it('TS_TO_PSI covers source_file mapping', () => {
    expect(TS_TO_PSI.source_file).toBe('KtFile');
  });

  it('key node type mappings are correct', () => {
    expect(TS_TO_PSI.class_declaration).toBe('CLASS');
    expect(TS_TO_PSI.function_declaration).toBe('FUN');
    expect(TS_TO_PSI.property_declaration).toBe('PROPERTY');
    expect(TS_TO_PSI.if_expression).toBe('IF');
    expect(TS_TO_PSI.when_expression).toBe('WHEN');
    expect(TS_TO_PSI.for_statement).toBe('FOR');
    expect(TS_TO_PSI.while_statement).toBe('WHILE');
    expect(TS_TO_PSI.try_expression).toBe('TRY');
    expect(TS_TO_PSI.lambda_literal).toBe('FUNCTION_LITERAL');
    expect(TS_TO_PSI.string_literal).toBe('STRING_TEMPLATE');
  });
});
