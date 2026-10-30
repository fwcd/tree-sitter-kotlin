/**
 * Generated snippet corpora for the PSI differential run.
 *
 * `mutations` fills every name position of a set of templates with Kotlin's
 * hard keywords, soft keywords, modifiers, `typeof`, backticked keywords and
 * backticked plain names, and adds fixed shapes around the positions a
 * reserved-word, separator, delegate, control-body or destructuring change can
 * move: unbraced control bodies, declarations after `}` on one line, delegate
 * operands followed by `{`, comparison operands and mixed destructuring.
 *
 * `review-329` holds the snippets of the review of fwcd/tree-sitter-kotlin#329.
 *
 * Usage: node tools/cross-validation/mutations.js [--out DIR]
 * writes DIR/mutations/... and DIR/review-329/... plus a `snippets.json` each.
 *
 * @module cross-validation/mutations
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HARD_KEYWORDS = ['as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in',
  'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try',
  'typealias', 'typeof', 'val', 'var', 'when', 'while'];
const SOFT_KEYWORDS = ['by', 'catch', 'constructor', 'delegate', 'dynamic', 'field', 'file', 'finally', 'get',
  'import', 'init', 'param', 'property', 'receiver', 'set', 'setparam', 'value', 'where', 'context', 'it'];
const MODIFIERS = ['abstract', 'actual', 'annotation', 'companion', 'const', 'crossinline', 'data', 'enum',
  'expect', 'external', 'final', 'infix', 'inline', 'inner', 'internal', 'lateinit', 'noinline', 'open',
  'operator', 'out', 'override', 'private', 'protected', 'public', 'reified', 'sealed', 'suspend', 'tailrec',
  'vararg'];

/** Every name a hole is filled with. */
function names() {
  const plain = [...HARD_KEYWORDS, ...SOFT_KEYWORDS, ...MODIFIERS, 'x'];
  const quoted = [...HARD_KEYWORDS, 'x', 'a b', 'by', 'out'].map(word => `\`${word}\``);
  return [...plain, ...quoted];
}

/**
 * Templates with one name hole `N`. Each yields a whole file; `.kts` marks a
 * script. The set covers declaration names, references, labels, selectors,
 * string templates, parameters, destructuring entries, types and annotations.
 */
const NAME_TEMPLATES = [
  ['property-name', 'val N = 1\n'],
  ['function-name', 'fun N() {}\n'],
  ['class-name', 'class N\n'],
  ['typealias-name', 'typealias N = Int\n'],
  ['parameter-name', 'fun f(N: Int) {}\n'],
  ['type-parameter', 'fun <N> f() {}\n'],
  ['member-function', 'class C {\n    fun N() {}\n}\n'],
  ['local-property', 'fun f() {\n    val N = 1\n}\n'],
  ['reference', 'fun f() {\n    N\n}\n'],
  ['call', 'fun f() {\n    N(1)\n}\n'],
  ['call-trailing-lambda', 'fun f() {\n    N {}\n}\n'],
  ['label-loop', 'fun f() {\n    N@ while (true) {}\n}\n'],
  ['label-lambda', 'fun f() {\n    run N@{ return@N }\n}\n'],
  ['label-declaration', 'fun f() {\n    N@ val x = 1\n}\n'],
  ['label-call', 'fun f() {\n    N@ foo()\n}\n'],
  ['return-label', 'fun f() {\n    run { return@N }\n}\n'],
  ['this-label', 'class C {\n    fun f() = this@N\n}\n'],
  ['dot-selector', 'fun f() {\n    x.N\n}\n'],
  ['safe-selector', 'fun f() {\n    x?.N\n}\n'],
  ['callable-reference', 'fun f() {\n    x::N\n}\n'],
  ['dot-call', 'fun f() {\n    x.N()\n}\n'],
  ['short-template', 'val s = "$N"\n'],
  ['long-template', 'val s = "${N}"\n'],
  ['raw-template', 'val s = """$N"""\n'],
  ['type', 'fun f(): N = TODO()\n'],
  ['annotation', '@N fun f() {}\n'],
  ['import', 'import a.N\n'],
  ['package', 'package a.N\n'],
  ['destructuring-entry', 'fun f() {\n    val (N, b) = p\n}\n'],
  ['comparison-operand', 'fun f() {\n    1 < N\n}\n'],
  ['named-argument', 'fun f() {\n    g(N = 1)\n}\n'],
  ['script-statement', 'N\n', '.kts'],
];

const CONTROL_HEADS = ['if (c) ', 'if (c) x else ', 'while (c) ', 'for (i in x) ', 'do ', 'when (x) { 1 -> '];
const CONTROL_TAILS = { 'do ': ' while (c)', 'when (x) { 1 -> ': ' }' };
const DECLARATIONS = ['fun g() {}', 'fun() {}', 'class K {}', 'object O {}', 'interface I {}', '@A fun g() {}',
  'val y = 1', 'typealias T = Int', 'enum class E { A }', 'fun <T> g() {}', 'suspend fun g() {}'];
const AFTER_BRACE = ['fun b() {}', '@A fun b() {}', '@A class B', 'private fun b() {}', 'val y = 1', 'class B',
  '@A val y = 1', '@file:A', 'object O', 'init {}'];
const DELEGATE_OPERANDS = ['throw x', 'return x', 'if (true) x else y', 'when (c) { else -> x }', 'x<T>',
  'x<T, U>', 'a foo b', 'x.y', 'x()', 'x?.y', 'x as I', 'x ?: y', 'object : I {}', 'try { x } finally {}'];
const COMPARISON_OPERANDS = ['interface I {}', 'class C {}', 'object O {}', 'fun g() {}', 'fun() {}', 'object {}',
  'typealias T = Int', 'val y = 1'];
const DESTRUCTURING = ['(val a, b) = p', '(a, val b) = p', '[val a, b] = p', '[a, var b] = p',
  '(val a, val b) = p', '[val a, var b] = p', '(a, b) = p', '[a, b] = p', 'val (a, b) = p', 'val [a, b] = p',
  'val (a, val b) = p', 'val [a, val b] = p', '(val a: Int, b) = p', '(val a = x, b) = p',
  'val (a = x, b = y) = p', '(val a = x, val b = y) = p', '(val a = x, b = y) = p'];

/**
 * @returns {Array<{ id: string, group: string, text: string, extension: string }>}
 */
function generateMutations() {
  const snippets = [];
  const add = (group, text, extension = '.kt') => {
    snippets.push({ id: `${group}/${String(snippets.filter(s => s.group === group).length).padStart(4, '0')}`, group, text, extension });
  };
  for (const [group, template, extension] of NAME_TEMPLATES) {
    for (const name of names()) add(group, template.replace(/N/g, name), extension);
  }
  for (const head of CONTROL_HEADS) {
    for (const declaration of DECLARATIONS) {
      add('control-body', `fun f() {\n    ${head}${declaration}${CONTROL_TAILS[head] || ''}\n}\n`);
    }
  }
  for (const declaration of AFTER_BRACE) {
    add('after-brace-top', `fun a() {} ${declaration}\n`);
    add('after-brace-top', `fun a() {} ${declaration}\n`, '.kts');
    add('after-brace-class', `class C {\n    fun a() {} ${declaration}\n}\n`);
    add('after-brace-local', `fun f() {\n    fun a() {} ${declaration}\n}\n`);
    add('after-brace-lambda', `fun f() {\n    run {} ${declaration}\n}\n`);
  }
  for (const operand of DELEGATE_OPERANDS) {
    add('delegate', `class C : I by ${operand} { fun m() {} }\n`);
    add('delegate', `class C : I by ${operand}\n{ fun m() {} }\n`);
    add('delegate', `class C : I by ${operand}, J { fun m() {} }\n`);
    add('delegate', `val c = object : I by ${operand} { fun m() {} }\n`);
  }
  for (const operand of COMPARISON_OPERANDS) {
    for (const operator of ['<', '>', '==', '+', '&&', '?:', 'in']) {
      add('operator-operand', `fun f() {\n    1 ${operator} ${operand}\n}\n`);
    }
  }
  for (const form of DESTRUCTURING) {
    add('destructuring', `fun f() {\n    ${form}\n}\n`);
    add('destructuring', `fun f() {\n    for (${form.replace(/^val /, '').replace(/ = p$/, '')} in xs) {}\n}\n`);
    add('destructuring', `fun f() {\n    xs.forEach { ${form.replace(/^val /, '').replace(/ = p$/, '')} -> }\n}\n`);
  }
  return snippets;
}

/** The snippets of the review of fwcd/tree-sitter-kotlin#329, one file each. */
const REVIEW_329 = [
  ['1-typeof', 'val typeof = 1\n'],
  ['1-keyword-label', 'fun f() { class@ foo() }\n'],
  ['2-dot-this', 'fun f() { x.this }\n'],
  ['2-comparison-interface', 'fun g() { 1 < interface I {} }\n'],
  ['3-escaped-label', 'fun f() { `if`@ while (true) {} }\n'],
  ['4-control-body-fun', 'fun f() { if (c) fun g() {} }\n'],
  ['5-delegate-throw', 'class C : I by throw x { fun m() {} }\n'],
  ['5-delegate-if', 'class D : I by if (true) x else y { fun m() {} }\n'],
  ['5-delegate-generic', 'class E : I by x<T>\n{ fun m() {} }\n'],
  ['6-annotated-after-brace', 'fun a() {} @A fun b() {}\n'],
  ['7-escaped-template', 'val x = "$`if`"\n'],
  ['8-positional-mixed', 'fun f() { [val a, b] = pair }\n'],
  ['8-parenthesized-mixed', 'fun g() { (val a, b) = pair }\n'],
].map(([id, text]) => ({ id, group: 'review-329', text, extension: '.kt' }));

function writeCorpus(dir, snippets) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const snippet of snippets) {
    const file = path.join(dir, snippet.id + snippet.extension);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, snippet.text);
  }
  fs.writeFileSync(path.join(dir, 'snippets.json'), JSON.stringify(snippets, null, 2) + '\n');
}

module.exports = { HARD_KEYWORDS, SOFT_KEYWORDS, MODIFIERS, NAME_TEMPLATES, REVIEW_329, names, generateMutations, writeCorpus };

if (require.main === module) {
  const args = process.argv.slice(2);
  const out = path.resolve(args[0] === '--out' ? args[1] : path.join(__dirname, '..', '..', 'local', 'psi-diff', 'corpora'));
  const mutations = generateMutations();
  writeCorpus(path.join(out, 'mutations'), mutations);
  writeCorpus(path.join(out, 'review-329'), REVIEW_329);
  console.log(JSON.stringify({ out, mutations: mutations.length, review: REVIEW_329.length }));
}
