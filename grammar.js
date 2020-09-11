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
	TYPE_ARGS: 17,
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

        // Possible interpretations:
        // 1:  (jump_expression  'return'  •  _expression)
        // 2:  (jump_expression  'return')  •  '['  …
        [$.jump_expression],

        // Possible interpretations:
        //  1:  '@'  (_unescaped_annotation  user_type)  •  '('  …
        //  2:  '@'  (constructor_invocation  user_type  •  value_arguments)
        [$.constructor_invocation, $._unescaped_annotation],

        [$.super_expression],
        [$.catch_block]
	],

	extras: $ => [
		$.comment,
		/\s+/ // Whitespace
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
			optional(seq(repeat1($.file_annotation), $._semi)),
			optional($.package_header),
			repeat($.import_header),
			repeat(seq($._statement, $._semi))
		),
		
		shebang_line: $ => seq("#!", /[^\r\n]*/),

		file_annotation: $ => seq(
			"@", "file", ":",
			choice(
				seq("[", repeat1($._unescaped_annotation), "]"),
				$._unescaped_annotation
			)
		),
		
		package_header: $ => seq("package", $.identifier, $._semi),
		
		import_header: $ => seq(
			"import",
			field("identifier", $.identifier,),
			optional(choice(
			            field("star", $.point_star),
			            field("alias", $.import_alias)
			        )
			),
			$._semi
		),

		point_star: $ => ".*",

		import_alias: $ => seq(
		    "as",
		    field("alias", alias($.simple_identifier, $.type_identifier))
		),

		top_level_object: $ => seq($._declaration, optional($._semis)),

		type_alias: $ => seq(
			"typealias",
			field("identifier", $.simple_identifier),
			optional($.type_arguments),
			"=",
			$._type
		),
		
		_declaration: $ => choice(
			$.class_declaration,
			$.interface_declaration,
			$.enum_class_declaration,
			$.object_declaration,
			$.function_declaration,
			$.property_declaration,
			$.type_alias
		),
		
		// ==========
		// Classes
		// ==========
		
		class_declaration: $ => prec.right(
			seq(
				optional($.modifiers),
				"class",
				field("identifier", alias($.simple_identifier, $.type_identifier)),
				optional($.type_parameters),
				optional($.primary_constructor),
				field("delegation_specifiers", optional(seq(":", $._delegation_specifiers))),
				optional($.type_constraints),
				field("body", optional($.class_body))
		    )
		),

		interface_declaration: $ => prec.right(
			seq(
				optional($.modifiers),
				seq(optional("fun"), "interface"),
				field("identifier", alias($.simple_identifier, $.type_identifier)),
				optional($.type_parameters),
				optional($.primary_constructor),
				field("delegation_specifiers", optional(seq(":", $._delegation_specifiers))),
				optional($.type_constraints),
				field("body", optional($.class_body))
		    )
		),

		enum_class_declaration: $ => prec.right(
			seq(
				optional($.modifiers),
				"enum",
				"class",
				field("identifier", alias($.simple_identifier, $.type_identifier)),
				optional($.type_parameters),
				optional($.primary_constructor),
				field("delegation_specifiers", optional(seq(":", $._delegation_specifiers))),
				optional($.type_constraints),
				field("body", optional($.enum_class_body))
			)
		),

		primary_constructor: $ => seq(
			optional(seq(optional($.modifiers), "constructor")),
			$._class_parameters
		),

		class_body: $ => seq("{", optional($._class_member_declarations), "}"),

		_class_parameters: $ => seq("(", optional(sep1($.class_parameter, ",")), ")"),

		class_parameter: $ => seq(
			optional($.modifiers),
			optional(choice("val", "var")),
			$.simple_identifier,
			":",
			$._type,
			optional(seq("=", $._expression))
		),

		_delegation_specifiers: $ => prec.left(sep1(
			$.delegation_specifier,
			// $._annotated_delegation_specifier, // TODO: Annotations cause ambiguities with type modifiers
			","
		)),

		delegation_specifier: $ => prec.left(choice(
			field("constructor_invocation", $.constructor_invocation),
			$.explicit_delegation,
			field("user_type", $.user_type),
			$.function_type
		)),

		constructor_invocation: $ => seq($.user_type, $.value_arguments),

		_annotated_delegation_specifier: $ => seq(repeat($.annotation), $.delegation_specifier),

		explicit_delegation: $ => seq(
			choice(
				$.user_type,
				$.function_type
			),
			"by",
			$._expression
		),

		type_parameters: $ => seq("<", sep1($.type_parameter, ","), ">"),

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
		
		_class_member_declarations: $ => repeat1(seq($._class_member_declaration, $._semis)),

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
			optional(alias($.simple_identifier, $.type_identifier)),
			optional(seq(":", $._delegation_specifiers)),
			optional($.class_body)
		),

		function_value_parameters: $ => seq("(", optional(sep1($._function_value_parameter, ",")), ")"),

		_function_value_parameter: $ => seq(
			optional($.parameter_modifiers),
			$.parameter,
			optional(seq("=", $._expression))
		),

		function_declaration: $ => prec.right(seq( // TODO
			optional($.modifiers),
			optional($.type_parameters),
			"fun",
			optional($.type_parameters),
			optional($._receiver_types),
			field("identifier", $.simple_identifier),
			field("parameters", $.function_value_parameters),
			optional(seq(":", $._type)),
			optional($.type_constraints),
			field("body", optional($.function_body))
		)),

        // TODO
		_receiver_types: $ => repeat1(
		    seq(optional($.type_modifiers),
		        choice(
		            $.simple_identifier
                ),
                optional($.type_arguments),
                ".")
		),

		function_body: $ => choice(
		    $._block,
		    seq("=", field("expression", $._expression))
		),

		multi_variable_declaration: $ => seq(
		    "(",
		    sep1($.variable_declaration, ","),
		    optional(","),
		    ")"
		),
		
		variable_declaration: $ => seq(
			// repeat($.annotation), TODO
			field("identifier", $.simple_identifier),
			field("type", optional(seq(":", $._type)))
		),

		property_declaration: $ => prec.right(seq(
			optional($.modifiers),
			choice("val", "var"),
			optional($.type_parameters),
			// TODO: Receiver type
			choice(
			    field("variable_declaration", $.variable_declaration),
			    field("multi_variable_declaration", $.multi_variable_declaration)
			),
			optional($.type_constraints),
			optional(choice(
				seq("=", $._expression),
				$.property_delegate
			)),
			choice(
				//optional(seq($.getter, optional(seq(optional($._semi), $.setter)))),
				//optional(seq($.setter, optional(seq(optional($._semi), $.getter)))),
				optional($.getter),
				optional($.setter),
			)
		)),

		property_delegate: $ => seq("by", $._expression),

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

		parameter: $ => seq(field("identifier", $.simple_identifier), ":", $._type),

		object_declaration: $ => prec.right(seq(
			optional($.modifiers),
			"object",
			alias($.simple_identifier, $.type_identifier),
			optional(seq(":", $._delegation_specifiers)),
			optional($.class_body)
		)),

		secondary_constructor: $ => seq(
			optional($.modifiers),
			"constructor",
			field("parameters", $.function_value_parameters),
			field("delegation_call", optional(seq(":", $.constructor_delegation_call))),
			field("body", optional($._block))
		),

		constructor_delegation_call: $ => seq(choice("this", "super"), $.value_arguments),
		
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
			choice(
				$.parenthesized_type,
				$.nullable_type,
				$._type_reference,
				$.function_type
			)
		),

		_type_reference: $ => choice(
			$.user_type,
			"dynamic"
		),

		nullable_type: $ => seq(
			field("type", choice($._type_reference, $.parenthesized_type)),
			repeat1($._quest)
		),

		_quest: $ => "?",

		// TODO: Figure out a better solution than right associativity
		//       to prevent nested types from being recognized as
		//       unary expresions with navigation suffixes.

		user_type: $ => prec.right(sep1($._simple_user_type, ".")),
		
		_simple_user_type: $ => prec.right(seq(
			field("identifier", alias($.simple_identifier, $.type_identifier)),
			optional($.type_arguments)
		)),

		type_projection: $ => choice(
			seq(optional($.type_projection_modifiers), $._type),
			"*"
		),

		type_projection_modifiers: $ => repeat1($._type_projection_modifier),

		_type_projection_modifier: $ => $.variance_modifier,

		function_type: $ => seq(
			optional(seq($._simple_user_type, ".")), // TODO: Support "real" types
			field("parameters", $.function_type_parameters),
			"->",
			$._type
		),
		
		// A higher-than-default precedence resolves the ambiguity with 'parenthesized_type'
		function_type_parameters: $ => prec.left(1, seq(
			"(",
			field("parameters", optional(sep1(choice($.parameter, $._type), ","))),
			")"
		)),

		parenthesized_type: $ => seq("(", field("type", $._type), ")"),

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
			$._declaration,
			seq(
				repeat(choice($.label, $.annotation)),
				choice(
					$.assignment,
					$._loop_statement,
					$._expression
				)
			)
		),

		label: $ => token(seq(
			/[a-zA-Z_][a-zA-Z_0-9]*/,
			"@"
		)),

		control_structure_body: $ => choice(
		    $._block,
		    field("statement", $._statement)
		),

		_block: $ => prec(PREC.BLOCK, seq("{", optional($.statements), "}")),

		_loop_statement: $ => choice(
			$.for_statement,
			$.while_statement,
			$.do_while_statement
		),
		
		for_statement: $ => prec.right(seq(
			"for",
			"(",
			repeat($.annotation),
			choice(
			    field("variable_declaration", $.variable_declaration),
			    field("multi_variable_declaration", $.multi_variable_declaration)
			),
			"in",
			field("collection", $._expression),
			")",
			field("body", optional($.control_structure_body))
		)),

		while_statement: $ => seq(
			"while",
			"(",
			field("condition", $._expression),
			")",
			choice(";", field("body", $.control_structure_body))
		),

		do_while_statement: $ => prec.right(seq(
			"do",
			field("body", $.control_structure_body),
			"while",
			"(",
			field("condition", $._expression),
			")",
		)),

		// See also https://github.com/tree-sitter/tree-sitter/issues/160
		// generic EOF/newline token
		_semi: $ => /[\r\n]+/,
		
		_semis: $ => /[\r\n]+/,
		
		assignment: $ => choice(
		    // TODO use more specific rule than `$._expression`
		    prec.left(PREC.ASSIGNMENT, seq(
		                    field("directly_assignable_expression", $.directly_assignable_expression),
		                    "=",
		                    field("expression", $._expression))),
			prec.left(PREC.ASSIGNMENT, seq($.directly_assignable_expression, $._assignment_and_operator, $._expression)),

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

		postfix_expression: $ => prec.left(PREC.POSTFIX, seq(field("expression", $._expression), $._postfix_unary_operator)),

		call_expression: $ => prec.left(PREC.POSTFIX, seq($._expression, $.call_suffix)),

		indexing_expression: $ => prec.left(PREC.POSTFIX, seq(field("expression", $._expression), field("indexing_suffix", $.indexing_suffix))),

		navigation_expression: $ => prec.left(PREC.POSTFIX, seq(field("expression", $._expression), field("navigation_suffix", $.navigation_suffix))),
		
		// TODO: Postfix type arguments conflict naturally with 'less than'.
		//       Possible solutions include listing this conflict
		//       between 'unary_expression' and 'binary_expression'
		//       in the array of LR(1) conflicts at the top.
		
		prefix_expression: $ => prec.right(PREC.PREFIX, seq(choice($.annotation, $.label, $._prefix_unary_operator), seq(field("expression", $._expression)))),

		as_expression: $ => prec.left(PREC.AS, seq(field("expression", $._expression), $._as_operator, field("type", $._type))),

		spread_expression: $ => prec.left(PREC.SPREAD, seq("*", field("expression", $._expression))),

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

		multiplicative_expression: $ => prec.left(PREC.MULTIPLICATIVE, seq(field("left", $._expression), $._multiplicative_operator, field("right", $._expression))),
		
		additive_expression: $ => prec.left(PREC.ADDITIVE, seq(field("left", $._expression), $._additive_operator, field("right", $._expression))),

		range_expression: $ => prec.left(PREC.RANGE, seq(field("left", $._expression), "..", field("right", $._expression))),

		infix_expression: $ => prec.left(PREC.INFIX, seq(field("left", $._expression), $.simple_identifier, field("right", $._expression))),

		elvis_expression: $ => prec.left(PREC.ELVIS, seq(field("left", $._expression), "?:", field("right", $._expression))),

		check_expression: $ => prec.left(PREC.CHECK, seq(field("left", $._expression), choice($._in_operator, $._is_operator), field("right", $._expression))),
		
		comparison_expression: $ => prec.left(PREC.COMPARISON, seq(field("left", $._expression), $._comparison_operator, field("right", $._expression))),

		equality_expression: $ => prec.left(PREC.EQUALITY, seq(field("left", $._expression), $._equality_operator, field("right", $._expression))),

		conjunction_expression: $ => prec.left(PREC.CONJUNCTION, seq(field("left", $._expression), "&&", field("right", $._expression))),

		disjunction_expression: $ => prec.left(PREC.DISJUNCTION, seq(field("left", $._expression), "||", field("right", $._expression))),

		// Suffixes

		indexing_suffix: $ => seq("[", sep1($._expression, ","), "]"),

		navigation_suffix: $ => seq(
			$._member_access_operator,
			choice(
				field("identifier", $.simple_identifier),
				$.parenthesized_expression,
				"class"
			)
		),

		call_suffix: $ => prec.left(seq(
			// optional($.type_arguments), // TODO: Type args conflict with 'less than', see above
			choice(
				seq(field("value_arguments", optional($.value_arguments)), field("annotated_lambda", $.annotated_lambda)),
				field("value_arguments", $.value_arguments)
			)
		)),

		annotated_lambda: $ => seq(
			repeat($.annotation),
			optional($.label),
			$.lambda_literal
		),

		type_arguments: $ => prec.left(PREC.TYPE_ARGS, seq("<", sep1($.type_projection, ","), ">")),

		value_arguments: $ => seq("(", optional(sep1($.value_argument, ",")), ")"),

		value_argument: $ => seq(
			optional($.annotation),
			optional(seq(field("value_argument_identifier", $.simple_identifier), "=")),
			optional("*"),
			field("expression", $._expression)
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
			$.try_catch_expression,
			$.jump_expression
		),

		parenthesized_expression: $ => seq("(", field("inner_expression", $._expression), ")"),

		collection_literal: $ => seq("[", $._expression, repeat(seq(",", $._expression)), "]"),

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

		null_literal : $ => "null",

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
			$._line_str_escaped_char
		),

		line_string_expression: $ => seq("${", $._expression, "}"),

		_multi_line_string_content: $ => choice($._multi_line_str_text, '"'),

		_interpolation: $ => choice(
			seq("${", alias($._expression, $.interpolated_expression), "}"),
			seq("$", alias($.simple_identifier, $.interpolated_identifier))
		),

		lambda_literal: $ => prec(PREC.LAMBDA_LITERAL, seq(
			"{",
			optional(seq(field("parameters", optional($.lambda_parameters)), "->")),
			field("statements", optional($.statements)),
			"}"
		)),

		lambda_parameters: $ => sep1($._lambda_parameter, ","),

		_lambda_parameter: $ => choice(
			$.variable_declaration, // TODO
		),

		anonymous_function: $ => seq(
			"fun",
			optional(seq(sep1($._simple_user_type, "."), ".")), // TODO
			"(", ")",
			field("body", optional($.function_body))
		),

		_function_literal: $ => choice(
			$.lambda_literal,
			$.anonymous_function
		),

		object_literal: $ => seq(
			"object",
			optional(seq(":", $._delegation_specifiers)),
			$.class_body
		),

		this_expression: $ => "this",

		super_expression: $ => seq(
			"super",
			optional(seq("<", $.simple_identifier, ">"))
			// TODO optional(seq("<", $._type, ">")),
			// TODO optional(seq("@", $.simple_identifier))
		),

		if_expression: $ => prec.right(seq(
			"if",
			"(", field("condition", $._expression), ")",
			field("true_branch", optional($.control_structure_body)),
			optional(";"),
			optional(seq(
			    "else",
				choice(field("else_branch", $.control_structure_body), ";")
			))
		)),

		when_subject: $ => seq(
			"(",
			optional(seq(
				repeat($.annotation),
				"val",
				$.variable_declaration,
				"="
			)),
			field("expression", $._expression),
			")",
		),

		when_expression: $ => seq(
			"when",
			field("subject", optional($.when_subject)),
			"{",
			field("entries", repeat($.when_entry)),
			"}"
		),

		when_entry: $ => seq(
			choice(
				field("conditions", sep1($.when_condition, ",")),
				field("conditions", $.when_entry_else)
			),
			"->",
			field("body", $.control_structure_body),
			optional($._semi)
		),

		when_entry_else: $ => "else",

		when_condition: $ => choice(
			field("expression", $._expression),
			field("range_test", $.range_test),
			field("type_test", $.type_test)
		),

		range_test: $ => seq($._in_operator, field("expression", $._expression)),

		type_test: $ => seq($._is_operator, field("expression", $._expression)),

		try_catch_expression: $ => seq(
			"try",
			$._block,
			choice(
				seq(field("catch_blocks", repeat1($.catch_block)), field("finally_block", optional($.finally_block))),
				field("finally_block", $.finally_block)
			)
		),

		catch_block: $ => seq(
			"catch",
			"(",
			repeat($.annotation),
			field("identifier", $.simple_identifier),
			":",
			field("type", $._type),
			")",
			$._block,
			// it looks like that tree-sitter will `eat` these tokens
			optional(repeat(choice(
			    "\n",
			    "\r",
			    "\t",
			    " "
			)))
		),

		finally_block: $ => seq("finally", $._block),

		jump_expression: $ => choice(
			seq("throw", field("throw_expression", $._expression)),
			seq(choice("return", $._return_at), field("return_expression", optional($._expression))),
			"continue",
			$._continue_at,
			"break",
			$._break_at
		),

		callable_reference: $ => seq(
			optional(alias($.simple_identifier, $.type_identifier)), // TODO
			"::",
			choice($.simple_identifier, "class")
		),

		_assignment_and_operator: $ => choice("+=", "-=", "*=", "/=", "%="),
		
		_equality_operator: $ => choice("!=", "!==", "==", "==="),
		
		_comparison_operator: $ => choice("<", ">", "<=", ">="),
		
		_in_operator: $ => choice("in", "!in"),
		
		_is_operator: $ => choice("is", $._not_is),
		
		_additive_operator: $ => choice("+", "-"),
		
		_multiplicative_operator: $ => choice("*", "/", "%"),
		
		_as_operator: $ => choice("as", "as?"),
		
		_prefix_unary_operator: $ => choice("++", "--", "-", "+", "!"),
		
		_postfix_unary_operator: $ => choice("++", "--", "!!"),
		
		_member_access_operator: $ => choice(".", $._safe_nav, "::"),
		
		_safe_nav: $ => "?.",      // TODO: '?' and '.' should actually be separate tokens
		                           //       but produce an LR(1) conflict that way, however.
		                           //       ('as' expression with '?' produces conflict). Also
		                           //       does it seem to be very uncommon to write the safe
		                           //       navigation operator 'split up' in Kotlin.

		directly_assignable_expression: $ => choice(
			field("simple_identifier", $.simple_identifier),
			$.indexing_expression,
			$.navigation_expression,
			// TODO
		),

		// ==========
		// Modifiers
		// ==========
		
		modifiers: $ => choice(
		    $.annotation,
		    repeat1($._modifier),
		    seq($.annotation, repeat1($._modifier)),
		    seq(repeat1($._modifier), $.annotation)
		),

		parameter_modifiers: $ => choice($.annotation, repeat1($.parameter_modifier)),

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
			$.single_annotation,
			$.multi_annotation,
		),

		single_annotation: $ => choice(
		    seq($.annotation_use_site_target, $._unescaped_annotation),
		    seq("@", $._unescaped_annotation)
		),

		multi_annotation: $ => choice(
		    seq(
		        $.annotation_use_site_target,
		        "[",
		        repeat1($._unescaped_annotation),
		        "]"
		    ),
		    seq(
		        "@",
		        "[",
		        repeat1($._unescaped_annotation),
		        "]"
		    )
		),

		annotation_use_site_target: $ => seq(
		    "@",
		    choice(
		        "field", "property", "get", "set", "receiver", "param", "setparam", "delegate"
		    ),
		    ":"
		),

		_unescaped_annotation: $ => choice(
			$.constructor_invocation,
			$.user_type
		),
		
		// ==========
		// Identifiers
		// ==========
		
		simple_identifier: $ => $._lexical_identifier, // TODO
		
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

		_not_is: $ => "!is",

		_not_in: $ => "!in",
		
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
			choice($._escape_seq, /[^\n\r'\\]/),
			"'"
		),

		
		// ==========
		// Identifiers
		// ==========
		
		_lexical_identifier: $ => choice(
			/[a-zA-Z_][a-zA-Z_0-9]*/,
			/`[^\r\n`]+`/
		),

		_uni_character_literal: $ => seq(
			"\\",
			"u",
			/[0-9a-fA-F]{4}/
		),

		_escaped_identifier: $ => /\\[tbrn'"\\$]/,

		_escape_seq: $ => choice(
			$._uni_character_literal,
			$._escaped_identifier
		),

		// ==========
		// Strings
		// ==========
		
		_line_str_text: $ => /[^\\"$]+/,
		
		_line_str_escaped_char: $ => choice(
			$._escaped_identifier,
			$._uni_character_literal
		),
		
		_multi_line_str_text: $ => /[^"$]+/
	}
});

function sep1(rule, separator) {
	return seq(rule, repeat(seq(separator, rule)));
}
