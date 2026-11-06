import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const api = {...require('./diff-classify'), ...require('./diff-execute')};
const {compareWithPsi} = require('./pipeline');
const {compareTrees} = require('./comparator');
const {Node} = require('./models');
const {normalizeTs} = require('./normalizer');
const {parseTreeSitter} = require('./parser-ts');
const {attachNative} = require('./native-metadata');
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
  annotatedAssignment: 'fun f(){@A x=1}\n',
  annotatedLoop: 'fun f(){@A for(x in y)foo()}\n',
  plainAssignment: 'fun f(){x=1}\n',
  argumentClassAnnotation: 'fun f(){foo(@A(T::class) Bar())}\n',
  plainClassArgument: 'fun f(){foo(Bar())}\n',
  multiAnnotationList: 'fun f(){@[A B] foo()}\n',
  multiAnnotationDeclaration: '@[A B] class C\n',
  singleAnnotationDeclaration: '@A class C\n',
  annotatedAssignmentArgs: 'fun f(){@A(1) x=1}\n',
  annotatedAssignmentLine: 'fun f(){@A(1)\nx=1}\n',
  annotatedAssignmentComment: 'fun f(){@A(1)\n//c\nx=1}\n',
  annotatedAssignmentBlockComment: 'fun f(){@A(1)/*c*/x=1}\n',
  annotatedAssignmentMultiple: 'fun f(){@A @B x=1}\n',
  annotatedAssignmentMixed: 'fun f(){@A\n@B x=1}\n',
  inlineQualifiedAssignment: 'fun f(){@A(1) x.y=1}\n',
  unknownEscape: 'val s="\\f"\n',
  unknownEscapeMixed: 'val s="a\\f\\n"\n',
  validEscape: 'val s="\\n"\n',
  constructorHeaderComment: 'class C(x:Int){@A //c\nconstructor():this(1)}\n',
  constructorEmptyBody: 'class C(x:Int){@A //c\nconstructor():this(1){}}\n',
  invalidUnicodeEscape: 'val s="a\\u12"\n',
  invalidUnicodeEscapeChars: 'val s="a\\u12ZZb"\n',
  annotatedInit: 'class C{@A init{foo()}}\n',
  plainInit: 'class C{init{foo()}}\n',
  annotatedDelegate: 'class C:@A I by x\n',
  plainDelegate: 'class C:I by x\n',
  classAnnotation: '@A class C:I by x\n',
  doubleQualifiedCall: 'val x=a.b()()\n',
  doubleSafeQualifiedCall: 'val x=a?.b()()\n',
  receiverThenCall: 'val x=a().b()\n',
  singleQualifiedCall: 'val x=a.b()\n',
  fieldListAnnotation: 'class C{@field:[A] val x=1}\n',
  fieldMultiAnnotation: 'class C{@field:[A B] val x=1}\n',
  fieldPlainAnnotation: 'class C{@field:A val x=1}\n',
  plainMultiAnnotation: 'class C{@[A B] val x=1}\n',
  dynamicFunction: 'val f:(dynamic)->Unit=fn\n',
  mixedDynamicFunction: 'val f:(dynamic,String,dynamic)->Unit=fn\n',
  zeroParameterFunction: 'val f:()->Unit=fn\n',
  anonymousReceiver: 'val f=fun String.(){}\n',
  anonymousQualifiedReceiver: 'val f=fun A.B.(){}\n',
  anonymousGenericReceiver: 'val f=fun List<T>.(){}\n',
  anonymousReceiverReturn: 'val f=fun List<T>.<U>(x:U):String{}\n',
  anonymousPlain: 'val f=fun(){}\n',
  anonymousParameter: 'val f=fun(x:String){}\n',
  tripleQualifiedCall: 'val x=a.b()()()\n',
  tripleSafeCall: 'val x=a?.b()()()\n',
  quadrupleQualifiedCall: 'val x=a.b()()()()\n',
  qualifiedArgumentCalls: 'val x=a.b(1)(2)(3)\n',
  qualifiedLambdaCalls: 'val x=a.b{}{1}{2}\n',
  qualifiedParenthesizedLambdaCalls: 'val x=a.b(){1}{2}\n',
  plainLambdaCalls: 'val x=f(){1}{2}\n',
  resultLambdaCall: 'val x=a.b()(){1}\n',
  labeledExpressionBody: 'fun f()=label@foo()\n',
  multipleLabeledExpressionBody: 'fun f()=outer@inner@foo()\n',
  labeledBlockBody: 'fun f(){label@foo()}\n',
  plainExpressionBody: 'fun f()=foo()\n',
  genericQualifiedReference: 'val r=Foo<T>.Bar<U>::baz\n',
  genericQualifiedClass: 'val r=Foo<T>.Bar<U>::class\n',
  genericQualifiedMember: 'val r=Foo<T>.bar\n',
  genericQualifiedMemberCall: 'val r=Foo<T>.bar()\n',
  genericQualifiedChain: 'val r=a.Foo<T>.Bar<U>::baz\n',
  plainQualifiedReference: 'val r=Foo.Bar::baz\n',
  typeContextReturn: 'fun f():context(A)()->Unit=fn\n',
  anonymousTypeContextReturn: 'val f=fun():context(A)()->Unit{}\n',
  nestedTypeContextParameter: 'val f:(context(A)B.(Int)->Unit)->Unit=fn\n',
  mixedDynamicContextParameter: 'val f:(dynamic,context(A)B.(Int)->Unit,dynamic)->Unit=fn\n',
  plainFunctionReturn: 'fun f():()->Unit=fn\n',
  declarationContextReturn: 'context(a:A) fun f():()->Unit=fn\n',
  parenthesizedSelectorCall: 'val x=a.(fn)()\n',
  parenthesizedSafeSelectorCall: 'val x=a?.(fn)(1)\n',
  lambdaSelectorCall: 'val x=a.{}()\n',
  parenthesizedLambdaSelectorCall: 'val x=a.({1})(2)\n',
  genericParenthesizedSelectorCall: 'val x=Foo<T>.(fn)()\n',
  callReceiverSelectorCall: 'val x=a.foo().(fn)(1)\n',
  parenthesizedSelectorValue: 'val x=a.(fn)\n',
  hiddenAnnotatedBinary: 'fun f(){g(x,@A a+b)}\n',
  hiddenAnnotatedBinaryArgs: 'fun f(){g(x,@A(T::class)\na+b)}\n',
  hiddenAnnotatedInfix: 'fun f(){g(x,@A(T::class)\na to b)}\n',
  hiddenAnnotatedCast: 'fun f(){g(x,@A(T::class)\na as T)}\n',
  hiddenAnnotatedNestedBinary: 'fun f(){g(x,@A(T::class)\na*b+c)}\n',
  parenthesizedAnnotatedBinary: 'fun f(){g(x,@A(T::class) (a+b))}\n',
  plainBinaryArgument: 'fun f(){g(x,a+b)}\n',
  explicitArgumentPrefix: 'fun f(){g(@A a+b)}\n',
  secondAnnotatedFunction: 'fun f(){g(x,@A fun(){})}\n',
  secondAnnotatedExtensionFunction: 'fun f(){g(x,@A fun T.(){})}\n',
  statementAnnotatedAnonymousFunction: '@A\nfun(){}\n',
  secondAnnotatedFunctionComment: 'fun f(){g(x,@A/*c*/fun(){})}\n',
  precedingAnnotatedCall: 'fun f(){@A foo();fun(){}}\n',
  secondPlainFunction: 'fun f(){g(x,fun(){})}\n',
  annotatedTryBinary: 'fun f(){try{@A(1) (a)+b}catch(e:T){}}\n',
  annotatedTryInfix: 'fun f(){try{@A(1) (a) to b}catch(e:T){}}\n',
  annotatedTryNestedBinary: 'fun f(){try{@A(1) @B(2) a*b+c}catch(e:T){}}\n',
  annotatedThenBinary: 'fun f(){if(c)@A(1) (a)+b else x}\n',
  annotatedElseBinary: 'fun f(){if(c)x else @A(1) (a)?:b}\n',
  annotatedBodyComment: 'fun f(){if(c)@A(1)/*c*/(a)+b else x}\n',
  annotatedTryParenthesized: 'fun f(){try{@A(1) (a+b)}catch(e:T){}}\n',
  plainTryBinary: 'fun f(){try{(a)+b}catch(e:T){}}\n',
  consecutiveExpressionAnnotations: 'val x=(@A(1) @B(2) a)\n',
  consecutiveLabeledAnnotations: 'val x=(@A(1) @B(2) l@1)\n',
  consecutiveCommentAnnotations: 'val x=(@A(1)/*c*/@B(2) l@1)\n',
  groupedExpressionAnnotations: 'val x=(@A(1) (@B(2) a))\n',
  separatedLabelAnnotations: 'val x=(@A(1) l@ @B(2) 1)\n',
  singleExpressionAnnotation: 'val x=(@A(1) a)\n',
  explicitStatementPrefix: 'fun f(){try{@A(1) a+b}catch(e:T){}}\n',
  explicitBranchPrefix: 'fun f(){if(c)@A(1) a+b else x}\n',
  newlineStatementAnnotation: 'fun f(){@A(1)\n(a)+b}\n',
  newlineMultipleAnnotations: 'fun f(){@A(1) @B(2)\n(a)+b}\n',
  newlineBetweenAnnotations: 'fun f(){@A(1)\n@B(2) (a)+b}\n',
  newlineInsideComment: 'fun f(){@A(1)/*c\n*/(a)+b}\n',
  newlineBranchAnnotation: 'fun f(){if(c)@A(1)\n(a)+b else x}\n',
  inlineStatementAnnotation: 'fun f(){@A(1) (a)+b}\n',
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
    const runtime = ROOT;
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
  it('N21 preserves explicit statement annotations and their assignment-target role', () => {
    for (const name of ['annotatedAssignment', 'annotatedAssignmentArgs', 'annotatedLoop', 'annotatedAssignmentLine', 'annotatedAssignmentComment', 'annotatedAssignmentBlockComment', 'annotatedAssignmentMultiple', 'annotatedAssignmentMixed', 'inlineQualifiedAssignment']) equivalent(name);
    different('annotatedAssignment', 'plainAssignment');
    different('annotatedAssignment', 'annotatedLoop');
    different('annotatedAssignmentArgs', 'annotatedAssignmentLine');
  });
  it('N22 retains an argument-owned annotation prefix instead of leaving annotation siblings', () => {
    equivalent('argumentClassAnnotation');
    different('argumentClassAnnotation', 'plainClassArgument');
    const value = comparison('argumentClassAnnotation');
    const variant = parseTreeSitter(value.tree.rootNode.toString());
    attachNative(variant, value.tree.rootNode);
    const nativeArgument = value.tree.rootNode.descendantsOfType('value_argument').find(node =>
      node.namedChildren.some(child => child.type === 'prefix_expression' && child.namedChildren.some(part => part.type === 'annotation')));
    function directPrefix(node) {
      if (node.name === 'value_argument' && node.children[0]?.name === 'prefix_expression') {
        node.children = node.children[0].children;
        node.sourceInfo.statementSpans = nativeArgument.namedChildren[0].namedChildren.map(child => ({start: child.startIndex, end: child.endIndex}));
        return true;
      }
      return node.children.some(directPrefix);
    }
    expect(directPrefix(variant)).toBe(true);
    expect(compareTrees(normalizeTs(variant), value.psiNorm).status).toBe('MATCH');
  });
  it('N23 retains each entry of a parsed bracket annotation list', () => {
    equivalent('multiAnnotationList'); equivalent('multiAnnotationDeclaration');
    different('multiAnnotationDeclaration', 'singleAnnotationDeclaration');
    different('multiAnnotationList', 'multiAnnotationDeclaration');
  });
  it('N24 retains invalid escape fragments and surrounding valid text', () => {
    equivalent('unknownEscape'); equivalent('unknownEscapeMixed');
    equivalent('invalidUnicodeEscape'); equivalent('invalidUnicodeEscapeChars');
    different('unknownEscape', 'validEscape');
  });
  it('N25 does not mistake a constructor header comment for a body', () => {
    equivalent('constructorHeaderComment'); equivalent('constructorEmptyBody');
    different('constructorHeaderComment', 'constructorEmptyBody');
  });
  it('N26 retains initializer header annotations outside the body', () => {
    equivalent('annotatedInit');
    different('annotatedInit', 'plainInit');
  });
  it('N27 gives a parsed delegated entry its hidden annotation prefix', () => {
    equivalent('annotatedDelegate'); equivalent('classAnnotation');
    different('annotatedDelegate', 'plainDelegate');
    different('annotatedDelegate', 'classAnnotation');
  });
  it('N28 preserves applying an already evaluated qualified call result', () => {
    equivalent('doubleQualifiedCall'); equivalent('doubleSafeQualifiedCall');
    different('doubleQualifiedCall', 'receiverThenCall');
    different('doubleQualifiedCall', 'singleQualifiedCall');
  });
  it('N29 retains a bracket annotation group target on every entry', () => {
    equivalent('fieldListAnnotation'); equivalent('fieldMultiAnnotation');
    expect(compareTrees(comparison('fieldListAnnotation').tsNorm, comparison('fieldPlainAnnotation').psiNorm).status).toBe('MATCH');
    different('fieldMultiAnnotation', 'plainMultiAnnotation');
    different('fieldMultiAnnotation', 'fieldListAnnotation');
  });
  it('N30 retains parameter slots for an anonymous parsed dynamic type token', () => {
    equivalent('dynamicFunction'); equivalent('mixedDynamicFunction');
    different('dynamicFunction', 'zeroParameterFunction');
    different('dynamicFunction', 'mixedDynamicFunction');
  });
  it('N31 wraps parsed anonymous extension receiver type pieces', () => {
    for (const name of ['anonymousReceiver', 'anonymousQualifiedReceiver', 'anonymousGenericReceiver', 'anonymousReceiverReturn']) equivalent(name);
    different('anonymousReceiver', 'anonymousPlain');
    different('anonymousReceiver', 'anonymousParameter');
    different('anonymousGenericReceiver', 'anonymousReceiver');
  });
  it('N32 preserves repeated qualified result invocations at arbitrary depth', () => {
    for (const name of ['tripleQualifiedCall', 'tripleSafeCall', 'quadrupleQualifiedCall', 'qualifiedArgumentCalls']) equivalent(name);
    different('tripleQualifiedCall', 'doubleQualifiedCall');
    different('tripleQualifiedCall', 'quadrupleQualifiedCall');
    different('tripleQualifiedCall', 'receiverThenCall');
  });
  it('N33 groups lambda-only suffixes as arguments of the preceding call', () => {
    for (const name of ['qualifiedLambdaCalls', 'qualifiedParenthesizedLambdaCalls', 'plainLambdaCalls', 'resultLambdaCall']) equivalent(name);
    different('qualifiedLambdaCalls', 'tripleQualifiedCall');
    different('qualifiedParenthesizedLambdaCalls', 'resultLambdaCall');
  });
  it('N34 retains all pieces of a parsed equals expression body without a brace block', () => {
    equivalent('labeledExpressionBody'); equivalent('multipleLabeledExpressionBody');
    different('labeledExpressionBody', 'labeledBlockBody');
    different('labeledExpressionBody', 'plainExpressionBody');
  });
  it('N35 wraps generic qualifiers only before their parsed member dot', () => {
    for (const name of ['genericQualifiedReference', 'genericQualifiedClass', 'genericQualifiedMember', 'genericQualifiedMemberCall', 'genericQualifiedChain']) equivalent(name);
    different('genericQualifiedReference', 'plainQualifiedReference');
    different('genericQualifiedReference', 'genericQualifiedClass');
    different('genericQualifiedMember', 'genericQualifiedMemberCall');
  });
  it('N36 nests parsed type contexts in return and unnamed parameter function types', () => {
    for (const name of ['typeContextReturn', 'anonymousTypeContextReturn', 'nestedTypeContextParameter', 'mixedDynamicContextParameter']) equivalent(name);
    equivalent('declarationContextReturn');
    different('typeContextReturn', 'plainFunctionReturn');
    different('typeContextReturn', 'declarationContextReturn');
    different('nestedTypeContextParameter', 'mixedDynamicContextParameter');
  });
  it('N37 preserves parenthesized and lambda member selectors as call targets', () => {
    for (const name of ['parenthesizedSelectorCall', 'parenthesizedSafeSelectorCall', 'lambdaSelectorCall', 'parenthesizedLambdaSelectorCall', 'genericParenthesizedSelectorCall', 'callReceiverSelectorCall']) equivalent(name);
    different('parenthesizedSelectorCall', 'parenthesizedSelectorValue');
    different('parenthesizedSelectorCall', 'singleQualifiedCall');
    different('lambdaSelectorCall', 'parenthesizedLambdaSelectorCall');
  });
  it('N38 interprets a separate argument annotation as a prefix of its first operand', () => {
    for (const name of ['hiddenAnnotatedBinary', 'hiddenAnnotatedBinaryArgs', 'hiddenAnnotatedInfix', 'hiddenAnnotatedCast', 'hiddenAnnotatedNestedBinary']) equivalent(name);
    equivalent('parenthesizedAnnotatedBinary');
    different('hiddenAnnotatedBinary', 'plainBinaryArgument');
    different('hiddenAnnotatedBinaryArgs', 'parenthesizedAnnotatedBinary');
    different('hiddenAnnotatedNestedBinary', 'hiddenAnnotatedBinaryArgs');
    expect(comparison('explicitArgumentPrefix').result.differences.length).toBeGreaterThan(0);
    expect(comparison('explicitStatementPrefix').result.differences.length).toBeGreaterThan(0);
    expect(comparison('explicitBranchPrefix').result.differences.length).toBeGreaterThan(0);
  });
  it('N39 starts anonymous declarations at their parsed hidden annotation prefix', () => {
    for (const name of ['secondAnnotatedFunction', 'secondAnnotatedExtensionFunction', 'statementAnnotatedAnonymousFunction', 'secondAnnotatedFunctionComment', 'precedingAnnotatedCall']) equivalent(name);
    different('secondAnnotatedFunction', 'secondPlainFunction');
    different('statementAnnotatedAnonymousFunction', 'precedingAnnotatedCall');
  });
  it('N40 gives a hidden statement or branch annotation to its first binary operand', () => {
    for (const name of ['annotatedTryBinary', 'annotatedTryInfix', 'annotatedTryNestedBinary',
      'annotatedThenBinary', 'annotatedElseBinary', 'annotatedBodyComment', 'annotatedTryParenthesized']) equivalent(name);
    different('annotatedTryBinary', 'plainTryBinary');
    different('annotatedTryNestedBinary', 'annotatedTryBinary');
    expect(comparison('explicitArgumentPrefix').result.differences.length).toBeGreaterThan(0);
    for (const name of ['newlineStatementAnnotation', 'newlineMultipleAnnotations', 'newlineBetweenAnnotations',
      'newlineInsideComment', 'newlineBranchAnnotation', 'inlineStatementAnnotation']) equivalent(name);
    different('inlineStatementAnnotation', 'newlineStatementAnnotation');
    different('annotatedThenBinary', 'newlineBranchAnnotation');
  });
  it('N41 groups consecutive expression annotations without crossing parentheses or labels', () => {
    for (const name of ['consecutiveExpressionAnnotations', 'consecutiveLabeledAnnotations',
      'consecutiveCommentAnnotations', 'groupedExpressionAnnotations', 'separatedLabelAnnotations']) equivalent(name);
    different('consecutiveExpressionAnnotations', 'singleExpressionAnnotation');
    different('consecutiveExpressionAnnotations', 'groupedExpressionAnnotations');
    different('consecutiveLabeledAnnotations', 'separatedLabelAnnotations');
  });
});
