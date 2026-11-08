'use strict';

const { generator, mutantsOf } = require('./mutate');

const FEATURES = [
  'generics', 'constructors', 'delegation', 'enum', 'sealed', 'value-class',
  'accessors', 'context', 'suspend', 'labels', 'annotations', 'typealiases',
  'references', 'strings', 'expect-actual', 'objects', 'operators', 'loops',
  'destructuring', 'function-types', 'inheritance', 'backticks', 'contracts', 'arguments',
];

function generated(seed, index, depth = 4, slots = {}) {
  const t = slots.type(Math.min(depth, 2)), e = slots.expression(depth);
  const declarations = [
    `inline fun <reified T : Any> Box<T>.nested(x: Any?): Any? where T : Comparable<T> = ${e}`,
    `class C<T> private constructor(val value: T) { constructor(v: T, tag: String) : this(v) { initCall() }; init { Unit }; companion object { const val n = 1 }; inner class Inner { fun f(x: Any?) = ${e} } }`,
    `interface I { fun f(): Any? }; class D(val delegate: I) : I by delegate { val p by lazy { 1 } }`,
    `enum class E { A, B; fun f(x: Any?) = ${e} }`,
    `sealed interface S; data class P<T>(val first: T, val second: T) : S`,
    '@JvmInline value class V(val value: Int)',
    `class C { var p: ${t} = TODO()\nget() = field\nset(value) { field = value }\nval q get() = 1 }`,
    `context(ctx: Any) fun contextual(x: Any?): Any? = ${e}`,
    `suspend fun suspended(x: Any?): Any? = ${e}`,
    `fun labels(x: Any?) { outer@ for (i in 0..<10) { while (true) { if (i == 1) continue@outer; break } }; val y = ${e} }`,
    `@Ann(1) class C<@Ann T> { @get:Ann(2) val p: @Ann ${t} = TODO() }`,
    `typealias Alias<T> = Map<String, List<T?>>; fun typed(x: Any?): ${t} = TODO()`,
    'val reference = Array<*>? ::contentToString; val bound = Box<Int>::value',
    'fun strings(x: Any?) = listOf("escaped\\n\\t", "nested=${run { \"inner=$x\" }}", """raw\n\\$""", $$""" literal $x and $${x} """)',
    'expect class Expected { fun f(): Int }; actual class Actual { actual fun f(): Int = 1 }; external fun nativeCall(x: Int): Int',
    `object O { val p = object { fun f(x: Any?) = ${e} } }`,
    `operator fun Box<Int>.plus(other: Box<Int>) = this; infix fun Int.combine(other: Int) = this + other`,
    `fun loops(x: Any?) { var n = 0; do { n++ } while (n < 2); for ((i, v) in listOf(1).withIndex()) { ${e} } }`,
    `fun destructured(x: Any?) { val (a, b) = Pair(1, 2); val f = { (c, d): Pair<Int, Int> -> c + d }; ${e} }`,
    `val function: suspend String.(Int) -> List<Any?> = { n -> listOf(this, n) }`,
    'open class B { open fun f() = 1 }; class C : B() { override fun f() = super.f(); companion object { fun make() = C() } }',
    'fun `strange name`(`when`: Int): Int = `when`; val 名 = `strange name`(0x7fu)',
    'inline fun <T> contractCall(block: () -> T): T { contract { callsInPlace(block, InvocationKind.EXACTLY_ONCE) }; return block() }',
    'fun args(vararg xs: Int, suffix: String = "x") = xs; val p = args(1, 2, *intArrayOf(3), suffix = "named")',

  ];
  const feature = FEATURES[index % FEATURES.length];
  let text = 'annotation class Ann(val n: Int = 0)\nclass Box<T>(val value: T)\n' +
    declarations[index % declarations.length] + `\nfun fuzz${index}(x: Any?): Any? { return (${e}) }\n`;
  // Deliberate trivia combinations preserve token boundaries. The PSI validity
  // filter remains authoritative for every generated/mutated input.
  if (index % 3 === 0) text = text.replace(/\n/g, '\n/* outer /* nested */ end */\n');
  return { text, extension: '.kt', origin: { kind: 'generated', seed, index, feature, depth } };
}

function mutated(input, seed, index) {
  const choices = mutantsOf(input.text, { perFile: 1, seed, rel: String(index) });
  if (!choices.length) return { ...input, origin: { ...input.origin, kind: 'mutation-none' } };
  const random = generator(`${seed}:mutant:${index}`);
  const picked = choices[Math.floor(random() * choices.length)];
  return {
    ...input, text: picked.text,
    origin: { ...input.origin, kind: 'mutation', operator: picked.dir, seed, index },
  };
}

module.exports = { FEATURES, generated, mutated };
