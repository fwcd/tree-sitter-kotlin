import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const api = require('./diff-run');
const {compareWithPsi} = require('./pipeline');
const {compareTrees} = require('./comparator');
const {runOracle} = require('../psi-oracle/oracle');
let available = require('../psi-oracle/fetch').isFetched() && fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));
try { require('../safety').javaExecutable(); } catch { available = false; }
if (!available) process.stderr.write('Normalizer-loop tests need npm install and npm run psi-oracle:fetch with JDK 17+\n');
const cases = {
  whenDeclared: 'fun f(){when(val x=foo()){is String->1;else->2}}\n',
  whenExpression: 'fun f(){when(foo()){is String->1;else->2}}\n',
  whenTyped: 'fun f(){when(val x:T=foo()){else->1}}\n',
  whenReceiver: 'fun f(){when(val T.x=foo()){else->1}}\n',
  whenDestructured: 'fun f(){when(val (a,b)=foo()){else->1}}\n',
  whenNoInitializer: 'fun f(){when(val x:T){else->1}}\n',
  nullableRepeated: 'val x: Map<String,Any??> = foo()\n',
  nullableSingle: 'val x: Map<String,Any?> = foo()\n',
  nullableFunction: 'val x: (String)->Any??? = foo()\n',
  safeReference: 'val x=a?.b?:-1\n',
  safeCall: 'val x=foo()?.bar\n',
  postfixTarget: 'fun f(){a!!.b=c}\n',
  plainTarget: 'fun f(){a.b=c}\n',
  indexedPostfixTarget: 'fun f(){a[0]!!.b=c;a!![0]=c}\n',
  postfixOnlyTarget: 'fun f(){a!! = c}\n',
  postfixTriviaTarget: 'fun f(){a/* outer /* nested */ end */!!.b=c}\n',
  postfixIncrementTarget: 'fun f(){a++.b=c;a--[0]=c}\n',
};

describe.skipIf(!available)('normalizer fix-loop equivalences', () => {
  let directory, refs, parser;
  const results = new Map();
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'normalizer-loop-'));
    const names = Object.keys(cases);
    for (const name of names) fs.writeFileSync(path.join(directory, name + '.kt'), cases[name]);
    refs = Object.fromEntries(runOracle(names.map(name => name + '.kt'), {
      root: directory, out: path.join(directory, 'psi'),
    }).map((entry, i) => [names[i], entry]));
    const runtime = fs.existsSync(path.join(ROOT, 'tools/psi-gate/node_modules')) ? path.join(ROOT, 'tools/psi-gate') : ROOT;
    [{parser}] = api.loadParsers([{label: 'head', root: ROOT}], runtime);
  }, 120000);
  afterAll(() => { if (directory) fs.rmSync(directory, {recursive: true}); });
  function comparison(name) {
    if (results.has(name)) return results.get(name);
    const text = cases[name], psi = refs[name], tree = api.parseText(parser, text);
    expect(psi.psiErrors, name).toBe(0);
    expect(tree.rootNode.hasError, name).toBe(false);
    const dump = fs.readFileSync(path.join(directory, 'psi', psi.dump), 'utf8');
    const result = {...compareWithPsi(tree.rootNode.toString(), dump, {nativeRoot: tree.rootNode, source: text}), tree, psi, dump};
    results.set(name, result);
    return result;
  }
  function equivalent(name) {
    const value = comparison(name);
    expect(value.result.differences, name).toEqual([]);
    expect(api.compareInput({text: cases[name], tree: value.tree, psi: value.psi, dump: value.dump}).verdict, name).toBe('ok');
  }
  function different(native, psi) { expect(compareTrees(comparison(native).tsNorm, comparison(psi).psiNorm).status).toBe('MISMATCH'); }

  it('N13 keeps when subject declarations distinct from ordinary subject expressions', () => {
    for (const name of ['whenDeclared', 'whenTyped', 'whenReceiver', 'whenDestructured', 'whenNoInitializer']) equivalent(name);
    different('whenDeclared', 'whenExpression');
    different('whenTyped', 'whenNoInitializer');
  });
  it('N14 retains every parsed nullable layer instead of dropping repeated markers', () => {
    equivalent('nullableRepeated'); equivalent('nullableFunction');
    different('nullableRepeated', 'nullableSingle');
  });
  it('N15 retains anonymous postfix operators in assignment targets and their suffix order', () => {
    for (const name of ['postfixTarget', 'indexedPostfixTarget', 'postfixOnlyTarget', 'postfixTriviaTarget', 'postfixIncrementTarget']) equivalent(name);
    different('postfixTarget', 'plainTarget');
    different('postfixTarget', 'indexedPostfixTarget');
  });
  it('N16 uses the same reference-only cleanup for safe access while preserving calls and tokens', () => {
    equivalent('safeReference'); equivalent('safeCall');
    different('safeReference', 'safeCall');
    const {tree, dump} = comparison('safeReference');
    const facts = api.lexicalFacts(tree.rootNode);
    facts.tokens = facts.tokens.filter(token => token.type !== '?.');
    expect(api.tokenDifference(cases.safeReference, tree.rootNode, api.psiLayout(dump, cases.safeReference), facts)).not.toBeNull();
  });
});
