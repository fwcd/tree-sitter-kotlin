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
const {Node} = require('./models');
const {normalizeTs} = require('./normalizer');
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
  genericClass: 'val k=Foo<T>::class\n',
  genericReference: 'val r=Foo<T>::bar\n',
  qualifiedGenericClass: 'val k=a.b.Foo<T>::class\n',
  callGenericClass: 'val k=foo().Bar<T>::class\n',
  plainClass: 'val k=Foo::class\n',
  nullableContextInside: 'val f:(context(a:Any)()->Unit)??=fn\n',
  multipleAnnotations: 'fun f(){@A @B foo()}\n',
  argumentAnnotations: 'fun f(){@A(1) @B(2) foo()}\n',
  controlAnnotations: 'fun f(){if(c)@A @B foo()}\n',
  annotatedDeclaration: 'fun f(){@A val x=foo()}\n',
  repeatedAnnotationGroups: 'fun f(){@A @B foo();@C @D bar()}\n',
  emptyFor: 'fun f(){for(x in y);}\n',
  emptyWhile: 'fun f(){while(c);}\n',
  forCall: 'fun f(){for(x in y)foo()}\n',
  detachedForThrow: 'fun f(){for(x in y)\nthrow x}\n',
  genericDelegate: 'class C:I<T> by factory<U>()\n',
  genericObjectDelegate: 'val x=object:I<T> by factory<U>(){}\n',
  genericDelegateComments: 'class C:I<T> by factory/* c */<U>()\n',
  plainDelegate: 'class C:I<T> by factory()\n',
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
    equivalent('nullableContextInside');
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
  it('N17 preserves generic expression receivers and the callable-versus-class distinction', () => {
    for (const name of ['genericClass', 'genericReference', 'qualifiedGenericClass', 'callGenericClass']) equivalent(name);
    different('genericClass', 'plainClass');
    different('genericReference', 'genericClass');
    different('callGenericClass', 'qualifiedGenericClass');
  });
  it('N18 groups only a hidden statement annotation prefix with its expression', () => {
    for (const name of ['multipleAnnotations', 'argumentAnnotations', 'controlAnnotations', 'annotatedDeclaration', 'repeatedAnnotationGroups']) equivalent(name);
    different('multipleAnnotations', 'annotatedDeclaration');
    const actual = comparison('annotatedDeclaration');
    const statement = actual.tsTree.children[0].children.find(child => child.name === 'function_body').children[0];
    const declaration = statement.children[0];
    const annotations = declaration.children[0].children;
    const bare = new Node('property_declaration', declaration.children.slice(1));
    const detachedStatements = new Node('statements', annotations.concat(bare));
    Object.defineProperty(detachedStatements, 'sourceInfo', {value: {...statement.sourceInfo,
      statementSpans: annotations.concat(bare).map(() => statement.sourceInfo.statementSpans[0])}});
    const detached = new Node('source_file', [new Node('function_declaration', [new Node('function_body', [detachedStatements])])]);
    expect(compareTrees(normalizeTs(detached), actual.psiNorm).status).toBe('MISMATCH');
  });
  it('N19 retains the optional empty loop-body slot without moving a detached statement into it', () => {
    equivalent('emptyFor'); equivalent('emptyWhile'); equivalent('detachedForThrow');
    different('emptyFor', 'forCall');
    const value = comparison('forCall');
    const loop = value.tsTree.children[0].children.find(child => child.name === 'function_body').children[0].children[0];
    const body = loop.children.find(child => child.name === 'control_structure_body');
    const empty = new Node('for_statement', loop.children.filter(child => child !== body));
    const detached = new Node('source_file', [new Node('function_declaration', [new Node('function_body', [new Node('statements', [empty, ...body.children])])])]);
    expect(compareTrees(normalizeTs(detached), value.psiNorm).status).toBe('MISMATCH');
  });
  it('N20 joins only the parsed generic delegate callee/suffix alias while retaining type arguments', () => {
    equivalent('genericDelegate'); equivalent('genericObjectDelegate'); equivalent('genericDelegateComments');
    different('genericDelegate', 'plainDelegate');
    different('genericDelegate', 'genericObjectDelegate');
  });
});
