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

    // `l@` may begin a labelled expression or, now, a labelled declaration;
    // which it is only becomes clear at the token after the label.
    [$.prefix_expression],

    // `( name` at statement start: a destructuring target or a parenthesized
    // expression. Nothing tells them apart until after the ')', so carry both.
    [$._name_based_destructuring_entry_expr, $._primary_expression],

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
    [$.type_parameter_modifiers],

    // "<x>.<y> = z assignment conflicts with <x>.<y>() function call"
    [$._postfix_unary_expression, $._expression],

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
    [$._statement, $.prefix_expression],
    // _statement_annotation vs annotation (in prefix_expression and modifiers):
    // both parse @Identifier but route through different rules.
    [$._statement_annotation, $.annotation],
    [$.prefix_expression, $._when_subject_variable],
    [$.prefix_expression, $.value_argument],
    // ambiguity between prefix unary operators and other expression types
    [$.call_expression, $._generic_call_expression, $.navigation_expression, $.prefix_expression, $.comparison_expression],

    // ambiguity between multiple user types and class property/function declarations
    [$.user_type],
    [$.user_type, $.anonymous_function],
    //[$.user_type, $.function_type],

    // ambiguity caused by 'suspend'
    [$.function_modifier, $.simple_identifier],
    [$._type_modifier, $.simple_identifier],
    [$.delegation_specifier, $._type_modifier, $.simple_identifier],
    [$.anonymous_function, $.function_modifier],
    [$.anonymous_function, $.simple_identifier],
    [$.anonymous_function, $.function_modifier, $.simple_identifier],


    // ambiguity between simple identifier 'set/get' with actual setter/getter functions.
    [$.setter, $.simple_identifier],
    [$.getter, $.simple_identifier],

    // ambiguity between parameter modifiers in anonymous functions
    [$.parameter_modifiers, $._type_modifier],

    // ambiguity for object literal
    [$.object_literal],
    [$.object_literal, $.class_modifier],
    [$.object_literal, $.class_modifier, $.simple_identifier],
    [$.object_literal, $.simple_identifier],
    [$.object_literal, $.object_declaration],

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

    // Ambiguity between regular expressions and the no-trailing-lambda variant
    // used in explicit_delegation to prevent `{ }` after `by expr` being parsed
    // as a trailing lambda instead of class_body.
    [$._expression, $._expression_no_trailing_lambda],
    [$._primary_expression, $._primary_expression_no_trailing_lambda],
    // Three-way conflict: a callable reference (Foo::bar) starts with the name
    // alone, which both primary_expression variants can match. Carrying the
    // name rule here covers the whole `callable_reference` reading with it.
    [$._primary_expression, $._primary_expression_no_trailing_lambda, $._callable_reference_name],

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
  // `typeof` is reserved by Kotlin too but no rule uses it, and a reserved word must be a token of the grammar.
  reserved: {
    global: _ => [
      'as',
      'break',
      'class',
      'continue',
      'do',
      'else',
      'false',
      'for',
      'fun',
      'if',
      'in',
      'interface',
      'is',
      'null',
      'object',
      'package',
      'return',
      'super',
      'this',
      'throw',
      'true',
      'try',
      'typealias',
      'val',
      'var',
      'when',
      'while',
    ],
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
    $._generic_call_expression_no_trailing_lambda,
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
    $._uni_character_literal,
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
      optional($.shebang_line),
      repeat($.file_annotation),
      optional($.package_header),
      optional($.import_list),
      repeat(seq($._statement, $._semi))
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
      // TODO: it would be better to have getter/setter only in
      // property_declaration but it's difficult to get ASI
      // (Automatic Semicolon Insertion) working in the lexer for
      // getter/setter. Indeed, they can also have modifiers in
      // front, which means it's not enough to lookahead for 'get' or 'set' in
      // the lexer, you also need to handle modifier keywords. It is thus
      // simpler to accept them here.
      $.getter,
      $.setter,
      $.type_alias
    ),

    // ==========
    // Classes
    // ==========

    class_declaration: $ => prec.dynamic(1, prec.right(choice(
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
        "enum", "class",
        alias($.simple_identifier, $.type_identifier),
        optional($.type_parameters),
        optional($.primary_constructor),
        optional(seq(":", $._delegation_specifiers)),
        optional($.type_constraints),
        optional($.enum_class_body)
      )
    ))),

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
      seq("suspend", $.function_type)
    )),

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
    // Kotlin reads no trailing lambda anywhere in a delegate, so the right
    // operand of `?:` gets its own rule. Other operators keep the general one.
    _expression_no_trailing_lambda: $ => choice(
      $.postfix_expression,
      $.indexing_expression,
      $.navigation_expression,
      $.as_expression,
      $.spread_expression,
      $.prefix_expression,
      $.multiplicative_expression,
      $.additive_expression,
      $.range_expression,
      $.infix_expression,
      $.check_expression,
      $.comparison_expression,
      $.equality_expression,
      $.conjunction_expression,
      $.disjunction_expression,
      alias($._elvis_expression_no_trailing_lambda, $.elvis_expression),
      $._primary_expression_no_trailing_lambda
    ),

    _elvis_expression_no_trailing_lambda: $ => prec.left(PREC.ELVIS, seq($._expression, "?:", $._expression_no_trailing_lambda)),

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
      $.if_expression,
      $.when_expression,
      $.try_expression,
      $.jump_expression
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

    _generic_call_suffix_no_trailing_lambda: $ => seq(
      $.type_arguments,
      $.value_arguments
    ),

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
      repeat(seq($._semi, $._class_member_declaration)),
      optional($._semi),
    ),

    _class_member_declaration: $ => choice(
      $._declaration,
      $.companion_object,
      $.anonymous_initializer,
      $.secondary_constructor
    ),

    // `class C { private init {} }`. The compiler rejects the modifier with
    // WRONG_MODIFIER_TARGET, but Kotlin's parser reads it: PSI builds a
    // CLASS_INITIALIZER with a MODIFIER_LIST, so the rest of the class body
    // still parses.
    anonymous_initializer: $ => seq(optional($.modifiers), "init", $._block),

    companion_object: $ => seq(
      optional($.modifiers),
      "companion",
      "object",
      optional(alias($.simple_identifier, $.type_identifier)),
      optional(seq(":", $._delegation_specifiers)),
      optional($.class_body)
    ),

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
    context_receiver: $ => seq(
      "context",
      "(",
      sep1(choice(seq(optional($.parameter_modifiers), $.parameter), $._type), ","),
      optional(","),
      ")"
    ),

    // `public fun Foo.bar() { … }` also parses as an infix expression, because
    // the visibility modifiers are soft keywords in `simple_identifier`. Both
    // readings are complete, so this is the dynamic-precedence decision #278
    // made for `class` and `object` (issue #277); at the time `fun` was not
    // reachable that way, and the GLR conflict on annotations made it so.
    function_declaration: $ => prec.dynamic(1, prec.right(seq( // TODO
      optional($.modifiers),
      "fun",
      optional($.type_parameters),
      optional(seq(field("receiver", $._declaration_receiver_type), optional('.'))),
      $.simple_identifier,
      $.function_value_parameters,
      optional(seq(":", $._type)),
      optional($.type_constraints),
      optional($.function_body)
    ))),

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
      optional($.binding_pattern_kind),
      $.simple_identifier,
      optional(seq(":", $._type)),
      optional(seq("=", $.simple_identifier))
    ))),

    // Entry in name-based (parenthesized) destructuring — supports optional val/var and renaming
    _name_based_destructuring_entry: $ => prec.left(PREC.VAR_DECL, seq(
      optional($.binding_pattern_kind),
      $.simple_identifier,
      optional(seq(":", $._type)),
      optional(seq("=", $.simple_identifier))  // renaming: val localName = propertyName
    )),

    // Entry in positional (bracketed) destructuring — supports optional val/var, NO renaming
    _positional_destructuring_entry: $ => prec.left(PREC.VAR_DECL, seq(
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
      alias($._multi_variable_declaration_expr, $.multi_variable_declaration),
      optional($.type_constraints),
      "=",
      $._expression,
      optional(';'),
    )),

    getter: $ => prec.right(seq(
      optional($.modifiers),
      "get",
      optional(seq(
        "(", ")",
        optional(seq(":", $._type)),
        $.function_body
      ))
    )),

    setter: $ => prec.right(seq(
      optional($.modifiers),
      "set",
      optional(seq(
        "(",
        $.parameter_with_optional_type,
        optional(","),
        ")",
        optional(seq(":", $._type)),
        $.function_body
      ))
    )),

    parameters_with_optional_type: $ => seq("(", sep1($.parameter_with_optional_type, ","), ")"),

    parameter_with_optional_type: $ => seq(
      optional($.parameter_modifiers),
      $.simple_identifier,
      optional(seq(":", $._type))
    ),

    parameter: $ => seq($.simple_identifier, ":", $._type),

    object_declaration: $ => prec.dynamic(1, prec.right(seq(
      optional($.modifiers),
      "object",
      alias($.simple_identifier, $.type_identifier),
      optional($.type_parameters),
      optional($.primary_constructor),
      optional(seq(":", $._delegation_specifiers)),
      optional($.class_body)
    ))),

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
      optional(seq(";", optional($._class_member_declarations))),
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
      repeat(seq($._semi, $._statement)),
      optional($._semi),
    ),

    _statement: $ => choice(
      // A declaration may carry labels too — `fun f() { l@ val x = 1 }` is
      // valid Kotlin. Only labels, not the statement-annotation prefix:
      // annotations on a declaration are already handled by `modifiers`, and
      // allowing both here would make them ambiguous.
      seq(optional($.label), $._declaration),
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

    label: $ => token(seq(
      /[a-zA-Z_][a-zA-Z_0-9]*/,
      "@"
    )),

    control_structure_body: $ => choice($._block, $._statement),

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

    assignment: $ => choice(
      prec.left(PREC.ASSIGNMENT, seq($.directly_assignable_expression, $._assignment_and_operator, $._expression)),
      prec.left(PREC.ASSIGNMENT, seq($.directly_assignable_expression, "=", $._expression)),
      // TODO
    ),

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

    postfix_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $._postfix_unary_operator)),

    call_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $.call_suffix)),

    // Generic call expression: call with REQUIRED type_arguments.
    // prec.dynamic(1) tells GLR to prefer the generic-call interpretation
    // (f<T>(x)) over the comparison interpretation (f < T > (x)).
    // Separated from call_expression so the dynamic boost only applies
    // when type_arguments are actually parsed, not for all calls.
    _generic_call_expression: $ => prec.left(PREC.POSTFIX, prec.dynamic(1, seq(
      $._expression,
      alias($._generic_call_suffix, $.call_suffix)
    ))),

    indexing_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $.indexing_suffix)),

    navigation_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $.navigation_suffix)),

    prefix_expression: $ => choice(
      prec.right(PREC.PREFIX, seq($._prefix_unary_operator, $._expression)),
      prec.right(seq(choice($.annotation, $.label), $._expression)),
    ),

    as_expression: $ => prec.left(PREC.AS, seq($._expression, $._as_operator, $._type)),

    spread_expression: $ => prec.left(PREC.SPREAD, seq("*", $._expression)),

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

    multiplicative_expression: $ => prec.left(PREC.MULTIPLICATIVE, seq($._expression, $._multiplicative_operator, $._expression)),

    additive_expression: $ => prec.left(PREC.ADDITIVE, seq($._expression, $._additive_operator, $._expression)),

    range_expression: $ => prec.left(PREC.RANGE, seq($._expression, choice("..", "..<"), $._expression)),

    infix_expression: $ => prec.left(PREC.INFIX, seq($._expression, $.simple_identifier, $._expression)),

    elvis_expression: $ => prec.left(PREC.ELVIS, seq($._expression, "?:", $._expression)),

    check_expression: $ => prec.left(PREC.CHECK, seq($._expression, choice(
      seq(optional("!"), $._in_operator, $._expression),
      seq(optional("!"), $._is_operator, $._type)))),

    comparison_expression: $ => prec.left(PREC.COMPARISON, seq($._expression, $._comparison_operator, $._expression)),

    equality_expression: $ => prec.left(PREC.EQUALITY, seq($._expression, $._equality_operator, $._expression)),

    conjunction_expression: $ => prec.left(PREC.CONJUNCTION, seq($._expression, "&&", $._expression)),

    disjunction_expression: $ => prec.left(PREC.DISJUNCTION, seq($._expression, "||", $._expression)),

    // Suffixes

    indexing_suffix: $ => seq("[", sep1($._expression, ","), optional(','), "]"),

    navigation_suffix: $ => seq(
      // this introduces ambiguities with 'less than' for comparisons
      optional($.type_arguments),
      $._member_access_operator,
      choice(
        seq($.simple_identifier, optional($._expression_end_hint)),
        $.parenthesized_expression,
        // `a.{ b }()` — a lambda as the selector. ILLEGAL_SELECTOR is a
        // compiler diagnostic; Kotlin's parser reads the lambda and PSI
        // builds a DOT_QUALIFIED_EXPRESSION whose selector is the call.
        $.lambda_literal,
        seq("class", optional($._expression_end_hint))
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

    // Call suffix with REQUIRED type_arguments (used by _generic_call_expression)
    _generic_call_suffix: $ => prec.left(seq(
      $.type_arguments,
      choice(
        prec(PREC.ARGUMENTS, seq(optional($.value_arguments), $.annotated_lambda)),
        $.value_arguments
      ),
      optional($._call_lambda_hint)
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

    _multi_variable_declaration_expr: $ => choice(
      seq(
        '(',
        sep1(alias($._name_based_destructuring_entry_expr, $.variable_declaration), ','),
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

    anonymous_function: $ => prec.right(seq(
      optional($.context_receiver),
      optional("suspend"),
      "fun",
      optional(seq(sep1($._simple_user_type, "."), ".")), // TODO
      // Kotlin accepts type parameters on an anonymous function in two
      // placements, and one slot here covers both: with no receiver
      // (`fun <T>() {}`) and after a receiver (`fun T.<A>(x: T): T`, which PSI
      // renders as TYPE_PARAMETER_LIST following the receiver dot). Keeping it
      // to a single slot after the optional receiver avoids two optional
      // placements competing for the same `<`.
      optional($.type_parameters),
      $.function_value_parameters,
      optional(seq(":", $._type)),
      optional($.function_body)
    )),

    _optionally_typed_parameter: $ => seq($.simple_identifier, optional(seq(":", $._type))),

    _function_literal: $ => choice(
      $.lambda_literal,
      $.anonymous_function
    ),

    object_literal: $ => choice(
      prec.dynamic(1, seq(
        optional("data"),
        "object",
        optional(seq(":", $._delegation_specifiers)),
        $.class_body,
      )),
      seq(
        optional("data"),
        "object",
        optional(seq(":", $._delegation_specifiers)),
      ),
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
    _when_subject_variable: $ => seq(
      repeat($.annotation),
      "val",
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

    callable_reference: $ => seq(
      optional(choice($._callable_reference_name, $._callable_reference_nullable)),
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

    _postfix_unary_expression: $ => seq($._primary_expression, repeat($._postfix_unary_suffix)),

    directly_assignable_expression: $ => prec(
      PREC.ASSIGNMENT,
      choice(
        $._postfix_unary_expression,
        $.simple_identifier
        // TODO
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
    modifiers: $ => repeat1(choice(
      prec.right(PREC.MODIFIERS, $.annotation),
      prec.right(PREC.MODIFIERS, $.context_receiver),
      $._modifier
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

    _type_modifier: $ => choice($.annotation, $.context_receiver, "suspend"),

    class_modifier: $ => choice(
      "sealed",
      "annotation",
      "data",
      "inner",
      "value",
    ),

    member_modifier: $ => choice(
      "override",
      "lateinit"
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
      // "out" and "in" are deliberately absent, and listing them here would
      // be dead weight: keyword extraction already lexes them as
      // `_alpha_identifier` and only promotes them to keywords in states that
      // expect one, so `val out = 1` and `class C<out out>` parse as
      // identifiers without any entry. See `type_parameter_modifiers`, which
      // is what has to bound the variance slot for that to work.
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

    _return_at: $ => seq(
      "return@",
      alias($._lexical_identifier, $.label)
    ),

    _continue_at: $ => seq(
      "continue@",
      alias($._lexical_identifier, $.label)
    ),

    _break_at: $ => seq(
      "break@",
      alias($._lexical_identifier, $.label)
    ),

    _this_at: $ => seq(
      "this@",
      alias($._lexical_identifier, $.type_identifier)
    ),

    _super_at: $ => choice(
      seq(
        "super@",
        alias($._lexical_identifier, $.type_identifier)
      ),
      seq(
        "super",
        "<", $._type, ">",
        token.immediate("@"),
        alias($._lexical_identifier, $.type_identifier)
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

    character_literal: $ => seq(
      "'",
      choice($.character_escape_seq, /[^\n\r'\\]/),
      "'"
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

    _uni_character_literal: $ => seq(
      "\\u",
      /[0-9a-fA-F]{4}/
    ),

    _escaped_identifier: $ => /\\[tbrn'"\\$]/,

  }
});

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
