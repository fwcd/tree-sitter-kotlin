/*
 * MIT License
 *
 * Copyright (c) 2019 fwcd
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// tree-sitter 0.24.7 omits CJK/Hangul range interiors and many astral
// letters from \p{L}. Supplement it with the missing Unicode 13 letter ranges
// (the Unicode version used by the Java 17 PSI oracle), so complete Unicode
// identifiers cannot be split into an ASCII keyword and an unexpected suffix.
const UNICODE_LETTER_SUPPLEMENT =
  "\\u{3401}-\\u{4dbe}\\u{4e01}-\\u{9ffc}\\u{ac01}-\\u{d7a2}\\u{10920}-\\u{10939}\\u{10980}-\\u{109b7}\\u{109be}-\\u{109bf}" +
  "\\u{10a00}\\u{10a10}-\\u{10a13}\\u{10a15}-\\u{10a17}\\u{10a19}-\\u{10a35}\\u{10a60}-\\u{10a7c}\\u{10a80}-\\u{10a9c}" +
  "\\u{10ac0}-\\u{10ac7}\\u{10ac9}-\\u{10ae4}\\u{10b00}-\\u{10b35}\\u{10b40}-\\u{10b55}\\u{10b60}-\\u{10b72}\\u{10b80}-\\u{10b91}" +
  "\\u{10c00}-\\u{10c48}\\u{10c80}-\\u{10cb2}\\u{10cc0}-\\u{10cf2}\\u{10d00}-\\u{10d23}\\u{10e80}-\\u{10ea9}\\u{10eb0}-\\u{10eb1}" +
  "\\u{10f00}-\\u{10f1c}\\u{10f27}\\u{10f30}-\\u{10f45}\\u{10fb0}-\\u{10fc4}\\u{10fe0}-\\u{10ff6}\\u{11003}-\\u{11037}" +
  "\\u{11083}-\\u{110af}\\u{110d0}-\\u{110e8}\\u{11103}-\\u{11126}\\u{11144}\\u{11147}\\u{11150}-\\u{11172}" +
  "\\u{11176}\\u{11183}-\\u{111b2}\\u{111c1}-\\u{111c4}\\u{111da}\\u{111dc}\\u{11200}-\\u{11211}" +
  "\\u{11213}-\\u{1122b}\\u{11280}-\\u{11286}\\u{11288}\\u{1128a}-\\u{1128d}\\u{1128f}-\\u{1129d}\\u{1129f}-\\u{112a8}" +
  "\\u{112b0}-\\u{112de}\\u{11305}-\\u{1130c}\\u{1130f}-\\u{11310}\\u{11313}-\\u{11328}\\u{1132a}-\\u{11330}\\u{11332}-\\u{11333}" +
  "\\u{11335}-\\u{11339}\\u{1133d}\\u{11350}\\u{1135d}-\\u{11361}\\u{11400}-\\u{11434}\\u{11447}-\\u{1144a}" +
  "\\u{1145f}-\\u{11461}\\u{11480}-\\u{114af}\\u{114c4}-\\u{114c5}\\u{114c7}\\u{11580}-\\u{115ae}\\u{115d8}-\\u{115db}" +
  "\\u{11600}-\\u{1162f}\\u{11644}\\u{11680}-\\u{116aa}\\u{116b8}\\u{11700}-\\u{1171a}\\u{11800}-\\u{1182b}" +
  "\\u{118a0}-\\u{118df}\\u{118ff}-\\u{11906}\\u{11909}\\u{1190c}-\\u{11913}\\u{11915}-\\u{11916}\\u{11918}-\\u{1192f}" +
  "\\u{1193f}\\u{11941}\\u{119a0}-\\u{119a7}\\u{119aa}-\\u{119d0}\\u{119e1}\\u{119e3}" +
  "\\u{11a00}\\u{11a0b}-\\u{11a32}\\u{11a3a}\\u{11a50}\\u{11a5c}-\\u{11a89}\\u{11a9d}" +
  "\\u{11ac0}-\\u{11af8}\\u{11c00}-\\u{11c08}\\u{11c0a}-\\u{11c2e}\\u{11c40}\\u{11c72}-\\u{11c8f}\\u{11d00}-\\u{11d06}" +
  "\\u{11d08}-\\u{11d09}\\u{11d0b}-\\u{11d30}\\u{11d46}\\u{11d60}-\\u{11d65}\\u{11d67}-\\u{11d68}\\u{11d6a}-\\u{11d89}" +
  "\\u{11d98}\\u{11ee0}-\\u{11ef2}\\u{11fb0}\\u{12000}-\\u{12399}\\u{12480}-\\u{12543}\\u{13000}-\\u{1342e}" +
  "\\u{14400}-\\u{14646}\\u{16800}-\\u{16a38}\\u{16a40}-\\u{16a5e}\\u{16ad0}-\\u{16aed}\\u{16b00}-\\u{16b2f}\\u{16b40}-\\u{16b43}" +
  "\\u{16b63}-\\u{16b77}\\u{16b7d}-\\u{16b8f}\\u{16e40}-\\u{16e7f}\\u{16f00}-\\u{16f4a}\\u{16f50}\\u{16f93}-\\u{16f9f}" +
  "\\u{16fe0}-\\u{16fe1}\\u{16fe3}\\u{17000}-\\u{187f7}\\u{18800}-\\u{18cd5}\\u{18d00}-\\u{18d08}\\u{1b000}-\\u{1b11e}" +
  "\\u{1b150}-\\u{1b152}\\u{1b164}-\\u{1b167}\\u{1b170}-\\u{1b2fb}\\u{1bc00}-\\u{1bc6a}\\u{1bc70}-\\u{1bc7c}\\u{1bc80}-\\u{1bc88}" +
  "\\u{1bc90}-\\u{1bc99}\\u{1d400}-\\u{1d454}\\u{1d456}-\\u{1d49c}\\u{1d49e}-\\u{1d49f}\\u{1d4a2}\\u{1d4a5}-\\u{1d4a6}" +
  "\\u{1d4a9}-\\u{1d4ac}\\u{1d4ae}-\\u{1d4b9}\\u{1d4bb}\\u{1d4bd}-\\u{1d4c3}\\u{1d4c5}-\\u{1d505}\\u{1d507}-\\u{1d50a}" +
  "\\u{1d50d}-\\u{1d514}\\u{1d516}-\\u{1d51c}\\u{1d51e}-\\u{1d539}\\u{1d53b}-\\u{1d53e}\\u{1d540}-\\u{1d544}\\u{1d546}" +
  "\\u{1d54a}-\\u{1d550}\\u{1d552}-\\u{1d6a5}\\u{1d6a8}-\\u{1d6c0}\\u{1d6c2}-\\u{1d6da}\\u{1d6dc}-\\u{1d6fa}\\u{1d6fc}-\\u{1d714}" +
  "\\u{1d716}-\\u{1d734}\\u{1d736}-\\u{1d74e}\\u{1d750}-\\u{1d76e}\\u{1d770}-\\u{1d788}\\u{1d78a}-\\u{1d7a8}\\u{1d7aa}-\\u{1d7c2}" +
  "\\u{1d7c4}-\\u{1d7cb}\\u{1e100}-\\u{1e12c}\\u{1e137}-\\u{1e13d}\\u{1e14e}\\u{1e2c0}-\\u{1e2eb}\\u{1e800}-\\u{1e8c4}" +
  "\\u{1e900}-\\u{1e943}\\u{1e94b}\\u{1ee00}-\\u{1ee03}\\u{1ee05}-\\u{1ee1f}\\u{1ee21}-\\u{1ee22}\\u{1ee24}" +
  "\\u{1ee27}\\u{1ee29}-\\u{1ee32}\\u{1ee34}-\\u{1ee37}\\u{1ee39}\\u{1ee3b}\\u{1ee42}" +
  "\\u{1ee47}\\u{1ee49}\\u{1ee4b}\\u{1ee4d}-\\u{1ee4f}\\u{1ee51}-\\u{1ee52}\\u{1ee54}" +
  "\\u{1ee57}\\u{1ee59}\\u{1ee5b}\\u{1ee5d}\\u{1ee5f}\\u{1ee61}-\\u{1ee62}" +
  "\\u{1ee64}\\u{1ee67}-\\u{1ee6a}\\u{1ee6c}-\\u{1ee72}\\u{1ee74}-\\u{1ee77}\\u{1ee79}-\\u{1ee7c}\\u{1ee7e}" +
  "\\u{1ee80}-\\u{1ee89}\\u{1ee8b}-\\u{1ee9b}\\u{1eea1}-\\u{1eea3}\\u{1eea5}-\\u{1eea9}\\u{1eeab}-\\u{1eebb}\\u{20000}-\\u{2a6dd}" +
  "\\u{2a700}-\\u{2b734}\\u{2b740}-\\u{2b81d}\\u{2b820}-\\u{2cea1}\\u{2ceb0}-\\u{2ebe0}\\u{2f800}-\\u{2fa1d}\\u{30000}-\\u{3134a}";

// Using an adapted version of https://kotlinlang.org/docs/reference/grammar.html

const PREC = {
  POSTFIX: 16,
  PREFIX: 15,
  TYPE_RHS: 14,
  AS: 13,
  MULTIPLICATIVE: 12,
  ADDITIVE: 11,
  RANGE: 10,
  INFIX: 9,
  ELVIS: 8,
  CHECK: 7,
  COMPARISON: 6,
  EQUALITY: 5,
  CONJUNCTION: 4,
  DISJUNCTION: 3,
  VAR_DECL: 3,
  SPREAD: 2,
  SIMPLE_USER_TYPE: 2,
  MODIFIERS: 1,
  ASSIGNMENT: 1,
  BLOCK: 1,
  ARGUMENTS: 1,
  LAMBDA_LITERAL: 0,
  RETURN_OR_THROW: 0,
  COMMENT: 0
};
// Digit runs as the Kotlin lexer reads them, not as the spec's valid literals.
// Kotlin lexes a numeric literal greedily and leaves the rest to semantic
// diagnostics, so `1_`, `0x`, `0b2` and `0.0E` are each one literal token with
// no parse error; the compiler then rejects them. This grammar follows the
// lexer, so these shapes must tokenise rather than break the surrounding file.
// Underscores may trail, radix digits may be absent, and a binary literal
// accepts any decimal digit.
const DEC_DIGITS = token(/[0-9][0-9_]*/);
const HEX_DIGITS = token(/[0-9a-fA-F_]*/);
const BIN_DIGITS = token(/[0-9_]*/);
// The exponent's digits are optional too: `0.0E`, `5E_` and `.0e+F` are all
// single FLOAT tokens to the Kotlin lexer.
const REAL_EXPONENT = token(seq(/[eE]/, optional(/[+-]/), /[0-9_]*/));

// The operator forms of an expression over the operand `e`. The full grammar takes `$._expression`; the
// delegate after `by` takes `$._expression_no_trailing_lambda`, so that no operand of it takes a
// trailing lambda.
const UNARY_FORMS = ($, e) => ({
  postfix_expression: prec.left(PREC.POSTFIX, seq(e, $._postfix_unary_operator)),
  indexing_expression: prec.left(PREC.POSTFIX, seq(e, $.indexing_suffix)),
  navigation_expression: prec.left(PREC.POSTFIX, seq(e, $.navigation_suffix)),
  prefix_expression: choice(
    prec.right(PREC.PREFIX, seq($._prefix_unary_operator, e)),
    prec.right(seq(choice($.annotation, $.label), e)),
  ),
  as_expression: prec.left(PREC.AS, seq(e, $._as_operator, $._type)),
  spread_expression: prec.left(PREC.SPREAD, seq("*", e)),
});

const BINARY_FORMS = ($, e, infixName = $.simple_identifier) => ({
  multiplicative_expression: prec.left(PREC.MULTIPLICATIVE, seq(e, $._multiplicative_operator, e)),
  additive_expression: prec.left(PREC.ADDITIVE, seq(e, $._additive_operator, e)),
  range_expression: prec.left(PREC.RANGE, seq(e, choice("..", "..<"), e)),
  infix_expression: prec.left(PREC.INFIX, seq(e, infixName, e)),
  elvis_expression: prec.left(PREC.ELVIS, seq(e, "?:", e)),
  check_expression: prec.left(PREC.CHECK, seq(e, choice(
    seq(optional("!"), $._in_operator, e),
    seq(optional("!"), $._is_operator, $._type)))),
  comparison_expression: prec.left(PREC.COMPARISON, seq(e, $._comparison_operator, e)),
  equality_expression: prec.left(PREC.EQUALITY, seq(e, $._equality_operator, e)),
  conjunction_expression: prec.left(PREC.CONJUNCTION, seq(e, "&&", e)),
  disjunction_expression: prec.left(PREC.DISJUNCTION, seq(e, "||", e)),
});

// Kotlin's hard keywords, `typeof` included: never an identifier or a label unless escaped.
const HARD_KEYWORDS = [
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface',
  'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias',
  'typeof', 'val', 'var', 'when', 'while',
];

// Soft keywords and modifiers that are identifiers wherever no rule takes them as keywords.
const SOFT_KEYWORD_IDENTIFIERS = [
  "expect",
  "data",
  "inner",
  "value",
  "actual",
  "set",
  "get",
  "override",
  "suspend",
  // Batch 1: covered by existing conflict rules (class_modifier, member_modifier, function_modifier)
  "annotation",
  "sealed",
  "lateinit",
  "tailrec",
  "operator",
  "infix",
  "inline",
  "external",
  // Batch 2: visibility modifiers
  "public",
  "private",
  "internal",
  "protected",
  // Batch 3: inheritance modifiers
  "abstract",
  "final",
  "open",
  // Batch 4: property, parameter, reification modifiers
  "const",
  "vararg",
  "noinline",
  "crossinline",
  "reified",
  // Batch 5: annotation use-site targets (no conflict rules needed — disambiguated by ":")
  "field",
  "property",
  "receiver",
  "param",
  "setparam",
  "delegate",
  // Batch 6: structural keywords used as identifiers
  "companion",
  "constructor",
  "context",
  "init",
  "dynamic",
  "where",
  "catch",
  "finally",
  // Batch 7: enum
  "enum",
  // The variance modifier `out` (`in` is a hard keyword). Keyword extraction lexes it as
  // `_alpha_identifier` only in states that expect no variance, so `val out = 1` needs no
  // entry; but after a `<`, where type arguments may start, the keyword wins and
  // `i < out.size` failed. Kotlin parses the type arguments speculatively and keeps them only
  // when a `>` closes them (tryParseTypeArgumentList); with `out` here both readings fork.
  // See `type_parameter_modifiers`, which bounds the variance slot of a declaration.
  "out",
];

const UNARY_NAMES = [
  'postfix_expression', 'indexing_expression', 'navigation_expression', 'prefix_expression', 'as_expression',
  'spread_expression',
];
const BINARY_NAMES = [
  'multiplicative_expression', 'additive_expression', 'range_expression', 'infix_expression', 'elvis_expression',
  'check_expression', 'comparison_expression', 'equality_expression', 'conjunction_expression',
  'disjunction_expression',
];

// `_<name>_no_trailing_lambda` for each form, the operands restricted to `$._expression_no_trailing_lambda`.
function noTrailingLambdaForms(forms, names) {
  return Object.fromEntries(names.map(name => [
    `_${name}_no_trailing_lambda`,
    $ => forms($, $._expression_no_trailing_lambda, alias($._delegate_infix_name, $.simple_identifier))[name],
  ]));
}

module.exports = grammar({
  name: "kotlin",

  conflicts: $ => [
    // See `_type_reference`: bare `dynamic` versus a user type named `dynamic`.
    [$._dynamic_type, $.simple_identifier],

    // Ambiguous when used in an explicit delegation expression,
    // since the '{' could either be interpreted as the class body
    // or as the anonymous function body. Consider the following sequence:

    // Member access operator '::' conflicts with callable reference. The name
    // rule subsumes `callable_reference` itself, so only this entry is needed.
    [$._primary_expression, $._callable_reference_name],

    // `context` is a soft keyword: `context(...)` may be a context-receiver
    // declaration prefix or an ordinary call whose callee is named `context`.
    // GLR explores both and keeps whichever yields a valid parse.
    [$.context_receiver, $.simple_identifier],
    [$._type_context_receiver, $.simple_identifier],

    // `l@` may begin a labelled expression or, now, a labelled declaration;
    // which it is only becomes clear at the token after the label.
    [$.prefix_expression],

    // `( name` at statement start: a destructuring target or a parenthesized
    // expression. Nothing tells them apart until after the ')', so carry both.
    [$._name_based_destructuring_entry_expr, $._primary_expression],
    [$._positional_destructuring_entry_expr, $._primary_expression],
    [$._positional_destructuring_entry_expr, $._positional_destructuring_first_entry],
    [$._positional_destructuring_entry_expr, $.prefix_expression, $._positional_destructuring_first_entry],
    // `{ (val a) ...` or `{ [val a] ...`: a lambda's destructured parameter or a destructuring
    // statement that must start with `val`/`var`; the `->` or the `=` decides.
    [$._name_based_destructuring_entry_expr, $._name_based_destructuring_first_entry],
    // An annotated destructuring entry against an annotated expression or an annotated type:
    // `[@A val x] = y` against `[@A x]`, `(@A x, y) ->` against `(@A x)`.
    [$._name_based_destructuring_entry_expr, $.prefix_expression, $._name_based_destructuring_first_entry],
    [$._name_based_destructuring_entry, $._type_modifier],
    [$.prefix_expression, $._name_based_destructuring_first_entry],
    [$.prefix_expression, $._positional_destructuring_first_entry],

    // @Type(... — `(` after an annotation name is usually constructor args, but
    // in a type `@A (Int) -> Unit` annotates a function type. Kept as a GLR
    // conflict below, with prec.dynamic on _annotation_constructor_invocation
    // preferring constructor args when both readings parse.

    // "expect" as a plaform modifier conflicts with expect as an identifier
    [$.platform_modifier, $.simple_identifier],
    // "data", "inner" as class modifier or id
    [$.class_modifier, $.simple_identifier],
    // "override" as member modifier conflicts with override as an identifier
    [$.member_modifier, $.simple_identifier],
    // visibility modifiers as identifiers
    [$.visibility_modifier, $.simple_identifier],
    // inheritance modifiers as identifiers
    [$.inheritance_modifier, $.simple_identifier],
    // property modifier as identifier
    [$.property_modifier, $.simple_identifier],
    // parameter modifiers as identifiers
    // `@file:` at the head of a file is a file_annotation; after another
    // annotation it is an ordinary use-site target on the declaration. The two
    // readings are identical until the file's shape decides between them.
    [$.file_annotation, $.use_site_target],
    // Before `package` a targeted annotation is a file annotation; elsewhere
    // the same `@target:` prefix belongs to a declaration annotation.
    [$.use_site_target, $.non_file_annotation_target],
    // A modifier before `package` may belong to the package directive's own
    // modifier list or to a declaration that follows; `@` after it is the
    // first token that could tell them apart, and it does not.
    [$.package_modifiers, $.modifiers],
    [$.parameter_modifier, $.simple_identifier],
    [$.modifiers],
    [$.parameter_modifiers],
    // `out` is a variance modifier or an identifier: `List<out T>` against `i < out.size`
    [$.type_projection_modifiers],
    [$.type_parameter_modifiers],

    // "<x>.<y> = z assignment conflicts with <x>.<y>() function call"
    [$._postfix_unary_expression, $._expression],
    [$._postfix_unary_expression_no_trailing_lambda, $._expression_no_trailing_lambda],

    // ambiguity between generics and comparison operations (foo < b > c)
    // _generic_call_expression is the prec.dynamic(1) variant with required type_arguments
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.range_expression, $.comparison_expression],
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.elvis_expression, $.comparison_expression],
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.check_expression, $.comparison_expression],
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.additive_expression, $.comparison_expression],
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.infix_expression, $.comparison_expression],
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.multiplicative_expression, $.comparison_expression],
    [$.type_arguments, $._comparison_operator],

    // ambiguity between prefix expressions and annotations before functions
    [$._statement, $._expression_statement, $.prefix_expression],
    [$._expression_statement, $.prefix_expression],
    // _statement_annotation vs annotation (in prefix_expression and modifiers):
    // both parse @Identifier but route through different rules.
    [$._statement_annotation, $.annotation],
    [$.prefix_expression, $.value_argument],
    // ambiguity between prefix unary operators and other expression types
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.prefix_expression, $.comparison_expression],

    // ambiguity between multiple user types and class property/function declarations
    [$.user_type],
    //[$.user_type, $.function_type],

    // ambiguity caused by 'suspend'
    [$.function_modifier, $.simple_identifier],
    // `suspend fun` at statement start: a modifier of a declaration or of a function without a name.
    [$._suspend_anonymous_function, $.function_modifier],
    [$._type_modifier, $.simple_identifier],
    [$.delegation_specifier, $._type_modifier, $.simple_identifier],
    // `fun T.` at statement start: the receiver of a declaration or of an anonymous function.
    [$._anonymous_receiver_type, $.receiver_type],
    [$._anonymous_receiver_type, $.nullable_type],


    // ambiguity between simple identifier 'set/get' with actual setter/getter functions.
    [$.setter, $.simple_identifier],
    [$.getter, $.simple_identifier],

    // ambiguity between parameter modifiers in anonymous functions
    [$.parameter_modifiers, $._type_modifier],

    // ambiguity between use of suspend in type and delegation specifiers
    [$.delegation_specifier, $._type_modifier],

    // ambiguity between type modifiers before an @
    [$.type_modifiers],
    // `@A (` : annotation arguments, or (in a type) `@A` followed by a function type
    [$._annotation_constructor_invocation, $._unescaped_annotation],
    // `: @A Base()` : the annotation competes with a type modifier on the
    // supertype. Same resolution as above — let GLR carry both readings.
    [$._annotated_delegation_specifier, $._type_modifier],
    // ambiguity between associating type modifiers
    [$.not_nullable_type],

    [$.receiver_type],
    [$.receiver_type, $._type],

    // parenthesized function type?
    [$.delegation_specifier, $._type],

    // The delegate after `by` (`_expression_no_trailing_lambda`) has its own operator forms, so
    // it no longer conflicts with `_expression`; only the ambiguities of `_expression` itself
    // recur in it. A callable reference (Foo::bar) starts with a name the delegate can be.
    [$._primary_expression_no_trailing_lambda, $._callable_reference_name],
    // The generics-versus-comparison ambiguities above, over the delegate's operands.
    // `_generic_call_expression_no_trailing_lambda` is no inlined rule: an alias of an inlined
    // rule names its children, and `by f<T>(a)` became two sibling call expressions.
    ...['range', 'elvis', 'check', 'additive', 'infix', 'multiplicative', 'prefix'].map(op => [
      $.call_expression_no_trailing_lambda,
      $._generic_call_expression_no_trailing_lambda,
      $._navigation_expression_no_trailing_lambda,
      $[`_${op}_expression_no_trailing_lambda`],
      $._comparison_expression_no_trailing_lambda,
    ]),

    // Inside the callable-reference receiver the parser must choose a
    // production at `Name <` before it can see whether any `?` follows.


    // ambiguity between call_suffix and _generic_call_suffix (both can match type_arguments + args)
    [$.call_suffix, $._generic_call_suffix],
    [$._call_suffix_no_trailing_lambda, $._generic_call_suffix_no_trailing_lambda],
  ],

  externals: $ => [
    $._automatic_semicolon,
    $.multiline_comment,
    $._string_start,
    $._string_end,
    $.string_content,
    $._primary_constructor_keyword,
    $._import_dot,
    $._interpolation_expression_start,
    $._interpolation_identifier_start,
    $._by_delegation_hint,
    $._primary_constructor_hint,
    $._callable_reference_quest,
    $._comment_continuation_hint,
    $._try_clause_hint,
    $._backing_field_hint,
    $._expression_end_hint,
    $._delegate_start_hint,
    $._delegate_end_hint,
    $._quoted_identifier,
    $._call_lambda_hint,
    // Never produced: valid right after the `}` of a class body or a block, where Kotlin starts the
    // next declaration without a separator (`}enum class E`, see BLOCK_END_HINT in the scanner).
    $._block_end_hint,
    // Never produced: valid after a modifier word of a declaration's modifiers, so that a line break
    // before the declaration keyword inserts no semicolon (see MODIFIER_HINT in the scanner).
    $._modifier_hint,
    // Never produced, and the scanner never looks at it: it only guards `typeof`, see `reserved`.
    $._reserved_word_guard,
    // `` `if`@ ``: a backtick-quoted identifier with `@` right after it, see `label`.
    $._quoted_label,
    // Zero-width, before the `companion` of `companion object`, see companion_object.
    $._companion_object_hint,
    // A `;` after a separator, not right after another `;`, see _semis.
    $._further_semicolon,
    // The characters of a character literal between its escapes, NUL included.
    $._character_content,
    // The name right after `break@`, `return@` and the like, see _label_name.
    $._label_identifier,
    // Never produced: valid where a declaration's contract may start, so that a line break before
    // `contract [` inserts no semicolon (see word_continues_statement in the scanner).
    $._contract_hint,
  ],

  extras: $ => [
    $._comment_continuation_hint,
    $.line_comment,
    $.multiline_comment,
    /\s+/ // Whitespace
  ],

  word: $ => $._alpha_identifier,

  // Kotlin's hard keywords (https://kotlinlang.org/docs/keyword-reference.html#hard-keywords) are never
  // identifiers unless escaped in backticks. Without reserving them, the lexer falls back to an identifier
  // wherever the keyword is not valid, and GLR can prefer such a reading without any ERROR node:
  // `@A sealed interface X<T> { ... }` became an annotated infix call `sealed interface X` with type arguments
  // and a trailing lambda, because the generic call carries a higher dynamic precedence than the declaration.
  // `typeof` is reserved by Kotlin too but no rule uses it, and a reserved word must be a token of the grammar:
  // `source_file` takes it behind `_reserved_word_guard`, which the scanner never produces.
  reserved: {
    global: _ => HARD_KEYWORDS,
  },

  // Hidden rules substituted at their use sites instead of getting a symbol of
  // their own. `ts_parse_table` is a dense LARGE_STATE_COUNT x SYMBOL_COUNT
  // array and over 90% of the compiled parser, so every symbol costs about
  // 16 KB whether or not it is reachable from a given state. None of these
  // appear in a tree, so removing them changes nothing a consumer can see.
  //
  // This list is measured, not derived: inlining is only a win for rules whose
  // definition does not multiply the states of its callers. Each entry below
  // was verified to shrink the parser on its own, and most hidden rules are
  // not here because they grow it -- `_anonymous_function_value_parameters`
  // alone costs +11%. Do not add a rule without measuring it, and note that a
  // rule named in `conflicts` cannot be inlined at all.
  inline: $ => [
    $._additive_operator,
    $._as_operator,
    $._assignment_and_operator,
    $._binary_expression,
    $._break_at,
    $._callable_reference_nullable,
    $._class_member_declaration,
    $._continue_at,
    $._declaration,
    $._declaration_receiver_type,
    $._equality_operator,
    $._function_literal,
    $._in_operator,
    $._interpolation,
    $._is_operator,
    $._lambda_parameter,
    $._literal_constant,
    $._loop_statement,
    $._member_access_operator,
    $._modifier,
    $._multi_annotation,
    $._multiplicative_operator,
    $._postfix_unary_operator,
    $._postfix_unary_suffix,
    $._prefix_unary_operator,
    $._semi,
    $._single_annotation,
    $._super_at,
    $._this_at,
    $._type_parameter_modifier,
    $._type_projection_modifier,
    $._unary_expression,
  ],

  rules: {
    // ====================
    // Syntax grammar
    // ====================

    // ==========
    // General
    // ==========

    // start
    source_file: $ => seq(
      optional(seq($._reserved_word_guard, 'typeof')),
      optional($.shebang_line),
      repeat($.file_annotation),
      optional($.package_header),
      optional($.import_list),
      repeat(seq(choice($._statement, $.getter, $.setter), $._semis))
    ),

    shebang_line: $ => seq("#!", /[^\r\n]*/),

    // Separator optional, not required. `file_annotation` used to end with a
    // mandatory `$._semi`, so a second annotation on the same line left the
    // first without one and the file parsed with a `MISSING _automatic_semicolon`
    // — no visible ERROR node, so only a binding-level check caught it:
    //
    //     @file:JvmMultifileClass @file:JvmName("FlowKt")
    //
    // which is how kotlinx-coroutines-core writes it. Unlike the class-body
    // case in #297 the separator is not needed for disambiguation here: every
    // file annotation starts with `@file:`, and what can follow one — another
    // annotation, `package`, `import`, a statement — is distinguishable from
    // the first token, so the separator can simply be optional.
    //
    // `@file:` is also an ordinary use-site target (see `use_site_target`), so
    // a leading `@file:A` parses both ways. Both readings are complete, so the
    // choice is a dynamic precedence: at the head of a file the file
    // annotation wins, which is what Kotlin's parser does — it only falls back
    // to the declaration's modifier list once another annotation precedes it,
    // and there this rule is not reachable.
    file_annotation: $ => choice(
      prec.dynamic(1, seq(
        "@", "file", ":",
        $._file_annotation_body,
        optional($._semi)
      )),
      // `@field:A package p`. Before the package directive Kotlin's parser
      // puts a targeted annotation in the file annotation list whatever the
      // target is — but only there. The same `@field:A` in front of a
      // declaration belongs to that declaration, which PSI confirms:
      // `@field:A val y = 1` is a PROPERTY with a MODIFIER_LIST, while
      // `@field:A package p` is a FILE_ANNOTATION_LIST. So this reading is
      // given a negative dynamic precedence and survives only where the
      // declaration reading cannot complete, which is exactly the package
      // case. Only `@file:` keeps the bare spelling, so its tree is unchanged.
      prec.dynamic(-1, seq(
        "@",
        alias($.non_file_annotation_target, $.use_site_target),
        $._file_annotation_body,
        optional($._semi)
      ))
    ),

    _file_annotation_body: $ => choice(
      seq("[", repeat1($._unescaped_annotation), "]"),
      $._unescaped_annotation
    ),

    // `public @[A] package p`. Unlike a targeted annotation, which becomes a
    // file annotation, modifiers before `package` are part of the package
    // directive itself: PSI puts them in a MODIFIER_LIST inside
    // PACKAGE_DIRECTIVE. The compiler then reports the wrong target.
    //
    // The list has to begin with a real modifier. An annotation on its own in
    // front of `package` is not a modifier list and not valid Kotlin: PSI
    // reports `Expecting "file:" prefix for file annotations` for both
    // `@A package p` and `@[A] package p`, while `public package p`,
    // `public @A package p` and `public @[A] package p` are all clean. Those
    // two therefore stay errors here.
    package_header: $ => seq(
      optional(alias($.package_modifiers, $.modifiers)),
      "package", $.identifier, $._semi
    ),

    package_modifiers: $ => seq($._modifier, repeat(choice($.annotation, $._modifier))),

    import_list: $ => repeat1($.import_header),

    import_header: $ => seq(
      "import",
      alias($._import_identifier, $.identifier),
      optional(choice(seq($._import_dot, $.wildcard_import), $.import_alias)),
      $._semi
    ),

    wildcard_import: _ => token.immediate("*"),

    import_alias: $ => seq("as", alias($.simple_identifier, $.type_identifier)),

    top_level_object: $ => seq($._declaration, optional($._semi)),

    type_alias: $ => seq(
      optional($.modifiers),
      "typealias",
      alias($.simple_identifier, $.type_identifier),
      optional($.type_parameters),
      "=",
      $._type
    ),

    _declaration: $ => choice(
      $.class_declaration,
      $.object_declaration,
      $.function_declaration,
      $.property_declaration,
      $.destructuring_declaration,
      $.type_alias
    ),

    // ==========
    // Classes
    // ==========

    class_declaration: $ => prec.right(choice(
      seq(
        optional($.modifiers),
        choice("class", seq(optional("fun"), "interface")),
        alias($.simple_identifier, $.type_identifier),
        optional($.type_parameters),
        optional($.primary_constructor),
        optional(seq(":", $._delegation_specifiers)),
        optional($.type_constraints),
        optional($.class_body)
      ),
      seq(
        optional($.modifiers),
        // As after any other modifier word, a line break before `class` ends nothing (`enum` on a
        // line of its own, see _modifier_hint).
        "enum", optional($._modifier_hint), "class",
        alias($.simple_identifier, $.type_identifier),
        optional($.type_parameters),
        optional($.primary_constructor),
        optional(seq(":", $._delegation_specifiers)),
        optional($.type_constraints),
        optional($.enum_class_body)
      )
    )),

    // The `constructor` keyword is optional even when modifiers are present.
    // `class C private ()` is accepted by Kotlin's parser, which builds a
    // PRIMARY_CONSTRUCTOR with a MODIFIER_LIST and no keyword; the compiler
    // then reports MISSING_CONSTRUCTOR_KEYWORD. Previously the modifiers were
    // only reachable together with the keyword, so the whole declaration
    // became an ERROR node.
    primary_constructor: $ => seq(
      optional($._primary_constructor_hint),
      optional($.modifiers),
      optional($._primary_constructor_keyword),
      $._class_parameters
    ),

    // A body may open with a single stray `;`, which kotlinc accepts:
    //
    //     class CancelledParentAttachTest : TestBase() {;
    //
    // as kotlinx-coroutines-reactive writes it. `_class_member_declarations`
    // allows a separator between and after members but not before the first,
    // so the leading one is spelled out here. It is the literal token rather
    // than `$._semi`, deliberately: `_semi` is the ASI external token, and
    // making it valid right after `{` would let the scanner emit one for the
    // newline that opens every ordinary multi-line body. Two leading `;` stay
    // an error, as in PSI.
    // The scanner emits the hint after every `{` to close an open class delegate.
    class_body: $ => seq(
      "{", $._delegate_end_hint, optional(";"), optional($._class_member_declarations), "}",
      optional($._block_end_hint)
    ),

    _class_parameters: $ => seq(
      "(",
      optional(sep1($.class_parameter, ",")),
      optional(","),
      ")"
    ),

    binding_pattern_kind: $ => choice("val", "var"),

    class_parameter: $ => seq(
      optional($.modifiers),
      optional($.binding_pattern_kind),
      $.simple_identifier,
      ":",
      $._type,
      optional(seq("=", $._expression))
    ),

    _delegation_specifiers: $ => prec.left(sep1(
      $._annotated_delegation_specifier,
      ","
    )),

    delegation_specifier: $ => prec.right(choice(
      $.constructor_invocation,
      $.explicit_delegation,
      $.user_type,
      $.function_type,
      // The grammar doesn't explicitly define it, but parenthesized function
      // types seem to work!
      seq('(', $.function_type, ')'),
      seq("suspend", $.function_type),
      // A function type with a context, `class A : context(String) () -> Unit`, as in a type
      // position. Annotations before a supertype stay those of _annotated_delegation_specifier.
      seq(alias($._context_type_modifiers, $.type_modifiers), $.function_type)
    )),

    _context_type_modifiers: $ => repeat1(alias($._type_context_receiver, $.context_receiver)),

    constructor_invocation: $ => seq($.user_type, $.value_arguments),

    // Annotation-scoped variant. `user_type • (` has two readings and we keep
    // both as a GLR conflict instead of deciding in the lexer.
    //
    // Where both readings parse, prec.dynamic(1) picks constructor arguments.
    // That is the reading an annotation with arguments needs, and it is what
    // keeps a parenthesised expression after one from being swallowed:
    //
    //     @Suppress("UNCHECKED_CAST")
    //     (x as String).length      // annotation takes ("UNCHECKED_CAST"),
    //                               // (x as String) stays an expression
    //
    // Where only one reading parses, GLR keeps that one and the preference
    // never comes up — in a type, `@A () -> Unit` only parses with `(` opening
    // a function type, which is also how kotlinc reads it. In statement
    // position `@Anno (x)` has no constructor-args reading that completes, so
    // it lands on a bare annotation followed by `(x)`.
    //
    // Scoped to annotations rather than put on the shared constructor_invocation,
    // so ordinary constructor calls are unaffected.
    _annotation_constructor_invocation: $ => prec.dynamic(1, seq($.user_type, $.value_arguments)),

    _annotated_delegation_specifier: $ => seq(repeat($.annotation), $.delegation_specifier),

    explicit_delegation: $ => seq(
      choice(
        $.user_type,
        $.function_type
      ),
      optional($._by_delegation_hint),
      "by",
      // The scanner emits the hint and then keeps a `{` on the next line for
      // the class body, as Kotlin does.
      $._delegate_start_hint,
      // Use a restricted expression that doesn't allow trailing lambda calls
      // to avoid ambiguity with class_body in object literals.
      // e.g., `object : Interface by delegate { }` - the `{` should be class_body, not a lambda.
      // If a trailing lambda delegate is truly needed, use parentheses:
      // `object : Interface by (factory { config }) { ... }`
      $._expression_no_trailing_lambda
    ),

    // Expression variant that doesn't allow call expressions with trailing lambdas.
    // This is used in explicit_delegation to prevent ambiguity with class_body.
    // Kotlin reads the delegate with trailing lambdas off (`parseCallWithClosure` of the
    // by-clause parser), except inside parentheses, brackets or braces, so no operand takes one
    // either: every operator form has its own copy over this expression, under the same node
    // names. `by a + b { }` ends before the class body, and an infix call keeps its newline rule:
    // `by d()` followed by `companion object` on the next line ends at the newline.
    _expression_no_trailing_lambda: $ => choice(
      ...UNARY_NAMES.map(name => alias($[`_${name}_no_trailing_lambda`], $[name])),
      ...BINARY_NAMES.map(name => alias($[`_${name}_no_trailing_lambda`], $[name])),
      $._primary_expression_no_trailing_lambda
    ),

    ...noTrailingLambdaForms(UNARY_FORMS, UNARY_NAMES),
    ...noTrailingLambdaForms(BINARY_FORMS, BINARY_NAMES),

    _primary_expression_no_trailing_lambda: $ => choice(
      $.parenthesized_expression,
      $.simple_identifier,
      $._literal_constant,
      $.string_literal,
      $.callable_reference,
      alias($.call_expression_no_trailing_lambda, $.call_expression),
      alias($._generic_call_expression_no_trailing_lambda, $.call_expression),
      $._function_literal,
      $.object_literal,
      $.collection_literal,
      $.this_expression,
      $.super_expression,
      alias($._if_expression_no_trailing_lambda, $.if_expression),
      $.when_expression,
      $.try_expression,
      alias($._jump_expression_no_trailing_lambda, $.jump_expression)
    ),

    // The operand of `throw` or `return`, and an unbraced branch of `if`, end before a `{` too:
    // `by throw x { }` and `by if (c) x else y { }` are followed by the class body.
    _jump_expression_no_trailing_lambda: $ => choice(
      prec.right(PREC.RETURN_OR_THROW, seq("throw", $._expression_no_trailing_lambda)),
      prec.right(PREC.RETURN_OR_THROW, seq(choice("return", $._return_at), optional($._expression_no_trailing_lambda))),
      "continue",
      $._continue_at,
      "break",
      $._break_at
    ),

    _if_expression_no_trailing_lambda: $ => prec.right(seq(
      "if",
      "(", field('condition', $._expression), ")",
      choice(
        field('consequence', alias($._control_structure_body_no_trailing_lambda, $.control_structure_body)),
        seq(
          optional(field('consequence', alias($._control_structure_body_no_trailing_lambda, $.control_structure_body))),
          optional(";"),
          "else",
          choice(field('alternative', alias($._control_structure_body_no_trailing_lambda, $.control_structure_body)), ";")
        ),
        ";"
      )
    )),

    // An `if` branch in a delegate is a control structure body like any other (an assignment or a
    // loop too: `by if (c) x = y else z`), whose expression takes no trailing lambda. An
    // assignment's right side follows that; a loop keeps its own body, so a loop as the last branch
    // takes a `{` after it as a trailing lambda of its body, which no real delegate has.
    _control_structure_body_no_trailing_lambda: $ => choice(
      $._block,
      $._expression_no_trailing_lambda,
      alias($._assignment_no_trailing_lambda, $.assignment),
      $._loop_statement
    ),

    _assignment_no_trailing_lambda: $ => assignmentForms(
      $, $._expression_no_trailing_lambda,
      alias($._assignable_no_trailing_lambda, $.directly_assignable_expression),
      alias($._cast_assignable_no_trailing_lambda, $.directly_assignable_expression),
    ),

    _cast_assignable_no_trailing_lambda: $ => prec(1, alias($._as_expression_no_trailing_lambda, $.as_expression)),

    // The left side of such an assignment, in the shape of directly_assignable_expression: a primary
    // without trailing lambdas and its assignable suffixes, a name, or one in parentheses. As
    // there, the precedence sits on the whole and the suffixes are a rule of their own, which
    // stays in conflict with the expression: a precedence on the suffixes themselves would shift
    // the `<` after `x` as a selector's type arguments, so `by if (c) x<T> else y<T>` failed.
    _assignable_no_trailing_lambda: $ => prec(PREC.ASSIGNMENT, choice(
      $._postfix_unary_expression_no_trailing_lambda,
      $.simple_identifier,
      $.parenthesized_expression
    )),

    _postfix_unary_expression_no_trailing_lambda: $ => seq(
      $._primary_expression_no_trailing_lambda, repeat1($._postfix_unary_suffix)
    ),

    // Call expression that only allows value_arguments, not trailing lambdas
    call_expression_no_trailing_lambda: $ => prec.left(PREC.POSTFIX, seq(
      $._expression_no_trailing_lambda,
      alias($._call_suffix_no_trailing_lambda, $.call_suffix)
    )),

    // Generic call (required type_arguments) without trailing lambda
    _generic_call_expression_no_trailing_lambda: $ => prec.left(PREC.POSTFIX, prec.dynamic(1, seq(
      $._expression_no_trailing_lambda,
      alias($._generic_call_suffix_no_trailing_lambda, $.call_suffix)
    ))),

    _call_suffix_no_trailing_lambda: $ => seq(
      optional($.type_arguments),
      $.value_arguments
    ),

    // `by x<T>` takes no arguments at all: Kotlin reads type arguments followed by neither `(`
    // nor an operand as a call of their own, so `by x<T>, J {` and `by x<T>` before a `{` on the
    // next line end at the `>`.
    _generic_call_suffix_no_trailing_lambda: $ => prec.right(seq(
      $.type_arguments,
      optional($.value_arguments)
    )),

    type_parameters: $ => seq("<", sep1($.type_parameter, ","), optional(","), ">"),

    type_parameter: $ => seq(
      optional($.type_parameter_modifiers),
      alias($.simple_identifier, $.type_identifier),
      optional(seq(":", $._type))
    ),

    type_constraints: $ => prec.right(seq("where", sep1($.type_constraint, ","))),

    type_constraint: $ => seq(
      repeat($.annotation),
      alias($.simple_identifier, $.type_identifier),
      ":",
      $._type
    ),

    // ==========
    // Class members
    // ==========

    // Separator strictly between members, optional before the closing brace.
    //
    // This used to be `repeat1(seq(member, $._semi))`, requiring a newline or
    // `;` after the *last* member too, so every single-line body failed to
    // parse: `class C { fun f() {} }`, `class C : Base() { val x = 1 }`,
    // `object O : Base() { fun f() {} }`.
    //
    // Making the separator optional per member — the Kotlin grammar's
    // `(classMemberDeclaration semis?)*` — is too loose for an LR parser: with
    // no separator required at all, `companion object` followed by an
    // identifier is ambiguous between the companion's name and the next
    // member. This is the shape `statements` already uses successfully.
    _class_member_declarations: $ => seq(
      $._class_member_declaration,
      repeat(seq($._semis, $._class_member_declaration)),
      optional($._semis),
    ),

    _class_member_declaration: $ => choice(
      $._declaration,
      // TODO: it would be better to have getter/setter only in
      // property_declaration but it's difficult to get ASI
      // (Automatic Semicolon Insertion) working in the lexer for
      // getter/setter. Indeed, they can also have modifiers in
      // front, which means it's not enough to lookahead for 'get' or 'set' in
      // the lexer, you also need to handle modifier keywords. It is thus
      // simpler to accept them as members of their own, in class bodies and at the top level. A
      // local property has no accessors (KotlinParsing: DeclarationParsingMode.LOCAL), so
      // `if (c) set.add(x)` never reads `set` as one.
      $.getter,
      $.setter,
      // Both accessors on the accessors' own line, `var x = 0\n  get private set`: Kotlin reads a
      // property's accessors with no separator between them, but here they are class members of
      // their own (see the TODO above), and two members on one line need one.
      prec(1, seq($.getter, $.setter)),
      prec(1, seq($.setter, $.getter)),
      $.companion_object,
      $.companion_block,
      $.anonymous_initializer,
      $.secondary_constructor
    ),

    // `class C { private init {} }`. The compiler rejects the modifier with
    // WRONG_MODIFIER_TARGET, but Kotlin's parser reads it: PSI builds a
    // CLASS_INITIALIZER with a MODIFIER_LIST, so the rest of the class body
    // still parses.
    anonymous_initializer: $ => seq(optional($.modifiers), "init", $._block),

    // Kotlin 2.4 companion block (CompanionBlocksAndExtensions): `companion { fun f() {} }` among the
    // members of a class or object, the static members of its class (KotlinParsing.parseCompanionBlock:
    // `companion` first, then `{`).
    companion_block: $ => seq("companion", $.class_body),

    // `companion` is also a member_modifier (companion extensions), so after an annotation
    // `@Ann companion object Key` could read as an object_declaration. The scanner emits
    // `_companion_object_hint` only where the words `companion object` follow, so this node keeps
    // them; the precedence settles `companion` first, where the hint and the modifier meet.
    companion_object: $ => prec(1, seq(
      optional($.modifiers),
      $._companion_object_hint,
      "companion",
      "object",
      optional(alias($.simple_identifier, $.type_identifier)),
      optional(seq(":", $._delegation_specifiers)),
      optional($.class_body)
    )),

    function_value_parameters: $ => seq(
      "(",
      optional(sep1($._function_value_parameter, ",")),
      optional(","),
      ")"
    ),

    // Kotlin's parser accepts a value parameter with no explicit type, and
    // `val`/`var` on a function parameter; both are reported later as
    // diagnostics (VALUE_PARAMETER_WITHOUT_EXPLICIT_TYPE,
    // VAL_OR_VAR_ON_FUN_PARAMETER) rather than as syntax errors. PSI still
    // builds an ordinary VALUE_PARAMETER, so the grammar does too.
    _function_value_parameter: $ => seq(
      optional($.parameter_modifiers),
      optional($.binding_pattern_kind),
      alias($._optionally_typed_parameter, $.parameter),
      optional(seq("=", $._expression))
    ),

    // The receiver of an anonymous function: see anonymousFunction.
    _anonymous_receiver_type: $ => seq(
      optional($.type_modifiers),
      choice(
        alias(seq($._type_reference, repeat1($.quest)), $.nullable_type),
        $._type_reference,
      )
    ),

    receiver_type: $ => seq(
      optional($.type_modifiers),
      choice (
        $.parenthesized_type,
        $.nullable_type,
        $._type_reference,
      )
    ),

    // The receiver of a `fun`/`val` declaration also admits an unparenthesized
    // function type, but only behind a modifier list: `fun @receiver:A () ->
    // Unit?.f() {}`. The modifiers are what commit the Kotlin parser to
    // reading a type — without them `fun () -> Unit.f() {}` is not a receiver
    // at all, and PSI reports errors for it. Nested function-type receivers
    // (`A.() -> B`) keep the plain `receiver_type`, which is also what PSI
    // accepts there.
    _declaration_receiver_type: $ => choice(
      $.receiver_type,
      alias($.annotated_function_type_receiver, $.receiver_type)
    ),

    annotated_function_type_receiver: $ => seq($.type_modifiers, $.function_type),

    // Context parameters / receivers (Kotlin 1.6.20+ / 2.2): a `context(...)`
    // prefix on a callable declaration. Entries are either context parameters
    // (`name: Type`) or bare receiver types (`Type`). Complexity-neutral, but the
    // enclosing declaration must parse so its body is scored.
    // A receiver of a declaration may carry a label (`context(s@String)`), which
    // KotlinParsing.parseContextReceiver reads as LABEL_QUALIFIER before the type; one of a
    // function type may not (`context(label@String) () -> Unit` is an error for PSI).
    context_receiver: $ => contextReceiver($, true),

    _type_context_receiver: $ => contextReceiver($, false),

    // `public fun Foo.bar() { … }` once had a complete second reading as an infix
    // expression over soft-keyword modifiers (#277). With the hard keywords
    // reserved, `fun`, `class` and `object` are never identifiers, and an
    // object expression always has a body, so no expression spans a
    // declaration and the dynamic precedence of #278/#280 has nothing to decide.
    function_declaration: $ => prec.right(seq( // TODO
      optional($.modifiers),
      "fun",
      optional($.type_parameters),
      optional(seq(field("receiver", $._declaration_receiver_type), optional('.'))),
      $.simple_identifier,
      $.function_value_parameters,
      optional(seq(":", $._type)),
      // Kotlin reads a contract before or after the type constraints (parseFunction).
      optional(choice(
        seq($.contract_effect_list, optional($.type_constraints)),
        seq($.type_constraints, optional($.contract_effect_list))
      )),
      optional($.function_body)
    )),

    // A contract of the declaration syntax (ContractSyntaxV2): `fun f(x: Any?) contract
    // [returns() implies (x != null)] { … }`, also on a property accessor. Each effect is an
    // expression (KotlinExpressionParsing.parseContractEffectList).
    contract_effect_list: $ => seq(
      optional($._contract_hint),
      "contract",
      "[",
      optional(seq(sep1($._expression, ","), optional(","))),
      "]"
    ),

    function_body: $ => choice($._block, seq("=", $._expression)),

    variable_declaration: $ => prec.left(PREC.VAR_DECL, seq(
      // repeat($.annotation), TODO
      $.simple_identifier,
      optional(seq(":", $._type))
    )),

    // Statement-position variant of the entry below.
    //
    // At statement start `(a)` can be a destructuring target — `(a, b) = pair`
    // — or an ordinary parenthesized expression — `(a).b()`. The static
    // precedence used in declaration position resolves that at generate time
    // and deletes the expression reading, so this variant uses a dynamic
    // precedence and a declared conflict instead, leaving both readings to
    // GLR. It is kept separate because declaration position has a *different*
    // competitor — a parenthesized receiver type, as in `val (A).foo` — that
    // the static precedence is needed to beat.
    _name_based_destructuring_entry_expr: $ => prec.dynamic(PREC.VAR_DECL, prec.left(seq(
      repeat($.annotation),
      optional($.binding_pattern_kind),
      $.simple_identifier,
      optional(seq(":", $._type)),
      optional(seq("=", $.simple_identifier))
    ))),

    // Entry in name-based (parenthesized) destructuring — supports optional val/var and renaming.
    // Each entry of a destructuring may carry annotations, as Kotlin's parseMultiDeclarationEntry
    // reads a modifier list first: `val (@A x, @B y) = two`, `for ((@A x, y) in z)`.
    _name_based_destructuring_entry: $ => prec.left(PREC.VAR_DECL, seq(
      repeat($.annotation),
      optional($.binding_pattern_kind),
      $.simple_identifier,
      optional(seq(":", $._type)),
      optional(seq("=", $.simple_identifier))  // renaming: val localName = propertyName
    )),

    // Entry in positional (bracketed) destructuring — supports optional val/var, NO renaming
    // The statement-position variant, as for the name-based one: `{ [it] }` is a body holding a
    // collection literal, `{ [a, b] -> }` a destructured parameter, and only the `->` tells.
    _positional_destructuring_entry_expr: $ => prec.dynamic(PREC.VAR_DECL, prec.left(seq(
      repeat($.annotation),
      optional($.binding_pattern_kind),
      $.simple_identifier,
      optional(seq(":", $._type))
    ))),

    _positional_destructuring_entry: $ => prec.left(PREC.VAR_DECL, seq(
      repeat($.annotation),
      optional($.binding_pattern_kind),
      $.simple_identifier,
      optional(seq(":", $._type))
    )),

    property_declaration: $ => prec.right(seq(
      optional($.modifiers),
      $.binding_pattern_kind,
      optional($.type_parameters),
      optional(seq(field("receiver", $._declaration_receiver_type), optional('.'))),
      choice($.variable_declaration, $.multi_variable_declaration),
      optional($.type_constraints),
      // One optional tail, not two. An initializer (or delegate) and the
      // accessors used to be two independent `optional(...)` positions in a
      // row; this admits exactly the same four combinations -- nothing, an
      // initializer, accessors, or an initializer followed by accessors --
      // from a single decision point.
      //
      // The pair of positions was expensive out of all proportion to what it
      // expressed: merging them removes 596 large parse states and 2,720 KiB
      // of src/parser.c. This rule's tail is a hot spot, for the same reason
      // #323 found: `property_declaration` is reachable from almost
      // everywhere, so every extra decision point here is paid for across the
      // whole table. Keep it to one position.
      //
      // Also note there is no `optional(';')` here: a semicolon between a
      // property and its accessors -- `val x: Int; get() = 42` -- is already
      // consumed by the `_semi` separator that `class_body` and `source_file`
      // apply between members (#323).
      optional(choice(
        seq(
          choice(seq("=", $._expression), $.property_delegate, $.backing_field),
          optional($._property_accessors)
        ),
        $._property_accessors
      ))
    )),

    // `prec.right` so a lone getter does not reduce ambiguously against the
    // getter-then-setter reading; `property_declaration`'s own `prec.right`
    // used to supply that while the pair was written inline.
    _property_accessors: $ => prec.right(choice(
      seq($.getter, optional($.setter)),
      seq($.setter, optional($.getter))
    )),

    // An explicit backing field, `val x: Any field: String = "OK"`. Default
    // Kotlin since 2.4 -- the feature is not pre-release and compiles with no
    // flags. JetBrains emits BACKING_FIELD inside the PROPERTY, holding its own
    // modifiers, type and initializer, which is what this mirrors.
    //
    // Every part after `field` is optional independently: the type may be left
    // to inference (`field = 2`) and the initializer may be deferred to an
    // `init` block (`field: MutableList<Int>`).
    //
    // It is an alternative to the property's initializer rather than a
    // position of its own. A property never has both, and a separate optional
    // position here measured at +95% of compiled parser against this shape --
    // see the comment above on why this tail is a hot spot.
    backing_field: $ => prec.right(seq(
      optional($._backing_field_hint),
      optional($.modifiers),
      "field",
      optional(seq(":", $._type)),
      optional(seq("=", $._expression))
    )),

    property_delegate: $ => seq(optional($._by_delegation_hint), "by", $._expression),

    destructuring_declaration: $ => prec.right(seq(
      optional($.modifiers),
      alias($._destructuring_declaration_target, $.multi_variable_declaration),
      optional($.type_constraints),
      "=",
      $._expression,
      optional(';'),
    )),

    // Accessors on lines of their own are members of their own (see _class_member_declaration).
    // At the top level a script statement competes, `get() = x` as an assignment; the accessor
    // wins through its dynamic precedence.
    getter: $ => prec.dynamic(1, prec.right(seq(
      optional($.modifiers),
      "get",
      optional(seq(
        "(", ")",
        optional(seq(":", $._type)),
        optional($.contract_effect_list),
        $.function_body
      ))
    ))),

    setter: $ => prec.dynamic(1, prec.right(seq(
      optional($.modifiers),
      "set",
      optional(seq(
        "(",
        $.parameter_with_optional_type,
        optional(","),
        ")",
        optional(seq(":", $._type)),
        optional($.contract_effect_list),
        $.function_body
      ))
    ))),

    parameters_with_optional_type: $ => seq("(", sep1($.parameter_with_optional_type, ","), ")"),

    parameter_with_optional_type: $ => seq(
      optional($.parameter_modifiers),
      $.simple_identifier,
      optional(seq(":", $._type))
    ),

    parameter: $ => seq($.simple_identifier, ":", $._type),

    object_declaration: $ => prec.right(seq(
      optional($.modifiers),
      "object",
      alias($.simple_identifier, $.type_identifier),
      optional($.type_parameters),
      optional($.primary_constructor),
      optional(seq(":", $._delegation_specifiers)),
      optional($.class_body)
    )),

    secondary_constructor: $ => seq(
      optional($.modifiers),
      "constructor",
      $.function_value_parameters,
      optional(seq(":", $.constructor_delegation_call)),
      optional($._block)
    ),

    constructor_delegation_call: $ => seq(choice("this", "super"), $.value_arguments),

    // ==========
    // Enum classes
    // ==========

    enum_class_body: $ => seq(
      "{",
      $._delegate_end_hint,
      optional($._enum_entries),
      // Further semicolons as in _semis: `A;;` is Kotlin's DOUBLE_SEMICOLON, an error.
      optional(seq(";", repeat(alias($._further_semicolon, ";")), optional($._class_member_declarations))),
      "}",
      optional($._block_end_hint)
    ),

    _enum_entries: $ => seq(sep1($.enum_entry, ","), optional(",")),

    enum_entry: $ => seq(
      optional($.modifiers),
      $.simple_identifier,
      optional($.value_arguments),
      optional($.class_body)
    ),

    // ==========
    // Types
    // ==========

    _type: $ => seq(
      optional($.type_modifiers),
      choice(
        $.function_type,
        $.parenthesized_type,
        $.nullable_type,
        $._type_reference,
        $.not_nullable_type
      )
    ),

    // `dynamic` is a type in its own right, but a package or class may also be
    // named `dynamic`, so `dynamic.T` is an ordinary qualified user type. Only
    // the token after `dynamic` tells the two apart, which is why the bare
    // alternative alone made `dynamic.T` unparseable: it is a leaf, so nothing
    // could follow the '.'. Both readings are carried as a GLR conflict, and
    // `prec.dynamic` prefers the dedicated type whenever a bare `dynamic`
    // would also parse as a user type — which is how the Kotlin compiler reads
    // it, and keeps `dynamic` from printing as just another type_identifier.
    _type_reference: $ => prec.left(1, choice(
      $.user_type,
      $._dynamic_type
    )),

    _dynamic_type: $ => prec.dynamic(1, "dynamic"),

    not_nullable_type: $ => seq(
      optional($.type_modifiers),
      choice($.user_type, $.parenthesized_user_type),
      '&',
      optional($.type_modifiers),
      choice($.user_type, $.parenthesized_user_type),
    ),

    nullable_type: $ => seq(
      choice($._type_reference, $.parenthesized_type),
      repeat1($.quest)
    ),

    quest: $ => "?",

    // TODO: Figure out a better solution than right associativity
    //       to prevent nested types from being recognized as
    //       unary expresions with navigation suffixes.

    user_type: $ => sep1($._simple_user_type, "."),

    _simple_user_type: $ => prec.right(PREC.SIMPLE_USER_TYPE, seq(
      alias($.simple_identifier, $.type_identifier),
      optional($.type_arguments)
    )),

    type_projection: $ => choice(
      seq(optional($.type_projection_modifiers), $._type),
      "*"
    ),

    type_projection_modifiers: $ => repeat1($._type_projection_modifier),

    _type_projection_modifier: $ => $.variance_modifier,

    function_type: $ => seq(
      optional(seq(field("receiver", $.receiver_type), ".")),
      $.function_type_parameters,
      "->",
      $._type
    ),

    // A higher-than-default precedence resolves the ambiguity with 'parenthesized_type'
    function_type_parameters: $ => prec.left(1, seq(
      "(",
      optional(seq(sep1(choice($.parameter, $._type), ","), optional(","))),
      ")"
    )),

    parenthesized_type: $ => seq("(", $._type, ")"),

    parenthesized_user_type: $ => seq(
      "(",
      choice($.user_type, $.parenthesized_user_type),
      ")"
    ),

    // ==========
    // Statements
    // ==========

    statements: $ => seq(
      $._statement,
      repeat(seq($._semis, $._statement)),
      optional($._semis),
    ),

    _statement: $ => choice(
      // A declaration may carry labels too — `fun f() { l@ val x = 1 }` is
      // valid Kotlin. Only labels, not the statement-annotation prefix:
      // annotations on a declaration are already handled by `modifiers`, and
      // allowing both here would make them ambiguous.
      seq(optional($.label), $._declaration),
      $._expression_statement,
      // `suspend fun() {}` where a statement starts: parseLocalDeclaration reads the modifier
      // and the function without a name as a local declaration.
      alias($._suspend_anonymous_function, $.anonymous_function)
    ),

    _suspend_anonymous_function: $ => prec.right(seq("suspend", anonymousFunction($, undefined, false, false))),

    // A statement that is no declaration; also the body of an if, else, loop or when entry.
    _expression_statement: $ => choice(
      seq(repeat($.label), $._expression),
      seq($._statement_annotations, repeat($.label), $._expression),
      seq(repeat($.label), choice($.assignment, $._loop_statement)),
      // `@Suppress("x") y = f()` and `@A for (...) {}`. An annotation before an
      // expression already groups with it through `prefix_expression`, but an
      // assignment and a loop are not expressions, and `_statement` is hidden,
      // so the annotation came out as a sibling of the statement it annotates
      // and nothing said which statement it belonged to. JetBrains wraps an
      // annotated statement in ANNOTATED_EXPRESSION; this is that grouping.
      alias($._annotated_statement, $.annotated_expression)
    ),

    _annotated_statement: $ => seq(
      $._statement_annotations,
      choice($.assignment, $._loop_statement)
    ),

    // One shared symbol for the statement-level annotation prefix, used by
    // every arm above that can carry one. Giving each arm its own `repeat1`
    // makes the prefixes distinct symbols, and the parser then has to choose
    // between them before it has seen the statement that disambiguates — which
    // is what let a multi-annotation prefix be stolen from a declaration,
    // detaching `@Deprecated(...) @Suppress(...) public abstract class C` from
    // its annotations. Sharing it means the prefix reduces once and only the
    // tail decides.
    _statement_annotations: $ => repeat1(alias($._statement_annotation, $.annotation)),

    // Structurally identical to annotation, but a distinct rule so that
    // the parser state machine does not merge it with the annotation
    // reduction inside modifiers. Without this separation, modifiers
    // (PREC.MODIFIERS) always wins the reduce/reduce conflict and the
    // annotation-expression path is never explored, causing
    // @Annotation("args") (expr) to produce ERROR nodes.
    // Hidden (_) to keep it internal; aliased to $.annotation in _statement
    // so the CST uses a single "annotation" node name in all contexts,
    // matching PSI's unified ANNOTATION_ENTRY.
    _statement_annotation: $ => choice(
      $._single_annotation,
      $._multi_annotation
    ),

    // A label is an identifier with `@` right after it, one token as in Kotlin's lexer: as an
    // identifier followed by `@` the parser could not tell `x foo@{ }` from an infix call. The word
    // pattern leaves out the hard keywords, so `class@` is no label, and the scanner reads the
    // escaped form, so `` `if`@ `` is one.
    label: $ => choice(
      token(seq(wordExcept(HARD_KEYWORDS), "@")),
      $._quoted_label,
      // The same for the internal lexer: after a completed call the scanner probes the next line
      // for a labelled lambda (`foo()` above `` `lab`@ { } ``), passes the label and leaves the
      // token to the internal lexer. Without NUL, which only the scanner carries.
      token(seq("`", /[^`\r\n\x00]+/, "`@"))
    ),

    // The body of an `if`, `else`, loop or `when` entry is an expression in Kotlin's parser
    // (parseControlStructureBody -> parseBlockLevelExpression), where a modifier word is an
    // identifier and a declaration is no statement. Kotlin parses a keyword-led one there
    // (`if (c) val x = 1`) and rejects it; none occurs in the IntelliJ monorepo.
    control_structure_body: $ => choice(
      $._block,
      $._expression_statement,
      alias($._bodyless_named_function, $.anonymous_function)
    ),

    // `if (c) fun g()`: a named function without a body, which parseAtomicExpression reads as a
    // local function wherever an expression starts. Only here: elsewhere at statement start it
    // would take the `where@` of a type constraint as a label, see anonymous_function; in an
    // operand or an argument it stays a difference (tools/psi-gate/expected.json).
    _bodyless_named_function: $ => prec.dynamic(-1, anonymousFunction($, $.simple_identifier, true)),

    _block: $ => prec(PREC.BLOCK, seq(
      "{", $._delegate_end_hint, optional(";"), optional($.statements), "}",
      optional($._block_end_hint)
    )),

    _loop_statement: $ => choice(
      $.for_statement,
      $.while_statement,
      $.do_while_statement
    ),

    for_statement: $ => prec.right(seq(
      "for",
      "(",
      repeat($.annotation),
      choice($.variable_declaration, $.multi_variable_declaration),
      "in",
      $._expression,
      ")",
      optional($.control_structure_body)
    )),

    while_statement: $ => seq(
      "while",
      "(",
      $._expression,
      ")",
      choice(";", $.control_structure_body)
    ),

    do_while_statement: $ => prec.right(seq(
      "do",
      optional($.control_structure_body),
      "while",
      "(",
      $._expression,
      ")",
    )),

    // See also https://github.com/tree-sitter/tree-sitter/issues/160
    // generic EOF/newline token
    _semi: $ => $._automatic_semicolon,

    // A separator and any further `;`: Kotlin skips them between statements and between members,
    // `a(); ; b()` and the `; ;` of an enum body that goes on with members. Its lexer reads two
    // adjacent `;` as one token, DOUBLE_SEMICOLON, which no rule takes, so `a();; b()` is an
    // error. The scanner reads the first `;` as the separator and each further one only when
    // something stands between it and the `;` before it.
    _semis: $ => seq($._semi, repeat(alias($._further_semicolon, ";"))),

    assignment: $ => assignmentForms($, $._expression),

    // ==========
    // Expressions
    // ==========

    _expression: $ => choice(
      $._unary_expression,
      $._binary_expression,
      $._primary_expression
    ),

    // Unary expressions

    _unary_expression: $ => choice(
      $.postfix_expression,
      $.indexing_expression,
      $.navigation_expression,
      $.prefix_expression,
      $.as_expression,
      $.spread_expression
    ),

    postfix_expression: $ => UNARY_FORMS($, $._expression).postfix_expression,

    call_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $.call_suffix)),

    // Generic call expression: call with REQUIRED type_arguments.
    // The prec.dynamic(1) of its suffix tells GLR to prefer the generic-call interpretation
    // (f<T>(x)) over the comparison interpretation (f < T > (x)).
    // Separated from call_expression so the dynamic boost only applies
    // when type_arguments are actually parsed, not for all calls.
    _generic_call_expression: $ => prec.left(PREC.POSTFIX, seq(
      $._expression,
      alias($._generic_call_suffix, $.call_suffix)
    )),

    indexing_expression: $ => UNARY_FORMS($, $._expression).indexing_expression,

    navigation_expression: $ => UNARY_FORMS($, $._expression).navigation_expression,

    prefix_expression: $ => UNARY_FORMS($, $._expression).prefix_expression,

    as_expression: $ => UNARY_FORMS($, $._expression).as_expression,

    spread_expression: $ => UNARY_FORMS($, $._expression).spread_expression,

    // Binary expressions

    _binary_expression: $ => choice(
      $.multiplicative_expression,
      $.additive_expression,
      $.range_expression,
      $.infix_expression,
      $.elvis_expression,
      $.check_expression,
      $.comparison_expression,
      $.equality_expression,
      $.conjunction_expression,
      $.disjunction_expression
    ),

    multiplicative_expression: $ => BINARY_FORMS($, $._expression).multiplicative_expression,

    additive_expression: $ => BINARY_FORMS($, $._expression).additive_expression,

    range_expression: $ => BINARY_FORMS($, $._expression).range_expression,

    infix_expression: $ => BINARY_FORMS($, $._expression).infix_expression,

    elvis_expression: $ => BINARY_FORMS($, $._expression).elvis_expression,

    check_expression: $ => BINARY_FORMS($, $._expression).check_expression,

    comparison_expression: $ => BINARY_FORMS($, $._expression).comparison_expression,

    equality_expression: $ => BINARY_FORMS($, $._expression).equality_expression,

    conjunction_expression: $ => BINARY_FORMS($, $._expression).conjunction_expression,

    disjunction_expression: $ => BINARY_FORMS($, $._expression).disjunction_expression,

    // Suffixes

    indexing_suffix: $ => seq("[", sep1($._expression, ","), optional(','), "]"),

    navigation_suffix: $ => choice(
      seq(
        // this introduces ambiguities with 'less than' for comparisons
        optional($.type_arguments),
        choice(".", "?."),
        choice(
          seq($.simple_identifier, optional($._expression_end_hint)),
          // Kotlin's selector is an atomic expression (parseSelectorCallExpression), so the
          // reserved `this` and `super` are ones, and so are a literal, a jump, `value.null` and
          // `"foo".return`, a `when`, an object literal and an anonymous function, which the
          // compiler rejects. A number right after the dot is not one: Kotlin's lexer reads `.1`
          // as a real literal; after a space (`x. 1`) or a line break it is, as is a string.
          $.this_expression,
          $.integer_literal,
          $.hex_literal,
          $.bin_literal,
          $.real_literal,
          $.long_literal,
          $.unsigned_literal,
          $.string_literal,
          $.super_expression,
          $.boolean_literal,
          $.null_literal,
          $.character_literal,
          $.jump_expression,
          $.parenthesized_expression,
          $.when_expression,
          $.object_literal,
          alias($._selector_function, $.anonymous_function),
          // `a.{ b }()` — a lambda as the selector. ILLEGAL_SELECTOR is a
          // compiler diagnostic; Kotlin's parser reads the lambda and PSI
          // builds a DOT_QUALIFIED_EXPRESSION whose selector is the call.
          $.lambda_literal
        )
      ),
      // After `::` only a name or `class` (parseDoubleColonSuffix).
      seq(
        optional($.type_arguments),
        "::",
        choice($.simple_identifier, "class"),
        optional($._expression_end_hint)
      ),
      // A callable reference on a nullable generic receiver type, `List<T>?::orEmpty`, read the
      // way `List<T>::size` is, with callable_reference's question marks.
      seq(
        $.type_arguments,
        repeat1(alias($._callable_reference_quest, $.quest)),
        "::",
        choice($.simple_identifier, "class")
      )
    ),

    call_suffix: $ => prec.left(seq(
      // this introduces ambiguities with 'less than' for comparisons
      optional($.type_arguments),
      choice(
        prec(PREC.ARGUMENTS, seq(optional($.value_arguments), $.annotated_lambda)),
        $.value_arguments
      ),
      optional($._call_lambda_hint)
    )),

    // Call suffix with REQUIRED type_arguments (used by _generic_call_expression). The arguments
    // are optional: KotlinExpressionParsing.parseCallSuffix makes a call of type arguments that
    // close with `>` whatever follows (`g(x<T>)`, `a.foo<T> -> a`), while `a < b > c`, which
    // that reading leaves without an operator, stays a comparison. A suffix with arguments ranks
    // its reading higher, one without lower: a reading that needs one is the wrong one wherever
    // another reads the same tokens, as the comparison reading of `Array<Array<T>>(3)`
    // (`Array < Array<T> > (3)`) and that of `x as a.B<C<D>>` above `try { … }` (a navigation
    // after `x as a`, compared with `C<D>` and with the `try`) do.
    _generic_call_suffix: $ => prec.right(choice(
      prec.dynamic(1, seq(
        $.type_arguments,
        choice(
          prec(PREC.ARGUMENTS, seq(optional($.value_arguments), $.annotated_lambda)),
          $.value_arguments
        ),
        optional($._call_lambda_hint)
      )),
      prec.dynamic(-1, seq($.type_arguments, optional($._call_lambda_hint)))
    )),

    annotated_lambda: $ => seq(
      repeat($.annotation),
      optional($.label),
      $.lambda_literal
    ),

    type_arguments: $ => seq("<", sep1($.type_projection, ","), optional(","), ">"),

    value_arguments: $ => seq(
      "(",
      optional(
        seq(
          sep1($.value_argument, ","),
          optional(","),
        )
      ),
      ")"
    ),

    value_argument: $ => seq(
      optional($.annotation),
      optional(seq($.simple_identifier, "=")),
      optional("*"),
      $._expression
    ),

    _primary_expression: $ => choice(
      $.parenthesized_expression,
      // Never produced. Tells the scanner that a `{` on the next line starts a
      // new statement, as in Kotlin. Member access names carry it too.
      seq(choice($.simple_identifier, $.callable_reference), optional($._expression_end_hint)),
      $._literal_constant,
      $.string_literal,
      $.call_expression,
      alias($._generic_call_expression, $.call_expression),
      $._function_literal,
      $.object_literal,
      $.collection_literal,
      $.this_expression,
      $.super_expression,
      $.if_expression,
      $.when_expression,
      $.try_expression,
      $.jump_expression
    ),

    parenthesized_expression: $ => seq("(", $._expression, ")"),

    // https://kotlinlang.org/spec/syntax-and-grammar.html#grammar-rule-collectionLiteral
    // `@A([])` is valid Kotlin and the empty case was unparseable, because the
    // rule required at least one element.
    //
    // The elements are optional everywhere a collection literal is allowed,
    // not only inside an annotation. The Kotlin compiler does reject `[]` in
    // an expression position, but with UNSUPPORTED_ARRAY_LITERAL_OUTSIDE_OF_
    // ANNOTATION_ERROR -- a diagnostic about an unsupported feature, raised
    // after parsing. The Kotlin parser accepts it, and this grammar follows
    // the parser, so making the rule context-sensitive would diverge from PSI
    // to enforce something that is not a syntax error.
    collection_literal: $ => seq(
      "[",
      optional(seq(
        $._expression,
        repeat(seq(",", $._expression)),
        optional(",")
      )),
      "]"),

    _literal_constant: $ => choice(
      $.boolean_literal,
      $.integer_literal,
      $.hex_literal,
      $.bin_literal,
      $.character_literal,
      $.real_literal,
      $.null_literal,
      $.long_literal,
      $.unsigned_literal
    ),

    string_literal: $ => seq(
      $._string_start,
      repeat(choice($.string_content, $._interpolation)),
      $._string_end,
    ),

    line_string_expression: $ => seq("${", $._expression, "}"),

    _interpolation: $ => choice(
      seq(alias($._interpolation_expression_start, $.interpolation_expression_start), alias($._expression, $.interpolated_expression), alias("}", $.interpolation_expression_end)),
      // `"$this"`: the one hard keyword a short template entry takes (reserved, so no simple_identifier).
      seq(alias($._interpolation_identifier_start, $.interpolation_identifier_start), alias(choice($.simple_identifier, "this"), $.interpolated_identifier)),
    ),

    lambda_literal: $ => prec(PREC.LAMBDA_LITERAL, seq(
      "{",
      $._delegate_end_hint,
      optional(seq(optional($.lambda_parameters), "->")),
      optional(";"),
      optional($.statements),
      "}"
    )),

    // A destructuring statement (`(val a, var b) = pair`, `[val a, var b] = pair`) starts with `val`
    // or `var` inside its bracket: Kotlin's parseCommonDeclaration takes `(` or `[` as a declaration
    // only when lookahead(1) is VAL or VAR. Otherwise `(p) = q` is an assignment to `(p)`. Every
    // further entry needs its own `val` or `var` too ("Expecting val or var keyword").
    _destructuring_declaration_target: $ => choice(
      seq(
        '(',
        alias($._name_based_destructuring_first_entry, $.variable_declaration),
        repeat(seq(',', alias($._name_based_destructuring_first_entry, $.variable_declaration))),
        optional(','),
        ')'
      ),
      seq(
        '[',
        alias($._positional_destructuring_first_entry, $.variable_declaration),
        repeat(seq(',', alias($._positional_destructuring_first_entry, $.variable_declaration))),
        optional(','),
        ']'
      ),
    ),

    _name_based_destructuring_first_entry: $ => prec.dynamic(PREC.VAR_DECL, prec.left(seq(
      repeat($.annotation),
      $.binding_pattern_kind,
      $.simple_identifier,
      optional(seq(":", $._type)),
      optional(seq("=", $.simple_identifier))
    ))),

    _positional_destructuring_first_entry: $ => prec.dynamic(PREC.VAR_DECL, prec.left(seq(
      repeat($.annotation),
      $.binding_pattern_kind,
      $.simple_identifier,
      optional(seq(":", $._type))
    ))),

    _multi_variable_declaration_expr: $ => choice(
      seq(
        '(',
        sep1(alias($._name_based_destructuring_entry_expr, $.variable_declaration), ','),
        optional(','),
        ')'
      ),
      seq(
        '[',
        sep1(alias($._positional_destructuring_entry_expr, $.variable_declaration), ','),
        optional(','),
        ']'
      ),
    ),

    multi_variable_declaration: $ => choice(
      seq(
        '(',
        sep1(alias($._name_based_destructuring_entry, $.variable_declaration), ','),
        optional(','),
        ')'
      ),
      seq(
        '[',
        sep1(alias($._positional_destructuring_entry, $.variable_declaration), ','),
        optional(','),
        ']'
      ),
    ),

    lambda_parameters: $ => seq(sep1($._lambda_parameter, ","), optional(",")),

    _lambda_parameter: $ => choice(
      $.variable_declaration,
      // The statement-position variant: `{ (a).b() }` is a body, not a
      // destructured parameter, and only the absence of `->` says so.
      seq(alias($._multi_variable_declaration_expr, $.multi_variable_declaration),
          optional(seq(":", $._type)))
    ),

    // `x.fun()`: an anonymous function as a selector, in its plain form only. The full form (a
    // receiver, type parameters, a return type) cost 198 more states, a return type alone 81,
    // for code no compiler accepts; tools/psi-gate/expected.json lists the difference.
    _selector_function: $ => prec.right(seq(
      "fun", $.function_value_parameters, optional($.function_body)
    )),

    // A `fun` where Kotlin expects an expression, with or without a name: `if (c) fun g() {}`,
    // `1 < fun g() {}`. `fun` starts an expression (EXPRESSION_FIRST) and parseAtomicExpression
    // reads a named one as a local function; the compiler rejects the name later
    // (ANONYMOUS_FUNCTION_WITH_NAME). At statement start the same text is a function_declaration,
    // which wins by the lower precedence of the named form from its name on; the receiver before
    // it keeps the conflicts of the anonymous form. The dynamic precedence settles `@A fun g()`,
    // where the annotation is a modifier of the declaration or a prefix of the expression.
    // Neither form takes `suspend`: parseAtomicExpression reads a word before `fun` as an
    // expression of its own, so `val x = suspend fun() {}` is "Unexpected tokens". A context
    // before an anonymous function is one of its parts (`context(a: A) fun () {}`); before a
    // named one it is a call. The named form takes a body here, so that after `fun <T> f()` at
    // statement start the next line's `where@A T` stays a type constraint rather than a label of
    // a trailing lambda; without one it is a control structure body, `if (c) fun g()`.
    anonymous_function: $ => choice(
      prec.right(anonymousFunction($)),
      prec.dynamic(-1, anonymousFunction($, $.simple_identifier)),
    ),

    _optionally_typed_parameter: $ => seq($.simple_identifier, optional(seq(":", $._type))),

    _function_literal: $ => choice(
      $.lambda_literal,
      $.anonymous_function
    ),

    // An object expression always has a body and takes no modifier: Kotlin's parseObjectLiteral
    // parses the object with optionalBody = false ("Body is not optional because of
    // foo(object : A, B)"), and `data` is a modifier of an object declaration only.
    object_literal: $ => seq(
      "object",
      optional(seq(":", $._delegation_specifiers)),
      $.class_body,
    ),

    this_expression: $ => choice(
      "this",
      $._this_at
    ),

    super_expression: $ => prec.right(choice(
      "super",
      seq("super", "<", $._type, ">"),
      $._super_at
    )),

    if_expression: $ => prec.right(seq(
      "if",
      "(", field('condition', $._expression), ")",
      choice(
        field('consequence', $.control_structure_body),
        seq(
          optional(field('consequence', $.control_structure_body)),
          optional(";"),
          "else",
          choice(field('alternative', $.control_structure_body), ";")
        ),
        ";"
      )
    )),

    when_subject: $ => seq(
      "(",
      choice(
        seq(
          optional(seq($._when_subject_variable, "=")),
          $._expression
        ),
        // `when (val x: T) {}` — a subject variable with no initializer.
        // ILLEGAL_DECLARATION_IN_WHEN_SUBJECT is a compiler diagnostic, not a
        // parse error: PSI builds the PROPERTY and carries on, so the `when`
        // and everything after it still parse.
        $._when_subject_variable
      ),
      ")",
    ),

    // Kotlin's parser reads a full property declaration here and lets the
    // compiler object, so the subject variable can destructure or carry a
    // receiver just like any other `val`: `when (val (a, b) = foo) {}`,
    // `when (val T.x = foo) {}`.
    // `when (var i = 2)` too: Kotlin's parser takes either keyword, the compiler rejects `var`.
    _when_subject_variable: $ => seq(
      repeat($.annotation),
      choice("val", "var"),
      optional(seq(field("receiver", $._declaration_receiver_type), optional('.'))),
      choice($.variable_declaration, $.multi_variable_declaration)
    ),

    when_expression: $ => seq(
      "when",
      optional($.when_subject),
      "{",
      $._delegate_end_hint,
      repeat($.when_entry),
      "}"
    ),

    when_entry: $ => seq(
      choice(
        // conditions, an optional guard and an optional trailing comma
        seq($.when_condition, repeat(seq(",", $.when_condition)), optional($.guard_condition), optional(",")),
        // `else if <expr> ->` is a guarded else branch (Kotlin 2.2)
        seq("else", optional($.guard_condition))
      ),
      "->",
      $.control_structure_body,
      optional($._semi)
    ),

    guard_condition: $ => seq("if", $._expression),

    when_condition: $ => choice(
      $._expression,
      $.range_test,
      $.type_test,
    ),

    range_test: $ => seq(optional("!"), $._in_operator, $._expression),

    type_test: $ => seq(optional("!"), $._is_operator, $._type),

    try_expression: $ => prec.right(seq(
      "try",
      $._block,
      choice(
        seq(repeat1($.catch_block), optional($.finally_block)),
        $.finally_block
      )
    )),

    // Non-emitted context flag for ASI: these keywords continue a statement
    // only at a try-clause slot; elsewhere they are ordinary identifiers.
    catch_block: $ => seq(
      optional($._try_clause_hint),
      "catch",
      "(",
      repeat($.annotation),
      $.simple_identifier,
      ":",
      $._type,
      optional(","),
      ")",
      $._block,
    ),

    finally_block: $ => seq(optional($._try_clause_hint), "finally", $._block),

    jump_expression: $ => choice(
      prec.right(PREC.RETURN_OR_THROW, seq("throw", $._expression)),
      prec.right(PREC.RETURN_OR_THROW, seq(choice("return", $._return_at), optional($._expression))),
      "continue",
      $._continue_at,
      "break",
      $._break_at
    ),

    // Kotlin's callableReference takes a receiverType, but reusing the type
    // rules here is what broke the first attempt: nullable_type pulls in
    // parenthesized_type and type_modifiers, which puts the whole type grammar
    // in expression-reachable position and changes how `?` resolves across
    // safe-call, elvis and nullable types. 39 of 404 corpus tests regressed,
    // in delegation, comments, destructuring and enums -- nowhere near
    // callable references.
    //
    // So this slot gets its own receiver, admitting only what a callable
    // reference receiver can actually be: a possibly-qualified name, optional
    // type arguments, and any number of `?`. No parenthesized types and no
    // type modifiers, which also keeps `((Int) -> Unit)?::invoke` rejected,
    // matching the Kotlin parser ("Expecting ')'").
    //
    // Hidden, so its children inline and `String::plus` keeps exactly the tree
    // it has today: (callable_reference (type_identifier) (simple_identifier)).
    // Just a name. A wider receiver -- qualification and type arguments, as
    // Kotlin's receiverType allows -- was built and measured first, and it
    // reshaped 46 real-world files: it flattens `a.b.C::class` into one node
    // where the Kotlin parser keeps the qualified name as nested
    // DOT_QUALIFIED_EXPRESSION inside a CLASS_LITERAL_EXPRESSION. Per-file PSI
    // comparison put 42 of those files in a state where neither the old nor
    // the new tree matched PSI. The narrow receiver fixes the same real-world
    // files with no reshaping at all, so the extra reach is not worth it until
    // the receiver can preserve that nesting.
    //
    // Split from the nullable form below so the two are distinct rules and the
    // ambiguity between them can be declared as a conflict and explored.
    _callable_reference_name: $ => alias($.simple_identifier, $.type_identifier),

    // Aliased literals rather than $.quest, so this does not share
    // nullable_type's generated repeat symbol.
    _callable_reference_nullable: $ => seq(
      $._callable_reference_name,
      repeat1(alias($._callable_reference_quest, $.quest))
    ),

    // `(X)?::x`: an expression in parentheses with question marks, which Kotlin's parser reads
    // as a nullable receiver of the reference (CALLABLE_REFERENCE_EXPRESSION over PARENTHESIZED).
    // Without question marks `(X)::x` stays a navigation; a type in parentheses is no expression,
    // so `((Int) -> Unit)?::invoke` stays an error.
    _callable_reference_parenthesized: $ => seq(
      $.parenthesized_expression,
      repeat1(alias($._callable_reference_quest, $.quest))
    ),

    callable_reference: $ => seq(
      optional(choice($._callable_reference_name, $._callable_reference_nullable, $._callable_reference_parenthesized)),
      "::",
      choice($.simple_identifier, "class")
    ),

    _assignment_and_operator: $ => choice("+=", "-=", "*=", "/=", "%="),

    _equality_operator: $ => choice("!=", "!==", "==", "==="),

    _comparison_operator: $ => choice("<", ">", "<=", ">="),

    _in_operator: $ => "in",

    _is_operator: $ => "is",

    _additive_operator: $ => choice("+", "-"),

    _multiplicative_operator: $ => choice("*", "/", "%"),

    _as_operator: $ => choice("as", "as?"),

    _prefix_unary_operator: $ => choice("++", "--", "-", "+", "!"),

    _postfix_unary_operator: $ => choice("++", "--", "!!"),

    _member_access_operator: $ => choice(".", "::", "?."),

    _postfix_unary_suffix: $ => choice(
      $._postfix_unary_operator,
      $.navigation_suffix,
      $.indexing_suffix
    ),

    // The left side of an assignment: Kotlin's directlyAssignableExpression is a postfix
    // expression with an assignable suffix, a simple name, or one in parentheses. Any other
    // primary without a suffix stays possible, at dynamic precedence -1: otherwise
    // `if (b) m.x = z` had an equal second reading, `(if (b) m.x) = z`, and GLR could pick it.
    _postfix_unary_expression: $ => choice(
      seq($._primary_expression, repeat1($._postfix_unary_suffix)),
      prec.dynamic(-1, $._primary_expression)
    ),

    _cast_assignable_expression: $ => prec(1, $.as_expression),

    directly_assignable_expression: $ => prec(
      PREC.ASSIGNMENT,
      choice(
        $._postfix_unary_expression,
        $.simple_identifier,
        $.parenthesized_expression
      )
    ),

    // ==========
    // Modifiers
    // ==========

    // `$._modifier` deliberately carries no precedence, and the repetition is
    // held together by the `[$.modifiers]` conflict rather than by
    // `prec.right`. A precedence resolves an ambiguity by discarding one
    // reading at table-generation time, and here that discarded the right one:
    // in `class C(@param:A value: T)`, once the annotation had started a
    // modifier list, "keep extending the list" always beat "the list ends here
    // and this soft keyword is the declaration's name", so `value` became a
    // modifier and the name went MISSING. The declared
    // `class_modifier`/`simple_identifier` conflict could not help, because the
    // alternative no longer existed. A conflict carries both readings instead
    // and keeps the one that parses.
    // Kotlin's parser reads a statement as a declaration first: it takes every modifier word and
    // annotation, across line breaks, and keeps them when a declaration keyword follows
    // (KotlinParsing.parseLocalDeclaration), so `private` alone on a line before `fun x()` is a
    // modifier, not an expression statement.
    // A word read as a modifier ranks its reading one higher. A run of modifier words over lines
    // also reads as infix expressions ending at any of its line breaks, then a declaration with
    // the rest (`private private private` above `private fun f() {}`); Kotlin's parser takes the
    // whole run as the declaration's modifiers (parseLocalDeclaration), and so does the reading
    // with the most modifiers. Without the ranking GLR kept the readings unordered, and past its
    // version limit a run of 25 words split.
    modifiers: $ => repeat1(choice(
      prec.right(PREC.MODIFIERS, $.annotation),
      prec.right(PREC.MODIFIERS, $.context_receiver),
      prec.dynamic(1, seq($._modifier, optional($._modifier_hint)))
    )),

    parameter_modifiers: $ => repeat1(choice($.annotation, $.parameter_modifier)),

    _modifier: $ => choice(
      $.class_modifier,
      $.member_modifier,
      $.visibility_modifier,
      $.function_modifier,
      $.property_modifier,
      $.inheritance_modifier,
      $.parameter_modifier,
      $.platform_modifier
    ),

    type_modifiers: $ => repeat1($._type_modifier),

    _type_modifier: $ => choice($.annotation, alias($._type_context_receiver, $.context_receiver), "suspend"),

    class_modifier: $ => choice(
      "sealed",
      "annotation",
      "data",
      "inner",
      "value",
    ),

    member_modifier: $ => choice(
      "override",
      "lateinit",
      // Kotlin 2.4 companion extensions (CompanionBlocksAndExtensions): `companion fun String.foo()`,
      // `private companion val A.k = "K"`. `companion object` keeps its own rule, companion_object.
      "companion"
    ),

    visibility_modifier: $ => choice(
      "public",
      "private",
      "internal",
      "protected"
    ),

    variance_modifier: $ => choice(
      "in",
      "out"
    ),

    // A type parameter carries at most one variance modifier, which is the
    // rule Kotlin itself enforces. Folding `variance_modifier` into a plain
    // `repeat1` let `class C<out out>` consume both words as modifiers and
    // then report the parameter's name as missing, rather than reading the
    // second `out` as the name.
    type_parameter_modifiers: $ => choice(
      seq(
        repeat($._type_parameter_modifier),
        $.variance_modifier,
        repeat($._type_parameter_modifier)
      ),
      repeat1($._type_parameter_modifier)
    ),

    _type_parameter_modifier: $ => choice(
      $.reification_modifier,
      $.annotation,
      // Kotlin's parser accepts any modifier on a type parameter and reports
      // WRONG_MODIFIER_TARGET afterwards; JetBrains builds a flat MODIFIER_LIST
      // on the TYPE_PARAMETER, so `class C<abstract T>` has to parse.
      //
      // Variance stays out of this list on purpose: `type_parameter_modifiers`
      // bounds the variance slot to one so that `class C<out out>` reads the
      // second `out` as the parameter's name, and folding it in here would
      // unbound it again.
      $._modifier
    ),

    function_modifier: $ => choice(
      "tailrec",
      "operator",
      "infix",
      "inline",
      "external",
      "suspend"
    ),

    property_modifier: $ => "const",

    inheritance_modifier: $ => choice(
      "abstract",
      "final",
      "open"
    ),

    parameter_modifier: $ => choice(
      "vararg",
      "noinline",
      "crossinline"
    ),

    reification_modifier: $ => "reified",

    platform_modifier: $ => choice(
      "expect",
      "actual"
    ),

    // ==========
    // Annotations
    // ==========

    annotation: $ => choice(
      $._single_annotation,
      $._multi_annotation
    ),

    _single_annotation: $ => seq(
      "@",
      optional($.use_site_target),
      $._unescaped_annotation
    ),

    _multi_annotation: $ => seq(
      "@",
      optional($.use_site_target),
      "[",
      repeat1($._unescaped_annotation),
      "]"
    ),

    use_site_target: $ => seq(
      // `all` is the use-site target introduced for annotating every
      // declaration a constructor property generates at once.
      //
      // `file` belongs here too. A file annotation only has its own form at
      // the head of the file; once an ordinary annotation precedes it, as in
      // `@A @file:B` before a function, Kotlin's parser puts both entries in
      // the declaration's MODIFIER_LIST.
      choice($._use_site_target_name, "file"),
      ":"
    ),

    _use_site_target_name: $ => choice(
      "all", "field", "property", "get", "set", "receiver", "param", "setparam", "delegate"
    ),

    // Only ever used through an alias to `use_site_target`, so that a file
    // annotation can carry a non-`file` target without `@file:` itself
    // gaining a child it never had.
    non_file_annotation_target: $ => seq($._use_site_target_name, ":"),

    _unescaped_annotation: $ => choice(
      alias($._annotation_constructor_invocation, $.constructor_invocation),
      $.user_type
    ),

    // ==========
    // Identifiers
    // ==========

    simple_identifier: $ => choice(
      $._lexical_identifier,
      ...SOFT_KEYWORD_IDENTIFIERS,
    ),

    // The name of an infix call inside a class delegate (`by a foo b`): a `where` after the
    // delegate starts the type constraints instead. Kotlin ends an infix call at a newline, and
    // the scanner inserts no semicolon before a `where` a type constraint follows, so the line
    // break before `where T : A` is invisible here; on one line, Kotlin's `by a where T` is an
    // infix call and a compile error.
    _delegate_infix_name: $ => choice(
      $._lexical_identifier,
      ...SOFT_KEYWORD_IDENTIFIERS.filter(word => word !== "where"),
    ),

    identifier: $ => sep1($.simple_identifier, "."),

    // Adapted from tree-sitter-java, helps to avoid a conflic with
    // wildcard_import node while being compatible with identifier
    _import_identifier: $ => choice(
      $.simple_identifier,
      seq($._import_identifier, $._import_dot, $.simple_identifier),
    ),

    // ====================
    // Lexical grammar
    // ====================


    // ==========
    // General
    // ==========

    // `.` matches a carriage return, so a comment ended by a bare CR used to
    // swallow the line after it. Kotlin treats CR on its own as a terminator.
    line_comment: $ => token(seq('//', /[^\r\n]*/)),

    // `multiline_comment` is an external token (src/scanner.c) so that nested
    // and unterminated comments can be handled. This internal definition
    // covers the common non-nested, terminated case and gives tree-sitter's
    // own lexer a fallback for when the external scanner declines a token —
    // e.g. when scan_automatic_semicolon has skipped a comment to look at the
    // token behind it and reports "no semicolon here".
    multiline_comment: _ => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),

    // ==========
    // Separators and operations
    // ==========


    // ==========
    // Keywords
    // ==========

    // The name after `break@`, `return@`, `this@` and the like follows the `@` directly, as
    // Kotlin's lexer reads them; `break@ lab` is an error ("Label must be named"). The scanner
    // reads it as a whole word, so a hard keyword is none (`return@as`), where an immediate token
    // of the internal lexer took the longest word it accepted, `a` of `as`. A quoted name keeps
    // any whitespace before it.
    _label_name: $ => choice($._label_identifier, $._backtick_identifier),

    _return_at: $ => seq(
      "return@",
      alias($._label_name, $.label)
    ),

    _continue_at: $ => seq(
      "continue@",
      alias($._label_name, $.label)
    ),

    _break_at: $ => seq(
      "break@",
      alias($._label_name, $.label)
    ),

    _this_at: $ => seq(
      "this@",
      alias($._label_name, $.type_identifier)
    ),

    _super_at: $ => choice(
      seq(
        "super@",
        alias($._label_name, $.type_identifier)
      ),
      seq(
        "super",
        "<", $._type, ">",
        token.immediate("@"),
        alias($._label_name, $.type_identifier)
      )
    ),

    // ==========
    // Literals
    // ==========

    real_literal: $ => token(choice(
      seq(
        choice(
          seq(DEC_DIGITS, REAL_EXPONENT),
          seq(optional(DEC_DIGITS), ".", DEC_DIGITS, optional(REAL_EXPONENT))
        ),
        optional(/[fF]/)
      ),
      seq(DEC_DIGITS, /[fF]/)
    )),

    integer_literal: $ => token(DEC_DIGITS),

    hex_literal: $ => token(seq("0", /[xX]/, HEX_DIGITS)),

    bin_literal: $ => token(seq("0", /[bB]/, BIN_DIGITS)),

    unsigned_literal: $ => seq(
      choice($.integer_literal, $.hex_literal, $.bin_literal),
      /[uU]L?/
    ),

    long_literal: $ => seq(
      choice($.integer_literal, $.hex_literal, $.bin_literal),
      // Kotlin's lexer takes a lowercase `l` as well; the compiler then
      // reports it, so `1l` is a parsed literal rather than a syntax error.
      /[lL]/
    ),

    boolean_literal: $ => choice("true", "false"),

    // Kotlin's lexer reads any run of characters and escapes between the quotes as one character
    // literal (CHARACTER_LITERAL in Kotlin.flex), `''` and `'org.sample'` included, and leaves the
    // count to the compiler; Groovy-style quotes in Gradle scripts are such literals. It is one
    // token there, so its parts here follow each other immediately: no line break, and no
    // comment as an extra inside (`'a/*c*/b'` is text), and its closing quote is optional. An escape is a backslash and any
    // character but a line break (ESCAPE_SEQUENCE), the compiler judging `'\q'`. The characters
    // between the escapes are scanned externally, as the internal lexer cannot carry a NUL.
    character_literal: $ => seq(
      "'",
      repeat(choice($.character_escape_seq, $._character_content)),
      // Optional there too: a literal ends at its line without one, `'a` above `b'`, and the
      // compiler reports it.
      optional(token.immediate("'"))
    ),

    character_escape_seq: $ => choice(
      $._uni_character_literal,
      $._escaped_identifier
    ),

    null_literal: $ => "null",

    // ==========
    // Identifiers
    // ==========

    _lexical_identifier: $ => choice(
      $._alpha_identifier,
      $._backtick_identifier,
    ),

    _alpha_identifier: $ => new RegExp(`[\\p{L}_${UNICODE_LETTER_SUPPLEMENT}][\\p{L}_\\p{Nd}${UNICODE_LETTER_SUPPLEMENT}]*`, 'u'),

    // Scanned externally: the internal lexer cannot carry a NUL through a
    // character class, and Kotlin allows one inside a quoted identifier.
    _backtick_identifier: $ => $._quoted_identifier,

    _uni_character_literal: $ => token.immediate(/\\u[0-9a-fA-F]{4}/),

    _escaped_identifier: $ => token.immediate(/\\[^\n\r]/),

  }
});

// An identifier other than the ASCII `words`, built from their trie: at each prefix, either stop
// (when the prefix is no word), or go on with a character no word continues with, or follow a
// word. A character no word continues with is any other identifier character, so a Unicode letter
// or digit (`labé@`) leads off the trie at once. Classes are intersected with `&&`, which tree-sitter
// reads (regex-syntax); a RustRegex hands the pattern over unparsed, since JavaScript takes `&&` only
// under the `v` flag, which Node 18 lacks.
function wordExcept(words) {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_';
  const rest = letters + '0123456789';
  const nonAscii = classes => `[[${classes}${UNICODE_LETTER_SUPPLEMENT}]&&[^\\x00-\\x7f]]`;
  const identifierRest = `[\\p{L}_\\p{Nd}${UNICODE_LETTER_SUPPLEMENT}]*`;
  const trie = {};
  for (const word of words) {
    let node = trie;
    for (const char of word) node = node[char] ??= {};
    node[''] = true;
  }
  const suffix = (node, depth) => {
    const next = Object.keys(node).filter(key => key !== '');
    const others = [...(depth === 0 ? letters : rest)].filter(char => !next.includes(char)).join('');
    const leave = `(?:[${others}]|${nonAscii(depth === 0 ? '\\p{L}' : '\\p{L}\\p{Nd}')})${identifierRest}`;
    const body = `(${[leave, ...next.map(char => char + suffix(node[char], depth + 1))].join('|')})`;
    return depth > 0 && !node[''] ? `${body}?` : body;
  };
  return new RustRegex(suffix(trie, 0));
}

// `context(...)` before a declaration or a function type, see context_receiver.
function contextReceiver($, labelled) {
  const receiver = labelled ? seq(optional($.label), $._type) : $._type;
  return seq(
    "context",
    "(",
    sep1(choice(seq(optional($.parameter_modifiers), $.parameter), receiver), ","),
    optional(","),
    ")"
  );
}

// An anonymous function, or with `name` before its parameters a named one, which takes a body and
// the lower precedence from its name on (see `anonymous_function`).
function anonymousFunction($, name, bodyless = false, context = !name) {
  // The receiver is a type as for a function declaration (`fun Any?.() = this`,
  // `fun @[a] T.(a: foo)`), but not one in parentheses: `fun (b) {}` is a parameter
  // list, and `(b)` cannot be told from a receiver until the `.` that never comes.
  const receiver = optional(seq(field("receiver", alias($._anonymous_receiver_type, $.receiver_type)), "."));
  // Kotlin accepts type parameters on an anonymous function in two
  // placements, and one slot here covers both: with no receiver
  // (`fun <T>() {}`) and after a receiver (`fun T.<A>(x: T): T`, which PSI
  // renders as TYPE_PARAMETER_LIST following the receiver dot). Keeping it
  // to a single slot after the optional receiver avoids two optional
  // placements competing for the same `<`. A named one also takes them where a
  // function declaration does, before the receiver: `if (c) fun <T> R.g(x: T) {}`;
  // the two placements are alternatives, so no `<` has two optional slots.
  const head = name
    ? [choice(seq(optional($.type_parameters), receiver), seq(field("receiver", alias($._anonymous_receiver_type, $.receiver_type)), ".", $.type_parameters))]
    : [receiver, optional($.type_parameters)];
  const body = bodyless ? [] : [$.function_body];
  const tail = name
    ? [prec.right(-1, seq(name, $.function_value_parameters, optional(seq(":", $._type)), ...body))]
    : [$.function_value_parameters, optional(seq(":", $._type)), optional($.function_body)];
  return seq(
    ...(context ? [optional($.context_receiver)] : []),
    "fun",
    ...head,
    ...tail
  );
}

// The assignments of `target` with the right side `value`: the full grammar takes `$._expression`,
// an `if` branch inside a delegate `$._expression_no_trailing_lambda` and a target of its own.
function assignmentForms(
  $, value,
  target = $.directly_assignable_expression,
  castTarget = alias($._cast_assignable_expression, $.directly_assignable_expression),
) {
  return choice(
    prec.left(PREC.ASSIGNMENT, seq(target, $._assignment_and_operator, value)),
    // Kotlin's parser reads `+=` and the other augmented assignments as binary operators of the
    // lowest precedence, so a cast may stand left of them: `c as MutableList<T> += x` calls
    // plusAssign on the cast.
    prec.left(PREC.ASSIGNMENT, seq(castTarget, $._assignment_and_operator, value)),
    prec.left(PREC.ASSIGNMENT, seq(target, "=", value)),
  );
}

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
