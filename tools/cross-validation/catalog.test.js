import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const api = {...require('./diff-classify'), ...require('./diff-execute')};
const { compareTrees } = require('./comparator');
const { compareWithPsi } = require('./pipeline');
const { hiddenSpans } = require('./native-metadata');
const { runOracle, isFetched } = { ...require('../psi-oracle/oracle'), ...require('../psi-oracle/fetch') };
let available = isFetched() && fs.existsSync(path.join(ROOT, 'build/Release/tree_sitter_kotlin_binding.node'));
try { require('../safety').javaExecutable(); } catch { available = false; }
if (!available) process.stderr.write('Catalog native tests need npm install and npm run psi-oracle:fetch with JDK 17+\n');

const cases = {
  wildcard: 'import foo.*\n',
  qualified: 'fun f(){a.b()}\n',
  constructor: 'class C private /* trivia */ constructor()\n',
  ordinaryConstructor: 'fun f(){a.constructor()}\n',
  unsigned: 'val x=1u\n',
  character: "val x='u'\n",
  handlers: 'fun f(){try{foo()}catch(e:E){bar()}finally{baz()}}\n',
  calls: 'fun f(){foo();bar();baz()}\n',
  index: 'fun f(){a[0]=b}\n',
  assign: 'fun f(){a=b}\n',
  thisAccess: 'class C{fun f(){this.x=1}}\n',
  emptyIf: 'fun f(){if(c){}else{}}\n',
  expressionIf: 'fun f(){if(c)foo()else bar()}\n',
  escaped: 'val s="a\\nb"\n',
  raw: 'val s="""a\\nb"""\n',
  escapedDollar: 'val s="\\$x"\n',
  interpolated: 'val s="$x"\n',
  chain: 'fun f(){val x=foo().bar.baz}\n',
  references: 'fun f(){val x=foo.bar.baz}\n',
  implicit: 'class C{constructor(){}}\n',
  noBody: 'class C{constructor()}\n',
  explicit: 'class C{constructor():this("x"){}}\n',
  shortThis: 'class C{val s="$this"}\n',
  shortName: 'class C{val s="$x"}\n',
  prefix: 'val s=$$"literal $x $$y"\n',
  prefixOther: 'val s=$$"literal $$x $$y"\n',
  initEmpty: 'class C{init{}}\n',
  initStatement: 'class C{init{foo()}}\n',
  noInit: 'class C{}\n',
  initLambda: 'class C{init{{foo()}}}\n',
  questBug: 'val r=String? ::plus\n',
};

describe.skipIf(!available)('source-aware normalization catalog', () => {
  let directory, parser, references;
  const compared = new Map();
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kotlin-catalog-'));
    for (const [name, source] of Object.entries(cases)) fs.writeFileSync(path.join(directory, name + '.kt'), source);
    const names = Object.keys(cases);
    references = Object.fromEntries(runOracle(names.map(n => n + '.kt'), {
      root: directory, out: path.join(directory, 'psi'),
    }).map((entry, i) => [names[i], entry]));
    const runtime = ROOT;
    [{ parser }] = api.loadParsers([{ label: 'head', root: ROOT }], runtime);
  }, 120000);
  afterAll(() => { if (directory) fs.rmSync(directory, { recursive: true }); });
  function comparison(name) {
    if (compared.has(name)) return compared.get(name);
    const source = cases[name], tree = api.parseText(parser, source), psi = references[name];
    const dump = fs.readFileSync(path.join(directory, 'psi', psi.dump), 'utf8');
    expect(psi.psiErrors, name).toBe(0);
    expect(tree.rootNode.hasError, name).toBe(false);
    const value = { ...compareWithPsi(tree.rootNode.toString(), dump, { nativeRoot: tree.rootNode, source }), tree, psi, dump };
    compared.set(name, value);
    return value;
  }
  function equivalent(name) { expect(comparison(name).result.differences, name).toEqual([]); }
  function different(native, psi) {
    expect(compareTrees(comparison(native).tsNorm, comparison(psi).psiNorm).status).toBe('MISMATCH');
  }
  it('N1 owns only the parsed wildcard-import separator', () => {
    equivalent('wildcard');
    const root = comparison('qualified').tree.rootNode;
    expect(root.descendantsOfType('navigation_expression').flatMap(hiddenSpans)).toEqual([]);
    const native = api.lexicalFacts(root);
    native.tokens = native.tokens.filter(n => n.type !== '.');
    expect(api.tokenDifference(cases.qualified, root, api.psiLayout(comparison('qualified').dump, cases.qualified), native)).not.toBeNull();
  });
  it('N2 owns a hidden constructor keyword after modifiers, never an ordinary call', () => {
    equivalent('constructor');
    different('constructor', 'ordinaryConstructor');
    expect(comparison('ordinaryConstructor').tree.rootNode.descendantsOfType('call_expression').flatMap(hiddenSpans)).toEqual([]);
  });
  it('N3 represents unsigned constants once and preserves distinct literal kinds', () => {
    equivalent('unsigned'); different('unsigned', 'character');
  });
  it('N4 retains handler blocks, parameters and ownership', () => {
    equivalent('handlers'); different('handlers', 'calls');
  });
  it('N5 folds lvalue suffixes without equating indexed and direct assignment', () => {
    equivalent('index'); equivalent('thisAccess'); different('index', 'assign');
  });
  it('N6 uses actual braces for an empty body', () => {
    equivalent('emptyIf'); different('emptyIf', 'expressionIf');
  });
  it('N7 preserves decoded string contents, source spans and interpolation boundaries', () => {
    equivalent('escaped'); equivalent('raw'); equivalent('escapedDollar'); equivalent('interpolated');
    different('escaped', 'raw'); different('escapedDollar', 'interpolated');
  });
  it('N8 retains calls under nested qualification', () => {
    equivalent('chain'); different('chain', 'references');
  });
  it('N9 retains implicit/explicit delegation and optional bodies', () => {
    equivalent('implicit'); equivalent('noBody'); equivalent('explicit'); different('implicit', 'explicit'); different('implicit', 'noBody');
  });
  it('N10 distinguishes short this interpolation from a reference', () => {
    equivalent('shortThis'); different('shortThis', 'shortName');
  });
  it('N11 preserves multi-dollar interpolation semantics', () => {
    equivalent('prefix'); equivalent('prefixOther'); different('prefix', 'prefixOther');
  });
  it('N12 wraps initializer blocks exactly once, retaining empty and nested bodies', () => {
    equivalent('initEmpty'); equivalent('initStatement'); equivalent('initLambda'); different('initEmpty', 'noInit'); different('initStatement', 'initLambda');
  });
  it('does not invent missing nullable-reference source characters', () => {
    const source = cases.questBug, tree = api.parseText(parser, source), psi = references.questBug;
    const dump = fs.readFileSync(path.join(directory, 'psi', psi.dump), 'utf8');
    expect(psi.psiErrors).toBe(0);
    expect(api.compareInput({ text: source, tree, psi, dump }).verdict).toBe('C');
  });
});
