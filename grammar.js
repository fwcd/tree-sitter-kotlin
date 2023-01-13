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
  SPREAD: 2,
  SIMPLE_USER_TYPE: 2,
  VAR_DECL: 1,
  ASSIGNMENT: 1,
  BLOCK: 1,
  LAMBDA_LITERAL: 0,
  RETURN_OR_THROW: 0,
  COMMENT: 0
};
const DEC_DIGITS = token(sep1(/[0-9]+/, /_+/));
const HEX_DIGITS = token(sep1(/[0-9a-fA-F]+/, /_+/));
const BIN_DIGITS = token(sep1(/[01]/, /_+/));
const REAL_EXPONENT = token(seq(/[eE]/, optional(/[+-]/), DEC_DIGITS))

module.exports = grammar({
  name: "kotlin",

  conflicts: $ => [
    // Ambiguous when used in an explicit delegation expression,
    // since the '{' could either be interpreted as the class body
    // or as the anonymous function body. Consider the following sequence:
    //
    // 'class'  simple_identifier  ':'  user_type  'by'  'fun'  '('  ')'  •  '{'  …
    //
    // Possible interpretations:
    //
    // 'class'  simple_identifier  ':'  user_type  'by'  (anonymous_function  'fun'  '('  ')'  •  function_body)
    // 'class'  simple_identifier  ':'  user_type  'by'  (anonymous_function  'fun'  '('  ')')  •  '{'  …
    [$.anonymous_function],

    // Member access operator '::' conflicts with callable reference
    [$._primary_expression, $.callable_reference],

    // @Type(... could either be an annotation constructor invocation or an annotated expression
    [$.constructor_invocation, $._unescaped_annotation],

    // "expect" as a plaform modifier conflicts with expect as an identifier
    [$.platform_modifier, $.simple_identifier],
    // "data", "inner" as class modifier or id
    [$.class_modifier, $.simple_identifier],

    // "<x>.<y> = z assignment conflicts with <x>.<y>() function call"
    [$._postfix_unary_expression, $._expression],

    // ambiguity between generics and comparison operations (foo < b > c)
    [$.call_expression, $.prefix_expression, $.comparison_expression],
    [$.call_expression, $.range_expression, $.comparison_expression],
    [$.call_expression, $.elvis_expression, $.comparison_expression],
    [$.call_expression, $.check_expression, $.comparison_expression],
    [$.call_expression, $.additive_expression, $.comparison_expression],
    [$.call_expression, $.infix_expression, $.comparison_expression],
    [$.call_expression, $.multiplicative_expression, $.comparison_expression],
    [$.type_arguments, $._comparison_operator],

    // ambiguity between prefix expressions and annotations before functions
    [$._statement, $.prefix_expression],
    [$._statement, $.prefix_expression, $.modifiers],
    [$.prefix_expression, $.when_subject],
    [$.prefix_expression, $.value_argument],

    // ambiguity between multiple user types and class property/function declarations
    [$.user_type],
    [$.user_type, $.anonymous_function],
    [$.user_type, $.function_type],

    // ambiguity between annotated_lambda with modifiers and modifiers from var declarations
    [$.annotated_lambda, $.modifiers],

    // ambiguity between simple identifier 'set/get' with actual setter/getter functions.
    [$.setter, $.simple_identifier],
    [$.getter, $.simple_identifier],

    // ambiguity between parameter modifiers in anonymous functions
    [$.parameter_modifiers, $._type_modifier],
  ],

  externals: $ => [
    $._automatic_semicolon,
    $._import_list_delimiter,
    $.safe_nav,
  ],

  extras: $ => [
    $.comment,
    /\s+/ // Whitespace
  ],

  word: $ => $._alpha_identifier,

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
      repeat($.import_list),
      repeat(seq($._statement, $._semi))
    ),

    shebang_line: $ => seq("#!", /[^\r\n]*/),

    file_annotation: $ => seq(
      "@", "file", ":",
      choice(
        seq("[", repeat1($._unescaped_annotation), "]"),
        $._unescaped_annotation
      ),
      $._semi
    ),

    package_header: $ => seq("package", $.identifier, $._semi),

    import_list: $ => seq(
      repeat1($.import_header),
      $._import_list_delimiter
    ),

    import_header: $ => seq(
      "import",
      $.identifier,
      optional(choice(seq(".*"), $.import_alias)),
      $._semi
    ),

    import_alias: $ => seq("as", field('name', alias($.simple_identifier, $.type_identifier))),

    top_level_object: $ => seq(field('declaration', $._declaration), optional($._semi)),

    type_alias: $ => seq(
      optional(field('modifiers', $.modifiers)),
      "typealias",
      field('name', alias($.simple_identifier, $.type_identifier)),
      "=",
      field('type', $._type)
    ),

    _declaration: $ => choice(
      $.class_declaration,
      $.object_declaration,
      $.function_declaration,
      $.property_declaration,
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

    class_declaration: $ => prec.right(choice(
      seq(
        optional(field('modifiers', $.modifiers)),
        field('kind', choice("class", "interface")),
        field('name', alias($.simple_identifier, $.type_identifier)),
        optional(field('type_parameters', $.type_parameters)),
        optional(field('primary_constructor', $.primary_constructor)),
        optional(seq(":", field('delegation_specifiers', $._delegation_specifiers))),
        optional(field('constraints', $.type_constraints)),
        optional(field('body', $.class_body))
      ),
      seq(
        optional($.modifiers),
        field('kind', "enum"), "class",
        field('name', alias($.simple_identifier, $.type_identifier)),
        optional(field('type_parameters', $.type_parameters)),
        optional(field('primary_constructor', $.primary_constructor)),
        optional(seq(":", field('delegation_specifiers', $._delegation_specifiers))),
        optional(field('constraints', $.type_constraints)),
        optional(field('body', $.enum_class_body))
      )
    )),

    primary_constructor: $ => seq(
      optional(seq(optional($.modifiers), "constructor")),
      field('class_parameters', $._class_parameters)
    ),

    class_body: $ => seq("{", optional($._class_member_declarations), "}"),

    _class_parameters: $ => seq(
      "(",
      optional(sep1(field('class_parameter', $.class_parameter), ",")),
      optional(","),
      ")"
    ),

    class_parameter: $ => seq(
      optional(field('modifiers', $.modifiers)),
      optional(field('parameter_kind', choice("val", "var"))),
      field('parameter_name', $.simple_identifier),
      ":",
      field('parameter_type', $._type),
      optional(seq("=", field('initializer', $._expression)))
    ),

    _delegation_specifiers: $ => prec.left(sep1(
      $.delegation_specifier,
      // $._annotated_delegation_specifier, // TODO: Annotations cause ambiguities with type modifiers
      ","
    )),

    delegation_specifier: $ => prec.left(choice(
      $.constructor_invocation,
      $.explicit_delegation,
      $.user_type,
      $.function_type
    )),

    constructor_invocation: $ => seq(field('type', $.user_type), field('arguments', $.value_arguments)),

    _annotated_delegation_specifier: $ => seq(repeat($.annotation), $.delegation_specifier),

    explicit_delegation: $ => seq(
      field('type', choice(
        $.user_type,
        $.function_type
      )),
      "by",
      field('expression', $._expression)
    ),

    type_parameters: $ => seq("<", sep1($.type_parameter, ","), ">"),

    type_parameter: $ => seq(
      optional($.type_parameter_modifiers),
      field('name', alias($.simple_identifier, $.type_identifier)),
      optional(seq(":", field('type', $._type)))
    ),

    type_constraints: $ => prec.right(seq("where", sep1(field('constraint', $.type_constraint), ","))),

    type_constraint: $ => seq(
      repeat($.annotation),
      field('name', alias($.simple_identifier, $.type_identifier)),
      ":",
      field('type', $._type)
    ),

    // ==========
    // Class members
    // ==========

    _class_member_declarations: $ => repeat1(seq($._class_member_declaration, $._semi)),

    _class_member_declaration: $ => choice(
      $._declaration,
      $.companion_object,
      $.anonymous_initializer,
      $.secondary_constructor
    ),

    anonymous_initializer: $ => seq("init", $._block),

    companion_object: $ => seq(
      optional($.modifiers),
      "companion",
      "object",
      optional(field('name', alias($.simple_identifier, $.type_identifier))),
      optional(seq(":", $._delegation_specifiers)),
      field('body', optional($.class_body))
    ),

    _function_value_parameters: $ => seq(
      "(",
      optional(sep1(field('parameter', $._function_value_parameter), ",")),
      optional(","),
      ")"
    ),

    _function_value_parameter: $ => seq(
      optional($.parameter_modifiers),
      field('parameter', $.parameter),
      optional(seq("=", field('initializer', $._expression)))
    ),

    _receiver_type: $ => seq(
      optional($.type_modifiers),
      field('type', choice (
        $._type_reference,
        $.parenthesized_type,
        $.nullable_type
      ))
    ),

    function_declaration: $ => prec.right(seq( // TODO
      optional($.modifiers),
      "fun",
      optional($.type_parameters),
      optional(seq(field('receiver', $._receiver_type), optional('.'))),
      field('name', $.simple_identifier),
      field('parameters', $._function_value_parameters),
      optional(seq(":", field('return_type', $._type))),
      optional($.type_constraints),
      optional(field('body', $.function_body))
    )),

    function_body: $ => choice(field('block', $._block), seq("=", field('expression', $._expression))),

    variable_declaration: $ => prec.left(PREC.VAR_DECL, seq(
      // repeat($.annotation), TODO
      field('name', $.simple_identifier),
      optional(seq(":", field('type', $._type)))
    )),

    property_declaration: $ => prec.right(seq(
      optional($.modifiers),
      choice("val", "var"),
      optional($.type_parameters),
      optional(seq(field('receiver_type', $._receiver_type), optional('.'))),
      field('variable_declaration', choice($.variable_declaration, $.multi_variable_declaration)),
      optional($.type_constraints),
      optional(choice(
        seq("=", $._expression),
        field('delegate', $.property_delegate)
      )),
      optional(';'),
      choice(
        // TODO: Getter-setter combinations
        optional($.getter),
        optional($.setter)
      )
    )),

    property_delegate: $ => seq("by", field('expression', $._expression)),

    getter: $ => prec.right(seq(
      optional($.modifiers),
      "get",
      optional(seq(
        "(", ")",
        optional(seq(":", field('type', $._type))),
        field('body', $.function_body)
      ))
    )),

    setter: $ => prec.right(seq(
      optional($.modifiers),
      "set",
      optional(seq(
        "(",
        $.parameter_with_optional_type,
        ")",
        optional(seq(":", field('type', $._type))),
        field('body', $.function_body)
      ))
    )),

    parameters_with_optional_type: $ => seq("(", sep1($.parameter_with_optional_type, ","), ")"),

    parameter_with_optional_type: $ => seq(
      field('modifiers', optional($.parameter_modifiers)),
      field('name', $.simple_identifier),
      optional(seq(":", field('type', $._type)))
    ),

    parameter: $ => seq(
      field('name', $.simple_identifier),
      ":",
      field('type', $._type)
    ),

    object_declaration: $ => prec.right(seq(
      optional($.modifiers),
      "object",
      field('name', alias($.simple_identifier, $.type_identifier)),
      optional(seq(":", $._delegation_specifiers)),
      optional(field('body', $.class_body))
    )),

    secondary_constructor: $ => seq(
      optional($.modifiers),
      "constructor",
      field('parameters', $._function_value_parameters),
      optional(seq(":", $.constructor_delegation_call)),
      field('block', optional($._block))
    ),

    constructor_delegation_call: $ => seq(field('this', choice("this", "super")), field('arguments', $.value_arguments)),

    // ==========
    // Enum classes
    // ==========

    enum_class_body: $ => seq(
      "{",
      optional($._enum_entries),
      optional(seq(";", optional($._class_member_declarations))),
      "}"
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
      field('type', choice(
        $.parenthesized_type,
        $.nullable_type,
        $._type_reference,
        $.function_type
      ))
    ),

    _type_reference: $ => choice(
      field('user_type', $.user_type),
      "dynamic"
    ),

    nullable_type: $ => seq(
      field('type', choice($._type_reference, $.parenthesized_type)),
      repeat1($._quest)
    ),

    _quest: $ => "?",

    // TODO: Figure out a better solution than right associativity
    //       to prevent nested types from being recognized as
    //       unary expresions with navigation suffixes.

    user_type: $ => sep1(field('part', $._simple_user_type), "."),

    _simple_user_type: $ => prec.right(PREC.SIMPLE_USER_TYPE, seq(
      field('name', alias($.simple_identifier, $.type_identifier)),
      optional($.type_arguments)
    )),

    type_projection: $ => choice(
      seq(optional($.type_projection_modifiers), $._type),
      "*"
    ),

    type_projection_modifiers: $ => repeat1($._type_projection_modifier),

    _type_projection_modifier: $ => $.variance_modifier,

    function_type: $ => seq(
      optional(seq(field('part', $._simple_user_type), ".")), // TODO: Support "real" types
      $.function_type_parameters,
      "->",
      field('return_type', $._type)
    ),

    // A higher-than-default precedence resolves the ambiguity with 'parenthesized_type'
    function_type_parameters: $ => prec.left(1, seq(
      "(",
      optional(sep1(choice(field('parameter', $.parameter), field('type', $._type)), ",")),
      ")"
    )),

    parenthesized_type: $ => seq("(", field('type', $._type), ")"),

    parenthesized_user_type: $ => seq(
      "(",
      field("type", choice($.user_type, $.parenthesized_user_type)),
      ")"
    ),

    // ==========
    // Statements
    // ==========

    statements: $ => seq(
      field('statement', $._statement),
      repeat(seq($._semi, field('statement', $._statement))),
      optional($._semi),
    ),

    _statement: $ => choice(
      field('declaration', $._declaration),
      seq(
        repeat(choice($.label, $.annotation)),
        choice(
          field('assignment', $.assignment),
          field('loop', $._loop_statement),
          field('expression', $._expression)
        )
      )
    ),

    label: $ => token(seq(
      /[a-zA-Z_][a-zA-Z_0-9]*/,
      "@"
    )),

    control_structure_body: $ => choice(field('block', $._block), field('statement', $._statement)),

    _block: $ => prec(
      PREC.BLOCK,
      seq("{", optional(field('statements', $.statements)), "}")
    ),

    _loop_statement: $ => choice(
      field('for', $.for_statement),
      field('while', $.while_statement),
      field('do', $.do_while_statement)
    ),

    for_statement: $ => prec.right(seq(
      "for",
      "(",
      field('annotations', repeat($.annotation)),
      field('variables', choice($.variable_declaration, $.multi_variable_declaration)),
      "in",
      field('sequence', $._expression),
      ")",
      field('loop_body', optional($.control_structure_body))
    )),

    while_statement: $ => seq(
      "while",
      "(",
      field('condition', $._expression),
      ")",
      field('body', choice(";", $.control_structure_body))
    ),

    do_while_statement: $ => prec.right(seq(
      "do",
      field('loop_body', optional($.control_structure_body)), // TODO: move inside
      "while",
      "(",
      field('condition', $._expression),
      ")",
    )),

    // See also https://github.com/tree-sitter/tree-sitter/issues/160
    // generic EOF/newline token
    _semi: $ => $._automatic_semicolon,

    assignment: $ => choice(
      prec.left(PREC.ASSIGNMENT, seq(
        field('target', $.directly_assignable_expression), 
        field('operator', $._assignment_and_operator), 
        field('value', $._expression))),
      prec.left(PREC.ASSIGNMENT, seq(
        field('target', $.directly_assignable_expression), 
        field('operator', "="), 
        field('value', $._expression))),
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
      $.call_expression,
      $.indexing_expression,
      $.navigation_expression,
      $.prefix_expression,
      $.as_expression,
      $.spread_expression
    ),

    postfix_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $._postfix_unary_operator)),

    call_expression: $ => prec.left(
      PREC.POSTFIX,
      seq(
        field('expression', $._expression),
        field('suffix', $.call_suffix))),

    indexing_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $.indexing_suffix)),

    navigation_expression: $ => prec.left(
      PREC.POSTFIX,
      seq(
        field('expression', $._expression),
        field('suffix', $.navigation_suffix))),

    prefix_expression: $ => prec.right(seq(
      field('prefix', choice(
        $.annotation,
        $.label,
        $._prefix_unary_operator)),
      field('expression', $._expression))),

    as_expression: $ => prec.left(PREC.AS, seq(field('expression', $._expression), $._as_operator, field('type', $._type))),

    spread_expression: $ => prec.left(PREC.SPREAD, seq("*", field('expression', $._expression))),

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
      $.comparison_expression,
      $.equality_expression,
      $.conjunction_expression,
      $.disjunction_expression
    ),

    multiplicative_expression: $ => prec.left(PREC.MULTIPLICATIVE, seq($._expression, $._multiplicative_operator, $._expression)),

    additive_expression: $ => prec.left(PREC.ADDITIVE, seq($._expression, $._additive_operator, $._expression)),

    range_expression: $ => prec.left(PREC.RANGE, seq($._expression, "..", $._expression)),

    infix_expression: $ => prec.left(PREC.INFIX, seq($._expression, $.simple_identifier, $._expression)),

    elvis_expression: $ => prec.left(PREC.ELVIS, seq($._expression, "?:", $._expression)),

    check_expression: $ => prec.left(PREC.CHECK, seq(
      field('left_expression', $._expression),
      choice(
        seq(field('in_operator', $._in_operator), field('right_expression', $._expression)),
        seq(field('is_operator', $._is_operator), field('right_type', $._type))))),

    comparison_expression: $ => prec.left(PREC.COMPARISON, seq($._expression, $._comparison_operator, $._expression)),

    equality_expression: $ => prec.left(PREC.EQUALITY, seq($._expression, $._equality_operator, $._expression)),

    conjunction_expression: $ => prec.left(PREC.CONJUNCTION, seq($._expression, "&&", $._expression)),

    disjunction_expression: $ => prec.left(PREC.DISJUNCTION, seq($._expression, "||", $._expression)),

    // Suffixes

    indexing_suffix: $ => seq("[", sep1($._expression, ","), "]"),

    navigation_suffix: $ => seq(
      field('operator', $._member_access_operator),
      field('selector', choice(
        $.simple_identifier,
        $.parenthesized_expression,
        "class"
      ))
    ),

    call_suffix: $ => prec.left(seq(
      // this introduces ambiguities with 'less than' for comparisons
      optional(field('type_arguments', $.type_arguments)),
      choice(
        seq(
          optional(field('value_arguments_before_lambda', $.value_arguments)),
          field('trailing_lambda', $.annotated_lambda)),
        field('value_arguments', $.value_arguments)
      )
    )),

    annotated_lambda: $ => seq(
      field('annotation', repeat($.annotation)),
      field('label', optional($.label)),
      field('lambda', $.lambda_literal)
    ),

    type_arguments: $ => seq(
      "<",
      sep1($.type_projection, ","),
      ">"
    ),

    value_arguments: $ => seq(
      "(",
      field('argument_list',
        optional(
          seq(
            sep1($.value_argument, ","),
            optional(","),
          )
        )
      ),
      ")"
    ),

    value_argument: $ => seq(
      field('annotation', optional($.annotation)),
      optional(seq($.simple_identifier, "=")),
      optional("*"),
      field('expression', $._expression)
    ),

    _primary_expression: $ => choice(
      $.parenthesized_expression,
      $.simple_identifier,
      $._literal_constant,
      $._string_literal,
      $.callable_reference,
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

    parenthesized_expression: $ => seq(
      "(",
      field('expression', $._expression),
      ")"
    ),

    collection_literal: $ => seq(
      "[",
      field('first', $._expression),
      field('rest', repeat(seq(",", $._expression))),
      "]"
    ),

    _literal_constant: $ => choice(
      $.boolean_literal,
      $.integer_literal,
      $.hex_literal,
      $.bin_literal,
      $.character_literal,
      $.real_literal,
      "null",
      $.long_literal,
      $.unsigned_literal
    ),

    _string_literal: $ => choice(
      $.line_string_literal,
      $.multi_line_string_literal
    ),

    line_string_literal: $ => seq('"', repeat(choice($._line_string_content, $._interpolation)), '"'),

    multi_line_string_literal: $ => seq(
      '"""',
      repeat(choice(
        $._multi_line_string_content,
        $._interpolation
      )),
      '"""'
    ),

    _line_string_content: $ => choice(
      $._line_str_text,
      $.character_escape_seq
    ),

    line_string_expression: $ => seq("${", $._expression, "}"),

    _multi_line_string_content: $ => choice($._multi_line_str_text, '"'),

    _interpolation: $ => choice(
      seq("${", alias($._expression, $.interpolated_expression), "}"),
      seq("$", alias($.simple_identifier, $.interpolated_identifier))
    ),

    lambda_literal: $ => prec(PREC.LAMBDA_LITERAL, seq(
      "{",
      optional(seq(optional(field('parameters', $.lambda_parameters)), "->")),
      field('statements', optional($.statements)),
      "}"
    )),

    multi_variable_declaration: $ => seq(
      '(',
      sep1($.variable_declaration, ','),
      ')'
    ),

    lambda_parameters: $ => sep1(field('parameter', $._lambda_parameter), ","),

    _lambda_parameter: $ => choice(
      $.variable_declaration,
      $.multi_variable_declaration
    ),

    anonymous_function: $ => prec.right(seq(
      "fun",
      optional(field('receiver', seq(sep1(field('part', $._simple_user_type), "."), "."))), // TODO
      field('parameters', $._function_value_parameters),
      optional(seq(":", field('type', $._type))),
      optional(field("body", $.function_body))
    )),

    _function_literal: $ => choice(
      field('lambda', $.lambda_literal),
      field('fun', $.anonymous_function)
    ),

    object_literal: $ => seq(
      "object",
      optional(seq(":", $._delegation_specifiers)),
      field('body', $.class_body)
    ),

    this_expression: $ => "this",

    super_expression: $ => seq(
      "super",
      // TODO optional(seq("<", $._type, ">")),
      // TODO optional(seq("@", $.simple_identifier))
    ),

    if_expression: $ => prec.right(seq(
      "if",
      "(", field('condition', $._expression), ")",
      choice(
        field('then_branch', $.control_structure_body),
        ";",
        seq(
          optional(field('then_branch', $.control_structure_body)),
          optional(";"),
          "else",
          choice(field('else_branch', $.control_structure_body), ";")
        )
      )
    )),

    when_subject: $ => seq(
      "(",
      optional(seq(
        repeat($.annotation),
        "val",
        $.variable_declaration,
        "="
      )),
      $._expression,
      ")",
    ),

    when_expression: $ => seq(
      "when",
      optional($.when_subject),
      "{",
      repeat($.when_entry),
      "}"
    ),

    when_entry: $ => seq(
      choice(
        seq($.when_condition, repeat(seq(",", $.when_condition))),
        "else"
      ),
      "->",
      $.control_structure_body,
      optional($._semi)
    ),

    when_condition: $ => choice(
      $._expression,
      $.range_test,
      $.type_test
    ),

    range_test: $ => seq($._in_operator, field('expression', $._expression)),

    type_test: $ => seq($._is_operator, field('type', $._type)),

    try_expression: $ => seq( // TODO: fix the grammar quirk here
      "try",
      field('try', $._block),
      choice(
        field('finally', $.finally_block),
        seq(repeat1(field('catch', $.catch_block)), field('finally', $.finally_block)),
        repeat1(field('catch', $.catch_block)),
      )
    ),

    catch_block: $ => seq(
      "catch",
      "(",
      repeat($.annotation),
      field('variable', $.simple_identifier),
      ":",
      field('type', $._type),
      ")",
      field('block', $._block),
    ),

    finally_block: $ => seq("finally", field('block', $._block)),

    jump_expression: $ => choice(
      prec.right(PREC.RETURN_OR_THROW, seq("throw", $._expression)),
      prec.right(PREC.RETURN_OR_THROW, seq(choice("return", $._return_at), optional($._expression))),
      "continue",
      $._continue_at,
      "break",
      $._break_at
    ),

    callable_reference: $ => seq(
      optional(field('type', alias($.simple_identifier, $.type_identifier))), // TODO
      "::",
      choice(field('member', $.simple_identifier), "class")
    ),

    _assignment_and_operator: $ => choice("+=", "-=", "*=", "/=", "%="),

    _equality_operator: $ => choice("!=", "!==", "==", "==="),

    _comparison_operator: $ => choice("<", ">", "<=", ">="),

    _in_operator: $ => choice("in", "!in"),

    _is_operator: $ => choice("is", "!is"),

    _additive_operator: $ => choice("+", "-"),

    _multiplicative_operator: $ => choice("*", "/", "%"),

    _as_operator: $ => choice("as", "as?"),

    _prefix_unary_operator: $ => choice("++", "--", "-", "+", "!"),

    _postfix_unary_operator: $ => choice("++", "--", "!!"),

    _member_access_operator: $ => choice(".", "::", alias($.safe_nav, '?.')),

    _indexing_suffix: $ => seq(
      '[',
      $._expression,
      repeat(seq(',', $._expression)),
      optional(','),
      ']'
    ),

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

    modifiers: $ => prec.left(repeat1(choice($.annotation, $._modifier))),

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

    _type_modifier: $ => choice($.annotation, "suspend"),

    class_modifier: $ => choice(
      "sealed",
      "annotation",
      "data",
      "inner"
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

    type_parameter_modifiers: $ => repeat1($._type_parameter_modifier),

    _type_parameter_modifier: $ => choice(
      $.reification_modifier,
      $.variance_modifier,
      $.annotation
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
      choice("field", "property", "get", "set", "receiver", "param", "setparam", "delegate"),
      ":"
    ),

    _unescaped_annotation: $ => choice(
      $.constructor_invocation,
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
      "actual",
      "set",
      "get"
      // TODO: More soft keywords
    ),

    identifier: $ => sep1($.simple_identifier, "."),

    // ====================
    // Lexical grammar
    // ====================


    // ==========
    // General
    // ==========

    // Source: https://github.com/tree-sitter/tree-sitter-java/blob/bc7124d924723e933b6ffeb5f22c4cf5248416b7/grammar.js#L1030
    comment: $ => token(prec(PREC.COMMENT, choice(
      seq("//", /.*/),
      seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")
    ))),

    // ==========
    // Separators and operations
    // ==========


    // ==========
    // Keywords
    // ==========

    _return_at: $ => seq("return@", $._lexical_identifier),

    _continue_at: $ => seq("continue@", $._lexical_identifier),

    _break_at: $ => seq("break@", $._lexical_identifier),

    _this_at: $ => seq("this@", $._lexical_identifier),

    _super_at: $ => seq("super@", $._lexical_identifier),

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

    integer_literal: $ => token(seq(optional(/[1-9]/), DEC_DIGITS)),

    hex_literal: $ => token(seq("0", /[xX]/, HEX_DIGITS)),

    bin_literal: $ => token(seq("0", /[bB]/, BIN_DIGITS)),

    unsigned_literal: $ => seq(
      choice($.integer_literal, $.hex_literal, $.bin_literal),
      /[uU]/,
      optional("L")
    ),

    long_literal: $ => seq(
      choice($.integer_literal, $.hex_literal, $.bin_literal),
      "L"
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

    // ==========
    // Identifiers
    // ==========

    _lexical_identifier: $ => choice(
      $._alpha_identifier,
      $._backtick_identifier,
    ),

    _alpha_identifier: $ => /[a-zA-Z_][a-zA-Z_0-9]*/,

    _backtick_identifier: $ => /`[^\r\n`]+`/,

    _uni_character_literal: $ => seq(
      "\\u",
      /[0-9a-fA-F]{4}/
    ),

    _escaped_identifier: $ => /\\[tbrn'"\\$]/,

    // ==========
    // Strings
    // ==========

    _line_str_text: $ => /[^\\"$]+/,

    _multi_line_str_text: $ => /[^"$]+/
  }
});

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
