import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const api = {...require('./diff-classify'), ...require('./diff-execute')};
const { compareWithPsi } = require('./pipeline');
const { compareTrees } = require('./comparator');
const { runOracle } = require('../psi-oracle/oracle');
const setup = require('../psi-gate/test-prerequisites').variantBuild(ROOT);
const available = require('../psi-oracle/fetch').isFetched() && !setup.missing.length &&
  fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));
const cases = {
  sameCalls: 'fun f(){if(c)foo()else bar()}\n',
  conditionCall: 'fun f(){if(foo())c else bar()}\n',
  thenCall: 'fun f(){if(c)foo()else 1}\n',
  elseCall: 'fun f(){if(c)1 else foo()}\n',
  referenceBodies: 'fun f(){if(c)a else b}\n',
  emptyThen: 'fun f(){if(c);else bar()}\n',
  emptyElse: 'fun f(){if(c)foo()else;}\n',
  emptyThenReference: 'fun f(){if(c);else a}\n',
  emptyElseReference: 'fun f(){if(c)a else;}\n',
  bothEmpty: 'fun f(){if(c);else;}\n',
  emptyThenComment: 'fun f(){if(c);/*boundary*/else a}\n',
  emptyElseComment: 'fun f(){if(c)a else/*boundary*/;}\n',
  emptyIf: 'fun f(){if(c);}\n',
  bracedIf: 'fun f(){if(c){}else{}}\n',
  forRange: 'fun f(){for(x in c)foo()}\n',
  forRangeCall: 'fun f(){for(x in foo())c}\n',
  whileCondition: 'fun f(){while(c)foo()}\n',
  whileConditionCall: 'fun f(){while(foo())c}\n',
  whileReference: 'fun f(){while(c)x}\n',
  forReference: 'fun f(){for(x in c)x}\n',
  doCondition: 'fun f(){do foo()while(c)}\n',
  emptyDo: 'fun f(){do while(c)}\n',
};

it('keeps N1–N41 justifications and the standing hidden-rule premise in the source', () => {
  const source = ['normalizer.js', 'mapping.js', 'native-metadata.js', 'native-layout.js', 'literal-runs.js']
    .map(file => fs.readFileSync(path.join(import.meta.dirname, file), 'utf8')).join('\n');
  for (let id = 1; id <= 41; id++) expect(source, 'N' + id).toContain('// N' + id + ':');
  expect(source).toContain('_statement_annotations stays');
  expect(source).toContain('revisit these regroupings');
});

describe.skipIf(!available)('native condition, branch and range roles remain explicit', () => {
  let directory, refs, parsers, roots;
  const results = new Map();
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'control-roles-'));
    const sources = path.join(directory, 'sources'); fs.mkdirSync(sources);
    for (const [name, source] of Object.entries(cases)) fs.writeFileSync(path.join(sources, name + '.kt'), source);
    const output = path.join(directory, 'psi');
    refs = Object.fromEntries(runOracle(Object.keys(cases).map(name => name + '.kt'), {root: sources, out: output})
      .map((entry, index) => [Object.keys(cases)[index], {...entry, dumpText: fs.readFileSync(path.join(output, entry.dump), 'utf8')} ]));
    const variants = [
      ['then-else', [['field_consequence', 'consequence', 'alternative'], ['field_alternative', 'alternative', 'consequence']]],
      ['condition-then', [['field_condition', 'condition', 'consequence'], ['field_consequence', 'consequence', 'condition']]],
      ['hidden-body', null],
    ];
    roots = [{label: 'pristine', root: ROOT}];
    for (const [label, fields] of variants) {
      const root = path.join(directory, label); fs.mkdirSync(root);
      for (const name of ['src', 'bindings']) fs.cpSync(path.join(ROOT, name), path.join(root, name), {recursive: true});
      for (const name of ['package.json', 'binding.gyp']) fs.copyFileSync(path.join(ROOT, name), path.join(root, name));
      fs.mkdirSync(path.join(root, 'node_modules'));
      for (const name of ['node-addon-api', 'node-gyp-build'])
        fs.cpSync(setup.dependencies[name], path.join(root, 'node_modules', name), {recursive: true});
      const file = path.join(root, 'src/parser.c'); let source = fs.readFileSync(file, 'utf8');
      if (fields) for (const [field, original, changed] of fields) {
        const needle = `[${field}] = "${original}"`;
        if (!source.includes(needle)) throw Error('Missing native field: ' + needle);
        source = source.replace(needle, `[${field}] = "${changed}"`);
      } else {
        const needle = '[sym_control_structure_body] = {\n    .visible = true,';
        if (!source.includes(needle)) throw Error('Missing visible native body');
        source = source.replace(needle, '[sym_control_structure_body] = {\n    .visible = false,');
      }
      fs.writeFileSync(file, source);
      execFileSync(process.execPath, [setup.nodeGyp, 'rebuild'], {cwd: root, timeout: 120000, stdio: 'pipe'});
      roots.push({label, root});
    }
    parsers = Object.fromEntries(api.loadParsers(roots, ROOT).map(value => [value.label, value.parser]));
  }, 360000);
  afterAll(() => { if (directory) fs.rmSync(directory, {recursive: true}); });
  function comparison(name, label = 'pristine') {
    const key = name + '/' + label;
    if (results.has(key)) return results.get(key);
    const text = cases[name], psi = refs[name], tree = api.parseText(parsers[label], text);
    try {
      expect(psi.psiErrors, key).toBe(0);
      expect(tree.rootNode.hasError, key).toBe(false);
      const c = compareWithPsi(tree.rootNode.toString(), psi.dumpText, {nativeRoot: tree.rootNode, source: text});
      const value = {...c, verdict: api.compareInput({text, tree, psi, dump: psi.dumpText}).verdict};
      results.set(key, value); return value;
    } finally { tree.delete?.(); }
  }
  it('keeps pristine IF and loop conditions/ranges/empty-body forms matching', () => {
    for (const name of Object.keys(cases)) expect(comparison(name).verdict, name).toBe('ok');
    const find = (node, name) => node.name === name ? node : node.children.map(c => find(c, name)).find(Boolean);
    expect(find(comparison('sameCalls').tsNorm, 'IF').children.map(n => n.name)).toEqual(['CONDITION', 'THEN', 'ELSE']);
    expect(find(comparison('forRange').tsNorm, 'FOR').children.map(n => n.name)).toEqual(['VALUE_PARAMETER', 'LOOP_RANGE', 'BODY']);
  });
  it('detects branch role swaps even when both branches have identical call shapes', () => {
    expect(comparison('sameCalls', 'then-else').verdict).toBe('C');
    expect(compareTrees(comparison('thenCall').tsNorm, comparison('elseCall').psiNorm).status).toBe('MISMATCH');
  });
  it('detects swapped fields with one semicolon-empty branch and one reference-only body', () => {
    for (const name of ['emptyThenReference', 'emptyElseReference', 'emptyThenComment', 'emptyElseComment']) {
      expect(comparison(name, 'then-else').verdict, name).toBe('C');
      expect(compareTrees(comparison(name, 'then-else').tsNorm, comparison(name).psiNorm).status, name).toBe('MISMATCH');
    }
  });
  it('detects a condition routed into the then role', () => {
    expect(comparison('sameCalls', 'condition-then').verdict).toBe('C');
    expect(compareTrees(comparison('sameCalls').tsNorm, comparison('conditionCall').psiNorm).status).toBe('MISMATCH');
  });
  it('detects a real rebuilt grammar hiding IF control_structure_body, including reference-only bodies', () => {
    for (const name of ['sameCalls', 'referenceBodies', 'bracedIf'])
      expect(comparison(name, 'hidden-body').verdict, name).toBe('C');
  });
  it('keeps loop range/condition swaps and hidden reference-only loop bodies visible', () => {
    for (const [a,b] of [['forRange','forRangeCall'], ['whileCondition','whileConditionCall']])
      expect(compareTrees(comparison(a).tsNorm, comparison(b).psiNorm).status, a).toBe('MISMATCH');
    for (const name of ['whileReference', 'forReference'])
      expect(comparison(name, 'hidden-body').verdict, name).toBe('C');
  });
});
