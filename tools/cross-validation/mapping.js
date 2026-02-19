/**
 * Mapping tables between tree-sitter and PSI node types.
 * @module mapping
 */

'use strict';

// ---------------------------------------------------------------------------
// TS_TO_PSI: Maps tree-sitter node names to PSI composite names (or null).
// A value of null means the TS node is transparent/skipped during normalization.
// ---------------------------------------------------------------------------

/** @type {Object<string, string|null>} */
const TS_TO_PSI = {
  // Top-level
  source_file: 'KtFile',
  package_header: 'PACKAGE_DIRECTIVE',
  import_list: 'IMPORT_LIST',
  import_header: 'IMPORT_DIRECTIVE',
  import_alias: 'IMPORT_ALIAS',
  wildcard_import: null,

  // Class-related
  class_declaration: 'CLASS',
  class_body: 'CLASS_BODY',
  class_parameter: 'VALUE_PARAMETER',
  companion_object: 'OBJECT_DECLARATION',
  object_declaration: 'OBJECT_DECLARATION',
  object_literal: 'OBJECT_LITERAL',
  enum_class_body: 'CLASS_BODY',
  enum_entry: 'ENUM_ENTRY',
  type_alias: 'TYPEALIAS',

  // Constructors
  primary_constructor: 'PRIMARY_CONSTRUCTOR',
  secondary_constructor: 'SECONDARY_CONSTRUCTOR',
  constructor_delegation_call: 'CONSTRUCTOR_DELEGATION_CALL',
  constructor_invocation: null,

  // Functions
  function_declaration: 'FUN',
  function_body: 'BLOCK',
  function_value_parameters: 'VALUE_PARAMETER_LIST',
  parameter: 'VALUE_PARAMETER',
  parameter_with_optional_type: 'VALUE_PARAMETER',
  getter: 'PROPERTY_ACCESSOR',
  setter: 'PROPERTY_ACCESSOR',
  anonymous_function: 'FUN',

  // Properties
  property_declaration: 'PROPERTY',
  property_delegate: 'PROPERTY_DELEGATE',

  // Types
  type_parameters: 'TYPE_PARAMETER_LIST',
  type_parameter: 'TYPE_PARAMETER',
  type_arguments: 'TYPE_ARGUMENT_LIST',
  type_projection: 'TYPE_PROJECTION',
  user_type: 'USER_TYPE',
  function_type: 'FUNCTION_TYPE',
  function_type_parameters: 'VALUE_PARAMETER_LIST',
  nullable_type: 'NULLABLE_TYPE',
  not_nullable_type: null,
  parenthesized_type: 'PARENTHESIZED',
  parenthesized_user_type: null,
  type_constraints: 'TYPE_CONSTRAINT_LIST',
  type_constraint: 'TYPE_CONSTRAINT',
  receiver_type: 'FUNCTION_TYPE_RECEIVER',

  // Delegation
  delegation_specifier: null,
  explicit_delegation: 'DELEGATED_SUPER_TYPE_ENTRY',

  // Identifiers (all null — these are transparent)
  type_identifier: null,
  simple_identifier: null,
  identifier: null,

  // Modifiers (transparent — MODIFIER_LIST skipped on both sides)
  modifiers: null,
  class_modifier: null,
  member_modifier: null,
  visibility_modifier: null,
  function_modifier: null,
  property_modifier: null,
  inheritance_modifier: null,
  parameter_modifier: null,
  parameter_modifiers: null,
  platform_modifier: null,
  reification_modifier: null,
  variance_modifier: null,
  type_modifiers: null,
  type_parameter_modifiers: null,
  type_projection_modifiers: null,

  // Annotations
  annotation: 'ANNOTATION_ENTRY',
  file_annotation: 'FILE_ANNOTATION_LIST',
  use_site_target: 'ANNOTATION_TARGET',

  // Expressions
  call_expression: 'CALL_EXPRESSION',
  call_suffix: null,
  navigation_expression: 'DOT_QUALIFIED_EXPRESSION',
  navigation_suffix: null,
  indexing_expression: 'ARRAY_ACCESS_EXPRESSION',
  indexing_suffix: 'INDICES',
  value_arguments: 'VALUE_ARGUMENT_LIST',
  value_argument: 'VALUE_ARGUMENT',
  spread_expression: null,
  parenthesized_expression: 'PARENTHESIZED',
  if_expression: 'IF',
  when_expression: 'WHEN',
  when_subject: null,
  when_entry: 'WHEN_ENTRY',
  when_condition: null,
  try_expression: 'TRY',
  catch_block: 'CATCH',
  finally_block: 'FINALLY',
  jump_expression: null,
  callable_reference: 'CALLABLE_REFERENCE_EXPRESSION',
  collection_literal: 'COLLECTION_LITERAL_EXPRESSION',
  this_expression: 'THIS_EXPRESSION',
  super_expression: 'SUPER_EXPRESSION',
  directly_assignable_expression: null,
  assignment: null,

  // Binary / Unary
  additive_expression: 'BINARY_EXPRESSION',
  multiplicative_expression: 'BINARY_EXPRESSION',
  comparison_expression: 'BINARY_EXPRESSION',
  equality_expression: 'BINARY_EXPRESSION',
  conjunction_expression: 'BINARY_EXPRESSION',
  disjunction_expression: 'BINARY_EXPRESSION',
  elvis_expression: 'BINARY_EXPRESSION',
  range_expression: 'BINARY_EXPRESSION',
  infix_expression: 'BINARY_EXPRESSION',
  as_expression: 'BINARY_WITH_TYPE',
  check_expression: 'IS_EXPRESSION',
  prefix_expression: 'PREFIX_EXPRESSION',
  postfix_expression: 'POSTFIX_EXPRESSION',

  // Loops / Control
  for_statement: 'FOR',
  while_statement: 'WHILE',
  do_while_statement: 'DO_WHILE',
  control_structure_body: 'BLOCK',
  range_test: 'WHEN_CONDITION_IN_RANGE',
  type_test: 'WHEN_CONDITION_IS_PATTERN',

  // Lambdas
  lambda_literal: 'FUNCTION_LITERAL',
  lambda_parameters: 'VALUE_PARAMETER_LIST',
  annotated_lambda: null,

  // Statements
  statements: null,
  multi_variable_declaration: 'DESTRUCTURING_DECLARATION',
  variable_declaration: null,
  binding_pattern_kind: null,

  // Literals
  string_literal: 'STRING_TEMPLATE',
  string_content: 'LITERAL_STRING_TEMPLATE_ENTRY',
  interpolated_expression: 'LONG_STRING_TEMPLATE_ENTRY',
  interpolated_identifier: 'SHORT_STRING_TEMPLATE_ENTRY',
  character_literal: 'CHARACTER_CONSTANT',
  character_escape_seq: 'ESCAPE_STRING_TEMPLATE_ENTRY',
  integer_literal: 'INTEGER_CONSTANT',
  real_literal: 'FLOAT_CONSTANT',
  long_literal: null,
  hex_literal: 'INTEGER_CONSTANT',
  bin_literal: 'INTEGER_CONSTANT',
  unsigned_literal: 'INTEGER_CONSTANT',
  boolean_literal: 'BOOLEAN_CONSTANT',
  null_literal: 'NULL',

  // Labels
  label: 'LABEL',

  // Comments (null)
  line_comment: null,
  multiline_comment: null,

  // Other
  anonymous_initializer: 'CLASS_INITIALIZER',
  shebang_line: null,
};

// ---------------------------------------------------------------------------
// SKIP_TS_NODES: tree-sitter nodes to skip entirely during normalization
// (nodes mapped to null that are truly transparent wrappers)
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const SKIP_TS_NODES = new Set([
  'wildcard_import',
  'constructor_invocation',
  'not_nullable_type',
  'parenthesized_user_type',
  'delegation_specifier',
  'type_identifier',
  'simple_identifier',
  'identifier',
  'class_modifier',
  'member_modifier',
  'visibility_modifier',
  'function_modifier',
  'property_modifier',
  'inheritance_modifier',
  'parameter_modifier',
  'parameter_modifiers',
  'platform_modifier',
  'reification_modifier',
  'variance_modifier',
  'type_modifiers',
  'type_parameter_modifiers',
  'type_projection_modifiers',
  'call_suffix',
  'navigation_suffix',
  'spread_expression',
  'when_subject',
  'when_condition',
  'jump_expression',
  'directly_assignable_expression',
  'assignment',
  'annotated_lambda',
  'statements',
  'variable_declaration',
  'binding_pattern_kind',
  'long_literal',
  'line_comment',
  'multiline_comment',
  'shebang_line',
]);

// ---------------------------------------------------------------------------
// SKIP_PSI_NODES: PSI composite nodes to skip during normalization
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const SKIP_PSI_NODES = new Set([
  // Type reference wrappers — tree-sitter goes directly to user_type
  'TYPE_REFERENCE',

  // Operation reference — tree-sitter puts operators inline
  'OPERATION_REFERENCE',

  // Reference expression — always a leaf in PSI (wraps PsiElement(IDENTIFIER))
  'REFERENCE_EXPRESSION',

  // Super type wrappers — tree-sitter has delegation_specifier instead
  'SUPER_TYPE_LIST',
  'SUPER_TYPE_CALL_ENTRY',
  'SUPER_TYPE_ENTRY',
  'CONSTRUCTOR_CALLEE',
  'CONSTRUCTOR_DELEGATION_REFERENCE',

  // Body wrappers — tree-sitter uses control_structure_body
  'THEN',
  'ELSE',
  'LOOP_RANGE',
  'CONDITION',

  // Jump expression wrappers — tree-sitter skips jump_expression (promotes children)
  'RETURN',
  'THROW',
  'BREAK',
  'CONTINUE',

  // Lambda wrapper — PSI wraps FUNCTION_LITERAL inside LAMBDA_EXPRESSION
  'LAMBDA_EXPRESSION',
  'LAMBDA_ARGUMENT',

  // Label qualifier — PSI-specific
  'LABEL_QUALIFIER',

  // Value argument name — tree-sitter inlines named argument identifiers
  'VALUE_ARGUMENT_NAME',

  // Annotated expression — PSI wraps annotated expressions
  'ANNOTATED_EXPRESSION',
  'ANNOTATION',

  // Enum-specific wrappers
  'ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION',
  'INITIALIZER_LIST',

  // MODIFIER_LIST — tree-sitter emits bare ANNOTATION_ENTRY without wrapper
  'MODIFIER_LIST',

  // WHEN_CONDITION_WITH_EXPRESSION — tree-sitter promotes condition expression directly
  'WHEN_CONDITION_WITH_EXPRESSION',

  // LABELED_EXPRESSION — PSI wraps labeled expressions
  'LABELED_EXPRESSION',

  // KDOC_SECTION — documentation nodes
  'KDOC_SECTION',

  // CLASS_LITERAL_EXPRESSION — tree-sitter handles ::class differently
  'CLASS_LITERAL_EXPRESSION',

  // CONTEXT_RECEIVER, CONTEXT_PARAMETER_LIST — newer Kotlin features
  'CONTEXT_RECEIVER',
  'CONTEXT_PARAMETER_LIST',

  // INTERSECTION_TYPE — newer Kotlin type features
  'INTERSECTION_TYPE',

  // DYNAMIC_TYPE — Kotlin/JS specific
  'DYNAMIC_TYPE',
]);

// ---------------------------------------------------------------------------
// WRAPPER_COLLAPSE: PSI wrappers that collapse to their child
// ---------------------------------------------------------------------------

/** @type {Object<string, string>} */
const WRAPPER_COLLAPSE = {
  // These are handled as SKIP_PSI_NODES now with child promotion
};

// ---------------------------------------------------------------------------
// ALL_TS_NAMED_NODES: All named node types from the tree-sitter grammar
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const ALL_TS_NAMED_NODES = new Set([
  'additive_expression',
  'annotated_lambda',
  'annotation',
  'anonymous_function',
  'anonymous_initializer',
  'as_expression',
  'assignment',
  'bin_literal',
  'binding_pattern_kind',
  'boolean_literal',
  'call_expression',
  'call_suffix',
  'callable_reference',
  'catch_block',
  'character_escape_seq',
  'character_literal',
  'check_expression',
  'class_body',
  'class_declaration',
  'class_modifier',
  'class_parameter',
  'collection_literal',
  'companion_object',
  'comparison_expression',
  'conjunction_expression',
  'constructor_delegation_call',
  'constructor_invocation',
  'control_structure_body',
  'delegation_specifier',
  'directly_assignable_expression',
  'disjunction_expression',
  'do_while_statement',
  'elvis_expression',
  'enum_class_body',
  'enum_entry',
  'equality_expression',
  'explicit_delegation',
  'file_annotation',
  'finally_block',
  'for_statement',
  'function_body',
  'function_declaration',
  'function_modifier',
  'function_type',
  'function_type_parameters',
  'function_value_parameters',
  'getter',
  'hex_literal',
  'identifier',
  'if_expression',
  'import_alias',
  'import_header',
  'import_list',
  'indexing_expression',
  'indexing_suffix',
  'infix_expression',
  'inheritance_modifier',
  'integer_literal',
  'interpolated_expression',
  'interpolated_identifier',
  'jump_expression',
  'label',
  'lambda_literal',
  'lambda_parameters',
  'line_comment',
  'long_literal',
  'member_modifier',
  'modifiers',
  'multi_variable_declaration',
  'multiline_comment',
  'multiplicative_expression',
  'navigation_expression',
  'navigation_suffix',
  'not_nullable_type',
  'null_literal',
  'nullable_type',
  'object_declaration',
  'object_literal',
  'package_header',
  'parameter',
  'parameter_modifier',
  'parameter_modifiers',
  'parameter_with_optional_type',
  'parenthesized_expression',
  'parenthesized_type',
  'parenthesized_user_type',
  'platform_modifier',
  'postfix_expression',
  'prefix_expression',
  'primary_constructor',
  'property_declaration',
  'property_delegate',
  'property_modifier',
  'range_expression',
  'range_test',
  'real_literal',
  'receiver_type',
  'reification_modifier',
  'secondary_constructor',
  'setter',
  'shebang_line',
  'simple_identifier',
  'source_file',
  'spread_expression',
  'statements',
  'string_content',
  'string_literal',
  'super_expression',
  'this_expression',
  'try_expression',
  'type_alias',
  'type_arguments',
  'type_constraint',
  'type_constraints',
  'type_identifier',
  'type_modifiers',
  'type_parameter',
  'type_parameter_modifiers',
  'type_parameters',
  'type_projection',
  'type_projection_modifiers',
  'type_test',
  'unsigned_literal',
  'use_site_target',
  'user_type',
  'value_argument',
  'value_arguments',
  'variable_declaration',
  'variance_modifier',
  'visibility_modifier',
  'when_condition',
  'when_entry',
  'when_expression',
  'when_subject',
  'while_statement',
  'wildcard_import',
]);

// ---------------------------------------------------------------------------
// ALL_PSI_COMPOSITE_NODES: All PSI composite node types we recognize
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const ALL_PSI_COMPOSITE_NODES = new Set([
  'ANNOTATED_EXPRESSION',
  'ANNOTATION',
  'ANNOTATION_ENTRY',
  'ANNOTATION_TARGET',
  'ARRAY_ACCESS_EXPRESSION',
  'BINARY_EXPRESSION',
  'BINARY_WITH_TYPE',
  'BLOCK',
  'BOOLEAN_CONSTANT',
  'CALLABLE_REFERENCE_EXPRESSION',
  'CALL_EXPRESSION',
  'CATCH',
  'CHARACTER_CONSTANT',
  'CLASS',
  'CLASS_BODY',
  'CLASS_INITIALIZER',
  'CLASS_LITERAL_EXPRESSION',
  'COLLECTION_LITERAL_EXPRESSION',
  'CONDITION',
  'CONSTRUCTOR_CALLEE',
  'CONSTRUCTOR_DELEGATION_CALL',
  'CONSTRUCTOR_DELEGATION_REFERENCE',
  'DELEGATED_SUPER_TYPE_ENTRY',
  'DESTRUCTURING_DECLARATION',
  'DESTRUCTURING_DECLARATION_ENTRY',
  'DOT_QUALIFIED_EXPRESSION',
  'DO_WHILE',
  'DYNAMIC_TYPE',
  'ELSE',
  'ENUM_ENTRY',
  'ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION',
  'ESCAPE_STRING_TEMPLATE_ENTRY',
  'FILE_ANNOTATION_LIST',
  'FINALLY',
  'FLOAT_CONSTANT',
  'FOR',
  'FUN',
  'FUNCTION_LITERAL',
  'FUNCTION_TYPE',
  'FUNCTION_TYPE_RECEIVER',
  'IF',
  'IMPORT_ALIAS',
  'IMPORT_DIRECTIVE',
  'IMPORT_LIST',
  'INDICES',
  'INITIALIZER_LIST',
  'INTEGER_CONSTANT',
  'INTERSECTION_TYPE',
  'IS_EXPRESSION',
  'KtFile',
  'LABEL',
  'LABELED_EXPRESSION',
  'LABEL_QUALIFIER',
  'LAMBDA_ARGUMENT',
  'LAMBDA_EXPRESSION',
  'LITERAL_STRING_TEMPLATE_ENTRY',
  'LONG_STRING_TEMPLATE_ENTRY',
  'LOOP_RANGE',
  'MODIFIER_LIST',
  'NULL',
  'NULLABLE_TYPE',
  'OBJECT_DECLARATION',
  'OBJECT_LITERAL',
  'OPERATION_REFERENCE',
  'PACKAGE_DIRECTIVE',
  'PARENTHESIZED',
  'POSTFIX_EXPRESSION',
  'PREFIX_EXPRESSION',
  'PRIMARY_CONSTRUCTOR',
  'PROPERTY',
  'PROPERTY_ACCESSOR',
  'PROPERTY_DELEGATE',
  'REFERENCE_EXPRESSION',
  'RETURN',
  'SAFE_ACCESS_EXPRESSION',
  'SECONDARY_CONSTRUCTOR',
  'SHORT_STRING_TEMPLATE_ENTRY',
  'STRING_TEMPLATE',
  'SUPER_EXPRESSION',
  'SUPER_TYPE_CALL_ENTRY',
  'SUPER_TYPE_ENTRY',
  'SUPER_TYPE_LIST',
  'THEN',
  'THIS_EXPRESSION',
  'TRY',
  'TYPEALIAS',
  'TYPE_ARGUMENT_LIST',
  'TYPE_CONSTRAINT',
  'TYPE_CONSTRAINT_LIST',
  'TYPE_PARAMETER',
  'TYPE_PARAMETER_LIST',
  'TYPE_PROJECTION',
  'TYPE_REFERENCE',
  'USER_TYPE',
  'VALUE_ARGUMENT',
  'VALUE_ARGUMENT_LIST',
  'VALUE_ARGUMENT_NAME',
  'VALUE_PARAMETER',
  'VALUE_PARAMETER_LIST',
  'WHEN',
  'WHEN_CONDITION_IN_RANGE',
  'WHEN_CONDITION_IS_PATTERN',
  'WHEN_CONDITION_WITH_EXPRESSION',
  'WHEN_ENTRY',
  'WHILE',
  // Additional nodes found in SKIP_PSI_NODES
  'THROW',
  'BREAK',
  'CONTINUE',
  'KDOC_SECTION',
  'CONTEXT_RECEIVER',
  'CONTEXT_PARAMETER_LIST',
]);

module.exports = {
  TS_TO_PSI,
  SKIP_TS_NODES,
  SKIP_PSI_NODES,
  WRAPPER_COLLAPSE,
  ALL_TS_NAMED_NODES,
  ALL_PSI_COMPOSITE_NODES,
};
