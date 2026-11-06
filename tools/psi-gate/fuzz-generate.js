'use strict';

const legacy = require('./fuzz-declarations');
const { generator } = require('./mutate');
const { renderer, descendants, named } = require('./fuzz-grammar');

const EXPRESSIONS = [
  'additive_expression', 'multiplicative_expression', 'comparison_expression', 'equality_expression',
  'conjunction_expression', 'disjunction_expression', 'elvis_expression', 'range_expression',
  'check_expression', 'as_expression', 'infix_expression', 'prefix_expression', 'postfix_expression',
  'call_expression', 'indexing_expression', 'navigation_expression', 'if_expression', 'when_expression',
  'try_expression', 'anonymous_function', 'lambda_literal', 'object_literal', 'string_literal', 'callable_reference',
];
const CONTEXTS = [
  ['initializer', 'property_declaration', e => `val target = ${e}`],
  ['argument', 'value_argument', e => `fun target(x: Any?) { consume(${e}) }`],
  ['return', 'parenthesized_expression', e => `fun target(x: Any?): Any? { return (${e}) }`],
  ['lambda', 'statements', e => `val target = { x: Any? -> ${e} }`],
  ['condition', 'if_expression', e => `fun target(x: Any?) { if (${e}) Unit }`],
  ['branch', 'control_structure_body', e => `fun target(x: Any?) = if (x == null) ${e} else null`],
  ['receiver', 'parenthesized_expression', e => `fun target(x: Any?) = (${e}).toString()`],
  ['member', 'property_declaration', e => `class Target { val target = ${e} }`],
];
const EXTRA = [
  ['directives', 'import_header', () =>
      'package generated.deep\nimport kotlin.collections.*\nimport kotlin.String as ' +
      'Text\nval directive = 1'],
  ['file-annotations', 'file_annotation', () => '@file:[Suppress("x") JvmName("Generated")]\npackage generated\nval a = 1'],
  ['grouped-annotations', 'annotation', () => '@[Ann Arr([1, 2])] class Grouped'],
  ['annotation-targets', 'use_site_target', () =>
      'class C(@param:Ann val x: Int) { @all:Ann @field:Ann @property:Ann @get:Ann @set:Ann ' +
      '@setparam:Ann var p = 1; @delegate:Ann val q by lazy { 1 } }\n@receiver:Ann fun ' +
      'String.ext() = this'],
  ['backing-fields', 'backing_field', () => 'class C { val x: Any field: String = "value" }'],
  ['intersection', 'not_nullable_type', () => 'fun <T> nonnull(x: T & Any): T & Any = x'],
  ['parenthesized-intersection', 'parenthesized_user_type', () => 'fun<T> target(x: T & (Any)): T & Any = x'],
  ['parenthesized-types', 'parenthesized_type', () => 'val function: ((Int) -> Any)? = null'],
  ['dynamic-types', 'user_type', () => 'fun dynamicValue(x: dynamic): dynamic = x'],
  ['legacy-context', 'context_receiver', () => 'context(Any, String) fun contextual() = 1'],
  ['contract-v2', 'function_declaration', () =>
      'fun check(x: Any?) contract [returns() implies (x != null), callsInPlace(block, ' +
      'InvocationKind.UNKNOWN)] {}'],
  ['companion-block', 'companion_object', () => 'class C { companion { val x = 1; fun f() = 1 } }'],
  ['enum-constructors', 'enum_entry', () => 'enum class E(val x: Int) { A(1) { override fun f() = 2 }, B(2); open fun f() = 1 }'],
  ['collection-annotation', 'collection_literal', () => '@Arr([1, 2, 3]) class C'],
  ['annotated-statements', 'annotated_expression', () => 'fun target() { @Ann(1) while(false) { break } }'],
  ['name-destructuring', 'destructuring_declaration', () => 'fun target() { (val x, val y) = Pair(1, 2) }'],
  ['when-values', 'when_condition', () => 'fun target(x: Any?) = when(x) { null -> 0; 1 -> 1; else -> 2 }'],
  ['annotated-values', 'annotated_expression', e => `fun target(x: Any?) { val p = @Ann(1) (${e}) }`],
  ['anonymous-functions', 'anonymous_function', e => `val function = fun(x: Any?): Any? = ${e}`],
  ['plain-references', 'callable_reference', () => 'val ref = ::consume\nval bound = "s"::length\nval cls = String::class'],
  ['floating-literals', 'real_literal', () => 'val floats = listOf(1.5, 1e-10, 1.25F, .5, 1.0e+2)'],
  ['unary-operators', 'prefix_expression', () =>
      'fun target(x: Any?) { var n = 1; ++n; --n; n--; n++; val a = !false; val b = -1; val ' +
      'c = +1; val d = x!! }'],
  ['assignments', 'assignment', () => 'fun target() { var n=10; n += 1; n -= 2; n *= 3; n /= 2; n %= 2 }'],
  ['when-guards', 'guard_condition', e => `fun target(x: Any?) = when(x) { is String if x.isNotEmpty() -> ${e}; in listOf(1,2) -> 0; !in listOf(1,2) -> 1; else -> null }`],
  ['is-checks', 'check_expression', () => 'fun target(x: Any?) = (x is String) && (x !is Int)'],
  ['throw-values', 'jump_expression', () => 'fun target(): Nothing = throw IllegalStateException()'],
  ['destructuring-var', 'destructuring_declaration', () => 'fun target() { var (x, y) = Pair(1, 2); x += y }'],
  ['visibility-modifiers', 'visibility_modifier', () =>
      'internal abstract class C { protected abstract fun f(): Any; public final val p = 1; ' +
      'private lateinit var q: Any }\npublic tailrec fun recurse(x:Int):Int = if(x==0)0 ' +
      'else recurse(x-1)'],
  ['parameter-modifiers', 'parameter_modifier', () => 'inline fun <T> target(crossinline f:()->T, noinline g:()->T, vararg xs:T) = f()'],
  ['kdoc', 'multiline_comment', () =>
      '/** Summary [Box.value].\n * @param x text\n * @return value\n * `code` and ' +
      '\\*escaped\\* [link](https://example.com)\n * ```\n * block\n * ```\n */\nfun ' +
      'documented(x: Any?) = x'],
  ['line-comments', 'line_comment', e => `// before\nfun target(x: Any?) = ${e} // after`],
  ['script', 'source_file', () => 'val x = 1\nx + 1', '.kts'],
  ['shebang', 'shebang_line', () => '#!/usr/bin/env kotlin\nval x = 1\nx', '.kts'],
];
const FEATURES = [...legacy.FEATURES, ...EXTRA.map(([name]) => name), ...EXPRESSIONS.map(name => 'production:' + name)];
const legacyRoots = ['function_declaration', 'class_declaration', 'explicit_delegation', 'enum_class_body',
  'inheritance_modifier', 'class_modifier', 'getter', 'context_receiver', 'function_modifier', 'label',
  'annotation', 'type_alias', 'callable_reference', 'string_literal', 'platform_modifier', 'object_declaration',
  'function_modifier', 'for_statement', 'multi_variable_declaration', 'function_type', 'delegation_specifier',
  'simple_identifier', 'call_expression', 'value_argument'];
const roots = [...legacyRoots, ...EXTRA.map(x => x[1]), ...EXPRESSIONS];

function generated(seed, index, depth = 4, coverage = null) {
  const random = generator(`${seed}:grammar:${index}`), choose = list => list[Math.floor(random() * list.length)];
  const goals = name => [...descendants(name)].filter(x => named.has(x));
  let featureIndex = index % FEATURES.length;
  if (coverage && index >= FEATURES.length * CONTEXTS.length) {
    const weights = roots.map(name => coverage.weight(goals(name)));
    let value = random() * weights.reduce((a, b) => a + b, 0);
    featureIndex = weights.findIndex(weight => (value -= weight) < 0);
  }
  let context = CONTEXTS[Math.floor(index / FEATURES.length) % CONTEXTS.length];
  if (coverage && index >= FEATURES.length * CONTEXTS.length) {
    const weights = CONTEXTS.map(c => coverage.weight([], [c[1] + ' > ' + roots[featureIndex]]));
    let value = random() * weights.reduce((a, b) => a + b, 0);
    context = CONTEXTS[weights.findIndex(weight => (value -= weight) < 0)];
  }
  let emit;
  const atom = () => choose(['x', '1', '1.5', '1L', '0x7fu', '0b1L', 'true', 'false', 'null', '"text"', "'\\n'"]);
  const expression = n => n <= 0 ? atom() : emit(choose(EXPRESSIONS), n);
  const type = n => n <= 0 ? choose(['Any', 'Int', 'String', 'Box<out Any?>']) :
    choose([() => `List<${type(n-1)}>`, () => `${type(0)}?`, () => `((Int) -> ${type(n-1)})`, () => '((Int) -> Any)'])();
  emit = renderer(random, {
    _expression: n => { const e = expression(n-1); return random() < 0.5 ? `(${e})` : e; }, _type: type, _type_reference: () => type(0), user_type: () => type(0),
    simple_identifier: 'x', type_identifier: 'Any', parameter: 'x: Any?',
    annotation: '@Ann(1)', type_modifiers: '@Ann(1)', parameter_modifiers: '@Ann(1)', label: 'lab@',
    _callable_reference_name: 'String', _callable_reference_nullable: 'String?',
    control_structure_body: n => `{ ${expression(Math.max(0, n))} }`,
    when_expression: n => `when(x) { is String if x != null -> ${expression(n-1)}; else -> null }`,
    if_expression: n => `if (x != null) ${expression(n-1)} else ${expression(n-1)}`,
    try_expression: n => `try { ${expression(n-1)} } catch(e: Exception) { null } finally { Unit }`,
    anonymous_function: n => `fun(x: Any?): Any? = ${expression(n-1)}`,
    lambda_literal: n => `{ x: Any? -> ${expression(n-1)} }`,
    object_literal: n => `object { fun f(x: Any?) = ${expression(n-1)} }`,
    string_literal: n => `"value=\${${expression(n-1)}}"`,
    call_expression: n => `consume ${emit('value_arguments', n)}`,
    indexing_expression: n => `listOf ${emit('value_arguments', n)} [0]`,
    navigation_expression: n => `(${expression(n-1)})?.toString()`,
    receiver_type: 'String', function_type_parameters: '(Int)',
    comparison_expression: n => `(${expression(n-1)}) ${choose(['<', '>', '<=', '>='])} (${expression(n-1)})`,
    check_expression: n => `(${expression(n-1)}) ${choose(['is', '!is'])} ${type(0)}`,
    as_expression: n => `(${expression(n-1)}) ${choose(['as', 'as?'])} ${type(0)}`,
    value_argument: n => choose([() => `(${expression(n-1)})`, () => `x = (${expression(n-1)})`,
      () => `*arrayOf(${expression(n-1)})`])(),
  });
  let result;
  if (featureIndex < legacy.FEATURES.length) {
    result = legacy.generated(seed, featureIndex, depth, { expression, type });
  } else {
    const extra = featureIndex - legacy.FEATURES.length, selected = EXTRA[extra];
    const e = selected?.[2].length ? expression(Math.min(depth, 3)) : '';
    const body = selected ? selected[2](e) : context[2](emit(EXPRESSIONS[extra-EXTRA.length], depth));
    const extension = selected?.[3] || '.kt';
    const header = extension === '.kts' || body.startsWith('package ') || body.startsWith('@file:') ? '' :
      'annotation class Ann(val n: Int = 0)\nannotation class Arr(val xs: IntArray)\nclass Box<T>(val value: T)\n';
    result = { text: header + body + '\n', extension };
  }
  const root = roots[featureIndex], intendedTypes = goals(root);
  return { ...result, origin: { kind: 'generated', seed, index, feature: FEATURES[featureIndex], depth,
    production: root, context: context[0], nativeTypes: intendedTypes,
    nativePairs: EXPRESSIONS.includes(root) ? [context[1] + ' > ' + root] : [] } };
}

module.exports = { FEATURES, generated, mutated: legacy.mutated };
