"""Node name mapping between tree-sitter-kotlin and JetBrains PSI.

This module defines the correspondence between tree-sitter-kotlin node names
(snake_case) and JetBrains PSI composite node names (UPPER_CASE).

The mapping is derived from:
- tree-sitter: src/node-types.json (136 named nodes)
- JetBrains: tools/cross-validation/fixtures/*.txt (112 composite nodes)
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# TS_TO_PSI: direct name mappings
# ---------------------------------------------------------------------------
# Maps a tree-sitter node name to its PSI composite node equivalent.
# Value is None if there is no single PSI equivalent (requires special handling).

TS_TO_PSI: dict[str, str | None] = {
    # Top-level
    "source_file": "KtFile",
    "package_header": "PACKAGE_DIRECTIVE",
    "import_list": "IMPORT_LIST",
    "import_header": "IMPORT_DIRECTIVE",
    "import_alias": "IMPORT_ALIAS",
    "wildcard_import": None,  # represented by PsiElement(MUL) in IMPORT_DIRECTIVE

    # Class-related
    "class_declaration": "CLASS",
    "class_body": "CLASS_BODY",
    "class_parameter": "VALUE_PARAMETER",  # inside VALUE_PARAMETER_LIST
    "companion_object": "OBJECT_DECLARATION",  # companion objects are OBJECT_DECLARATION in PSI
    "object_declaration": "OBJECT_DECLARATION",
    "object_literal": "OBJECT_LITERAL",
    "enum_class_body": "CLASS_BODY",  # PSI uses CLASS_BODY for enum bodies too
    "enum_entry": "ENUM_ENTRY",
    "type_alias": "TYPEALIAS",

    # Constructors
    "primary_constructor": "PRIMARY_CONSTRUCTOR",
    "secondary_constructor": "SECONDARY_CONSTRUCTOR",
    "constructor_delegation_call": "CONSTRUCTOR_DELEGATION_CALL",
    "constructor_invocation": None,  # part of SUPER_TYPE_CALL_ENTRY chain

    # Functions
    "function_declaration": "FUN",
    "function_body": "BLOCK",  # block bodies match PSI BLOCK; expression bodies handled in normalizer
    "function_value_parameters": "VALUE_PARAMETER_LIST",
    "parameter": "VALUE_PARAMETER",
    "parameter_with_optional_type": "VALUE_PARAMETER",  # lambda parameter with optional type
    "getter": "PROPERTY_ACCESSOR",
    "setter": "PROPERTY_ACCESSOR",
    "anonymous_function": "FUN",  # anonymous functions are also FUN in PSI

    # Properties
    "property_declaration": "PROPERTY",
    "property_delegate": "PROPERTY_DELEGATE",

    # Types
    "type_parameters": "TYPE_PARAMETER_LIST",
    "type_parameter": "TYPE_PARAMETER",
    "type_arguments": "TYPE_ARGUMENT_LIST",
    "type_projection": "TYPE_PROJECTION",
    "user_type": "USER_TYPE",
    "function_type": "FUNCTION_TYPE",
    "function_type_parameters": "VALUE_PARAMETER_LIST",  # PSI wraps fn type params in VALUE_PARAMETER_LIST
    "nullable_type": "NULLABLE_TYPE",
    "not_nullable_type": None,  # no direct PSI equivalent, PSI uses TYPE_REFERENCE
    "parenthesized_type": "PARENTHESIZED",  # PSI uses PARENTHESIZED for parenthesized types
    "parenthesized_user_type": None,  # no direct PSI equivalent
    "type_constraints": "TYPE_CONSTRAINT_LIST",
    "type_constraint": "TYPE_CONSTRAINT",
    "receiver_type": "FUNCTION_TYPE_RECEIVER",  # extension function receiver

    # Delegation / Inheritance
    "delegation_specifier": None,  # maps to SUPER_TYPE_CALL_ENTRY, SUPER_TYPE_ENTRY, or DELEGATED_SUPER_TYPE_ENTRY
    "explicit_delegation": "DELEGATED_SUPER_TYPE_ENTRY",

    # Type identifiers / simple names
    "type_identifier": None,  # maps to PsiElement(IDENTIFIER) leaf — skip
    "simple_identifier": None,  # maps to PsiElement(IDENTIFIER) leaf — skip
    "identifier": None,  # wraps simple_identifier; PSI equivalent (REFERENCE_EXPRESSION) is also skipped

    # Modifiers
    "modifiers": "MODIFIER_LIST",
    "class_modifier": None,  # individual modifier keywords, not composite in PSI
    "member_modifier": None,
    "visibility_modifier": None,
    "function_modifier": None,
    "property_modifier": None,
    "inheritance_modifier": None,
    "parameter_modifier": None,
    "parameter_modifiers": None,  # PSI uses MODIFIER_LIST
    "platform_modifier": None,
    "reification_modifier": None,
    "variance_modifier": None,
    "type_modifiers": None,  # PSI uses MODIFIER_LIST
    "type_parameter_modifiers": None,  # PSI uses MODIFIER_LIST
    "type_projection_modifiers": None,  # PSI uses MODIFIER_LIST

    # Annotations
    "annotation": "ANNOTATION_ENTRY",  # or ANNOTATION
    "file_annotation": "FILE_ANNOTATION_LIST",
    "use_site_target": "ANNOTATION_TARGET",

    # Expressions
    "call_expression": "CALL_EXPRESSION",
    "call_suffix": None,  # PSI inlines call suffix children directly under CALL_EXPRESSION
    "navigation_expression": "DOT_QUALIFIED_EXPRESSION",  # or SAFE_ACCESS_EXPRESSION
    "navigation_suffix": None,  # PSI inlines navigation children
    "indexing_expression": "ARRAY_ACCESS_EXPRESSION",
    "indexing_suffix": "INDICES",
    "value_arguments": "VALUE_ARGUMENT_LIST",
    "value_argument": "VALUE_ARGUMENT",
    "spread_expression": None,  # PSI uses PsiElement(MUL) in VALUE_ARGUMENT
    "parenthesized_expression": "PARENTHESIZED",
    "if_expression": "IF",
    "when_expression": "WHEN",
    "when_subject": None,  # PSI puts subject directly in WHEN, no wrapper
    "when_entry": "WHEN_ENTRY",
    "when_condition": None,  # maps to WHEN_CONDITION_WITH_EXPRESSION, WHEN_CONDITION_IS_PATTERN, or WHEN_CONDITION_IN_RANGE
    "try_expression": "TRY",
    "catch_block": "CATCH",
    "finally_block": "FINALLY",
    "jump_expression": None,  # maps to RETURN, THROW, BREAK, or CONTINUE
    "callable_reference": "CALLABLE_REFERENCE_EXPRESSION",
    "collection_literal": "COLLECTION_LITERAL_EXPRESSION",
    "this_expression": "THIS_EXPRESSION",
    "super_expression": "SUPER_EXPRESSION",
    "directly_assignable_expression": None,  # structural node, no PSI equivalent
    "assignment": None,  # PSI uses BINARY_EXPRESSION with assignment operator

    # Binary/Unary expressions
    "additive_expression": "BINARY_EXPRESSION",
    "multiplicative_expression": "BINARY_EXPRESSION",
    "comparison_expression": "BINARY_EXPRESSION",
    "equality_expression": "BINARY_EXPRESSION",
    "conjunction_expression": "BINARY_EXPRESSION",
    "disjunction_expression": "BINARY_EXPRESSION",
    "elvis_expression": "BINARY_EXPRESSION",
    "range_expression": "BINARY_EXPRESSION",
    "infix_expression": "BINARY_EXPRESSION",
    "as_expression": "BINARY_WITH_TYPE",  # 'as' is type-cast in PSI
    "check_expression": "IS_EXPRESSION",  # 'is' / '!is' checks
    "prefix_expression": "PREFIX_EXPRESSION",
    "postfix_expression": "POSTFIX_EXPRESSION",

    # Loops / control
    "for_statement": "FOR",
    "while_statement": "WHILE",
    "do_while_statement": "DO_WHILE",
    "control_structure_body": "BLOCK",  # maps to PSI's BLOCK under THEN/ELSE/BODY
    "range_test": "WHEN_CONDITION_IN_RANGE",  # 'in' range test in when
    "type_test": "WHEN_CONDITION_IS_PATTERN",  # 'is' type test in when

    # Lambdas
    "lambda_literal": "FUNCTION_LITERAL",  # inside LAMBDA_EXPRESSION
    "lambda_parameters": "VALUE_PARAMETER_LIST",
    "annotated_lambda": None,  # PSI skips LAMBDA_ARGUMENT; make TS transparent too

    # Statements
    "statements": None,  # transparent — BLOCK comes from control_structure_body or function_body
    "multi_variable_declaration": "DESTRUCTURING_DECLARATION",
    "variable_declaration": None,  # PSI uses PROPERTY or DESTRUCTURING_DECLARATION_ENTRY
    "binding_pattern_kind": None,  # val/var keyword, leaf in PSI

    # Literals
    "string_literal": "STRING_TEMPLATE",
    "string_content": "LITERAL_STRING_TEMPLATE_ENTRY",
    "interpolated_expression": "LONG_STRING_TEMPLATE_ENTRY",
    "interpolated_identifier": "SHORT_STRING_TEMPLATE_ENTRY",
    "character_literal": "CHARACTER_CONSTANT",
    "character_escape_seq": "ESCAPE_STRING_TEMPLATE_ENTRY",
    "integer_literal": "INTEGER_CONSTANT",
    "real_literal": "FLOAT_CONSTANT",
    "long_literal": None,  # PSI uses INTEGER_CONSTANT for longs too
    "hex_literal": "INTEGER_CONSTANT",
    "bin_literal": "INTEGER_CONSTANT",
    "unsigned_literal": "INTEGER_CONSTANT",
    "boolean_literal": "BOOLEAN_CONSTANT",
    "null_literal": "NULL",

    # Labels
    "label": "LABEL",

    # Comments
    "line_comment": None,  # maps to PsiComment leaf, not composite
    "multiline_comment": None,  # maps to PsiComment leaf, not composite

    # Anonymous initializer
    "anonymous_initializer": "CLASS_INITIALIZER",

    # Shebang
    "shebang_line": None,  # no PSI equivalent
}

# All 136 tree-sitter named nodes from node-types.json should be accounted
# for in TS_TO_PSI (mapped or None) or in SKIP_TS_NODES.


# ---------------------------------------------------------------------------
# SKIP_TS_NODES: tree-sitter nodes to skip during comparison
# ---------------------------------------------------------------------------
# These tree-sitter nodes have no composite PSI equivalent — they map to PSI
# leaf tokens (PsiElement) or represent structural wrappers that PSI doesn't use.

SKIP_TS_NODES: set[str] = {
    # Identifier-like nodes: PSI uses PsiElement(IDENTIFIER) leaves or
    # REFERENCE_EXPRESSION wrappers (which are also skipped on the PSI side)
    "simple_identifier",
    "type_identifier",
    "identifier",

    # Comments: PSI uses PsiComment leaves
    "line_comment",
    "multiline_comment",

    # Modifier keyword nodes: PSI uses PsiElement(keyword) leaves or MODIFIER_LIST
    "class_modifier",
    "member_modifier",
    "visibility_modifier",
    "function_modifier",
    "property_modifier",
    "inheritance_modifier",
    "parameter_modifier",
    "parameter_modifiers",
    "platform_modifier",
    "reification_modifier",
    "variance_modifier",
    "type_modifiers",
    "type_parameter_modifiers",
    "type_projection_modifiers",

    # Structural wrappers with no direct PSI equivalent
    "call_suffix",
    "navigation_suffix",
    "when_subject",
    "directly_assignable_expression",
    "binding_pattern_kind",
    "wildcard_import",
    "shebang_line",
    "statements",  # transparent: content promoted into parent BLOCK
    "annotated_lambda",  # transparent: PSI skips LAMBDA_ARGUMENT

    # Nodes that need special structural handling rather than simple mapping
    "constructor_invocation",  # part of SUPER_TYPE_CALL_ENTRY chain
    "delegation_specifier",   # context-dependent mapping
    "when_condition",         # maps to multiple possible PSI nodes
    "jump_expression",        # maps to RETURN, THROW, BREAK, or CONTINUE
    "variable_declaration",   # PSI uses PROPERTY or DESTRUCTURING_DECLARATION_ENTRY
    "assignment",             # PSI uses BINARY_EXPRESSION
    "not_nullable_type",      # no direct PSI equivalent
    "parenthesized_user_type",  # no direct PSI equivalent
    "spread_expression",      # PSI uses PsiElement(MUL) in VALUE_ARGUMENT
    "long_literal",           # PSI uses INTEGER_CONSTANT
}


# ---------------------------------------------------------------------------
# SKIP_PSI_NODES: JetBrains nodes to skip during comparison
# ---------------------------------------------------------------------------
# These PSI composite nodes have no tree-sitter counterpart or are wrappers
# that tree-sitter doesn't produce.

SKIP_PSI_NODES: set[str] = {
    # Note: IMPORT_LIST is handled specially in normalizer (skip when empty)

    # Type reference wrappers — tree-sitter goes directly to user_type
    "TYPE_REFERENCE",

    # Operation reference — tree-sitter puts operators inline
    "OPERATION_REFERENCE",

    # Reference expression — always a leaf in PSI (wraps PsiElement(IDENTIFIER));
    # tree-sitter equivalent (simple_identifier/type_identifier/identifier) is also skipped
    "REFERENCE_EXPRESSION",

    # Super type wrappers — tree-sitter has delegation_specifier instead
    "SUPER_TYPE_LIST",
    "SUPER_TYPE_CALL_ENTRY",
    "SUPER_TYPE_ENTRY",
    "CONSTRUCTOR_CALLEE",
    "CONSTRUCTOR_DELEGATION_REFERENCE",

    # Body wrappers — tree-sitter uses control_structure_body
    "BODY",
    "THEN",
    "ELSE",
    "LOOP_RANGE",
    "CONDITION",

    # Jump expression wrappers — tree-sitter skips jump_expression (promotes
    # children), so we skip PSI's RETURN/THROW/BREAK/CONTINUE for parity
    "RETURN",
    "THROW",
    "BREAK",
    "CONTINUE",

    # Lambda wrapper — PSI wraps FUNCTION_LITERAL inside LAMBDA_EXPRESSION
    "LAMBDA_EXPRESSION",
    "LAMBDA_ARGUMENT",

    # Label qualifier — PSI-specific
    "LABEL_QUALIFIER",

    # Value argument name — tree-sitter inlines named argument identifiers
    "VALUE_ARGUMENT_NAME",

    # Annotated expression — PSI wraps annotated expressions
    "ANNOTATED_EXPRESSION",
    "ANNOTATION",

    # Enum-specific wrappers
    "ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION",
    "INITIALIZER_LIST",

    # LABELED_EXPRESSION — PSI wraps labeled expressions
    "LABELED_EXPRESSION",

    # KDOC_SECTION — documentation nodes
    "KDOC_SECTION",

    # CLASS_LITERAL_EXPRESSION — tree-sitter handles ::class differently
    "CLASS_LITERAL_EXPRESSION",

    # CONTEXT_RECEIVER, CONTEXT_PARAMETER_LIST — newer Kotlin features
    "CONTEXT_RECEIVER",
    "CONTEXT_PARAMETER_LIST",

    # INTERSECTION_TYPE — newer Kotlin type features
    "INTERSECTION_TYPE",

    # DYNAMIC_TYPE — Kotlin/JS specific
    "DYNAMIC_TYPE",
}


# ---------------------------------------------------------------------------
# WRAPPER_COLLAPSE: JetBrains wrapper chains to collapse
# ---------------------------------------------------------------------------
# Maps a PSI parent node to a child node that should "absorb" the parent.
# When we encounter the parent in the PSI tree, we replace it with its child
# (collapsing the wrapper layer).
#
# For example, PSI has: SUPER_TYPE_CALL_ENTRY > CONSTRUCTOR_CALLEE > TYPE_REFERENCE > USER_TYPE
# But tree-sitter has:  delegation_specifier > constructor_invocation > user_type
# We collapse the PSI chain to make them comparable.

WRAPPER_COLLAPSE: dict[str, str] = {
    # TYPE_REFERENCE just wraps USER_TYPE, NULLABLE_TYPE, FUNCTION_TYPE, etc.
    "TYPE_REFERENCE": "USER_TYPE",

    # SUPER_TYPE_CALL_ENTRY wraps CONSTRUCTOR_CALLEE + VALUE_ARGUMENT_LIST
    "SUPER_TYPE_CALL_ENTRY": "CONSTRUCTOR_CALLEE",

    # CONSTRUCTOR_CALLEE wraps TYPE_REFERENCE
    "CONSTRUCTOR_CALLEE": "TYPE_REFERENCE",

    # LAMBDA_EXPRESSION wraps FUNCTION_LITERAL
    "LAMBDA_EXPRESSION": "FUNCTION_LITERAL",

    # ANNOTATED_EXPRESSION wraps the actual expression
    "ANNOTATED_EXPRESSION": "*",  # collapse to child (any single child)

    # LABELED_EXPRESSION wraps the actual expression + label
    "LABELED_EXPRESSION": "*",
}


# ---------------------------------------------------------------------------
# All tree-sitter named node types (136 total from node-types.json)
# Verified programmatically against node-types.json
# ---------------------------------------------------------------------------
ALL_TS_NAMED_NODES: set[str] = {
    "additive_expression",
    "annotated_lambda",
    "annotation",
    "anonymous_function",
    "anonymous_initializer",
    "as_expression",
    "assignment",
    "bin_literal",
    "binding_pattern_kind",
    "boolean_literal",
    "call_expression",
    "call_suffix",
    "callable_reference",
    "catch_block",
    "character_escape_seq",
    "character_literal",
    "check_expression",
    "class_body",
    "class_declaration",
    "class_modifier",
    "class_parameter",
    "collection_literal",
    "companion_object",
    "comparison_expression",
    "conjunction_expression",
    "constructor_delegation_call",
    "constructor_invocation",
    "control_structure_body",
    "delegation_specifier",
    "directly_assignable_expression",
    "disjunction_expression",
    "do_while_statement",
    "elvis_expression",
    "enum_class_body",
    "enum_entry",
    "equality_expression",
    "explicit_delegation",
    "file_annotation",
    "finally_block",
    "for_statement",
    "function_body",
    "function_declaration",
    "function_modifier",
    "function_type",
    "function_type_parameters",
    "function_value_parameters",
    "getter",
    "hex_literal",
    "identifier",
    "if_expression",
    "import_alias",
    "import_header",
    "import_list",
    "indexing_expression",
    "indexing_suffix",
    "infix_expression",
    "inheritance_modifier",
    "integer_literal",
    "interpolated_expression",
    "interpolated_identifier",
    "jump_expression",
    "label",
    "lambda_literal",
    "lambda_parameters",
    "line_comment",
    "long_literal",
    "member_modifier",
    "modifiers",
    "multi_variable_declaration",
    "multiline_comment",
    "multiplicative_expression",
    "navigation_expression",
    "navigation_suffix",
    "not_nullable_type",
    "null_literal",
    "nullable_type",
    "object_declaration",
    "object_literal",
    "package_header",
    "parameter",
    "parameter_modifier",
    "parameter_modifiers",
    "parameter_with_optional_type",
    "parenthesized_expression",
    "parenthesized_type",
    "parenthesized_user_type",
    "platform_modifier",
    "postfix_expression",
    "prefix_expression",
    "primary_constructor",
    "property_declaration",
    "property_delegate",
    "property_modifier",
    "range_expression",
    "range_test",
    "real_literal",
    "receiver_type",
    "reification_modifier",
    "secondary_constructor",
    "setter",
    "shebang_line",
    "simple_identifier",
    "source_file",
    "spread_expression",
    "statements",
    "string_content",
    "string_literal",
    "super_expression",
    "this_expression",
    "try_expression",
    "type_alias",
    "type_arguments",
    "type_constraint",
    "type_constraints",
    "type_identifier",
    "type_modifiers",
    "type_parameter",
    "type_parameter_modifiers",
    "type_parameters",
    "type_projection",
    "type_projection_modifiers",
    "type_test",
    "unsigned_literal",
    "use_site_target",
    "user_type",
    "value_argument",
    "value_arguments",
    "variable_declaration",
    "variance_modifier",
    "visibility_modifier",
    "when_condition",
    "when_entry",
    "when_expression",
    "when_subject",
    "while_statement",
    "wildcard_import",
}

# All JetBrains PSI composite node types (112 total from fixture files)
ALL_PSI_COMPOSITE_NODES: set[str] = {
    "ANNOTATED_EXPRESSION",
    "ANNOTATION",
    "ANNOTATION_ENTRY",
    "ANNOTATION_TARGET",
    "ARRAY_ACCESS_EXPRESSION",
    "BINARY_EXPRESSION",
    "BINARY_WITH_TYPE",
    "BLOCK",
    "BODY",
    "BOOLEAN_CONSTANT",
    "BREAK",
    "CALLABLE_REFERENCE_EXPRESSION",
    "CALL_EXPRESSION",
    "CATCH",
    "CHARACTER_CONSTANT",
    "CLASS",
    "CLASS_BODY",
    "CLASS_INITIALIZER",
    "CLASS_LITERAL_EXPRESSION",
    "COLLECTION_LITERAL_EXPRESSION",
    "CONDITION",
    "CONSTRUCTOR_CALLEE",
    "CONSTRUCTOR_DELEGATION_CALL",
    "CONSTRUCTOR_DELEGATION_REFERENCE",
    "CONTEXT_PARAMETER_LIST",
    "CONTEXT_RECEIVER",
    "CONTINUE",
    "DELEGATED_SUPER_TYPE_ENTRY",
    "DESTRUCTURING_DECLARATION",
    "DESTRUCTURING_DECLARATION_ENTRY",
    "DOT_QUALIFIED_EXPRESSION",
    "DO_WHILE",
    "DYNAMIC_TYPE",
    "ELSE",
    "ENUM_ENTRY",
    "ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION",
    "ESCAPE_STRING_TEMPLATE_ENTRY",
    "FILE_ANNOTATION_LIST",
    "FINALLY",
    "FLOAT_CONSTANT",
    "FOR",
    "FUN",
    "FUNCTION_LITERAL",
    "FUNCTION_TYPE",
    "FUNCTION_TYPE_RECEIVER",
    "IF",
    "IMPORT_ALIAS",
    "IMPORT_DIRECTIVE",
    "IMPORT_LIST",
    "INDICES",
    "INITIALIZER_LIST",
    "INTEGER_CONSTANT",
    "INTERSECTION_TYPE",
    "IS_EXPRESSION",
    "KDOC_SECTION",
    "KtFile",
    "LABEL",
    "LABELED_EXPRESSION",
    "LABEL_QUALIFIER",
    "LAMBDA_ARGUMENT",
    "LAMBDA_EXPRESSION",
    "LITERAL_STRING_TEMPLATE_ENTRY",
    "LONG_STRING_TEMPLATE_ENTRY",
    "LOOP_RANGE",
    "MODIFIER_LIST",
    "NULL",
    "NULLABLE_TYPE",
    "OBJECT_DECLARATION",
    "OBJECT_LITERAL",
    "OPERATION_REFERENCE",
    "PACKAGE_DIRECTIVE",
    "PARENTHESIZED",
    "POSTFIX_EXPRESSION",
    "PREFIX_EXPRESSION",
    "PRIMARY_CONSTRUCTOR",
    "PROPERTY",
    "PROPERTY_ACCESSOR",
    "PROPERTY_DELEGATE",
    "REFERENCE_EXPRESSION",
    "RETURN",
    "SAFE_ACCESS_EXPRESSION",
    "SECONDARY_CONSTRUCTOR",
    "SHORT_STRING_TEMPLATE_ENTRY",
    "STRING_TEMPLATE",
    "SUPER_EXPRESSION",
    "SUPER_TYPE_CALL_ENTRY",
    "SUPER_TYPE_ENTRY",
    "SUPER_TYPE_LIST",
    "THEN",
    "THIS_EXPRESSION",
    "THROW",
    "TRY",
    "TYPEALIAS",
    "TYPE_ARGUMENT_LIST",
    "TYPE_CONSTRAINT",
    "TYPE_CONSTRAINT_LIST",
    "TYPE_PARAMETER",
    "TYPE_PARAMETER_LIST",
    "TYPE_PROJECTION",
    "TYPE_REFERENCE",
    "USER_TYPE",
    "VALUE_ARGUMENT",
    "VALUE_ARGUMENT_LIST",
    "VALUE_ARGUMENT_NAME",
    "VALUE_PARAMETER",
    "VALUE_PARAMETER_LIST",
    "WHEN",
    "WHEN_CONDITION_IN_RANGE",
    "WHEN_CONDITION_IS_PATTERN",
    "WHEN_CONDITION_WITH_EXPRESSION",
    "WHEN_ENTRY",
    "WHILE",
}
