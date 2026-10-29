import { describe, it, expect } from 'vitest';
const { Node } = require('./models');
const { normalizeTs, normalizePsi } = require('./normalizer');
const { compareTrees, Status } = require('./comparator');
const n = (name, ...children) => new Node(name, children);
const tsType = () => n('user_type', n('type_identifier'));
const psiType = () => n('TYPE_REFERENCE', n('USER_TYPE', n('REFERENCE_EXPRESSION')));
const tsAnnotation = () => n('annotation', tsType());
const psiAnnotation = () => n('ANNOTATION_ENTRY', n('CONSTRUCTOR_CALLEE', psiType()));
const same = (ts, psi) => expect(compareTrees(normalizeTs(ts), normalizePsi(psi)).status).toBe(Status.MATCH);
const different = (ts, psi) => expect(compareTrees(normalizeTs(ts), normalizePsi(psi)).status).toBe(Status.MISMATCH);

describe('PSI comparison artifacts', () => {
  it('maps this@Label without turning ordinary type identifiers into labels', () => {
    same(n('this_expression', n('type_identifier')), n('THIS_EXPRESSION', n('LABEL')));
    same(n('super_expression', n('type_identifier')), n('SUPER_EXPRESSION', n('LABEL')));
    same(n('super_expression', tsType()), n('SUPER_EXPRESSION', psiType()));
    same(tsType(), psiType());
    expect(normalizeTs(tsType()).children).toEqual([]);
  });
  it('discards documentation before removing an empty import list, preserving real imports', () => {
    same(n('source_file', n('multiline_comment')), n('KtFile', n('PACKAGE_DIRECTIVE'),
      n('IMPORT_LIST', n('KDOC_SECTION', n('KDOC_TAG', n('KDOC_NAME'))))));
    same(n('source_file', n('import_list', n('import_header', n('identifier')))),
      n('KtFile', n('IMPORT_LIST', n('IMPORT_DIRECTIVE', n('REFERENCE_EXPRESSION')))));
    expect(normalizePsi(n('IMPORT_LIST', n('IMPORT_DIRECTIVE'))).name).toBe('IMPORT_LIST');
  });
  it('preserves a for variable and the braced BODY/BLOCK hierarchy', () => {
    same(n('for_statement', n('variable_declaration', n('simple_identifier')),
      n('range_expression', n('integer_literal'), n('integer_literal')),
      n('control_structure_body', n('statements', n('call_expression', n('simple_identifier'))))),
    n('FOR', n('VALUE_PARAMETER'), n('LOOP_RANGE', n('BINARY_EXPRESSION', n('INTEGER_CONSTANT'), n('INTEGER_CONSTANT'))),
      n('BODY', n('BLOCK', n('CALL_EXPRESSION', n('REFERENCE_EXPRESSION'))))));
  });
  it('wraps destructured loop variables in VALUE_PARAMETER', () => {
    same(n('for_statement', n('multi_variable_declaration', n('variable_declaration'), n('variable_declaration')),
      n('simple_identifier'), n('control_structure_body')),
    n('FOR', n('VALUE_PARAMETER', n('DESTRUCTURING_DECLARATION', n('DESTRUCTURING_DECLARATION_ENTRY'))),
      n('LOOP_RANGE', n('REFERENCE_EXPRESSION')), n('BODY', n('BLOCK'))));
  });
  it('keeps unbraced loop bodies unbraced and leaves if bodies outside BODY', () => {
    same(n('while_statement', n('boolean_literal'), n('control_structure_body', n('call_expression'))),
      n('WHILE', n('CONDITION', n('BOOLEAN_CONSTANT')), n('BODY', n('CALL_EXPRESSION'))));
    same(n('if_expression', n('boolean_literal'), n('control_structure_body', n('statements', n('call_expression')))),
      n('IF', n('CONDITION', n('BOOLEAN_CONSTANT')), n('THEN', n('BLOCK', n('CALL_EXPRESSION')))));
  });
  it('names positional destructuring once for both declaration node spellings', () => {
    for (const name of ['property_declaration', 'destructuring_declaration']) {
      same(n(name, n('binding_pattern_kind'), n('multi_variable_declaration', n('variable_declaration'), n('variable_declaration')),
        n('call_expression')), n('DESTRUCTURING_DECLARATION', n('DESTRUCTURING_DECLARATION_ENTRY'), n('CALL_EXPRESSION')));
    }
    expect(normalizeTs(n('property_declaration', n('lambda_literal', n('lambda_parameters', n('multi_variable_declaration'))))).name).toBe('PROPERTY');
  });
  it('retains assignment structure and its right-hand expression', () => {
    same(n('assignment', n('directly_assignable_expression', n('simple_identifier')), n('integer_literal')),
      n('BINARY_EXPRESSION', n('REFERENCE_EXPRESSION'), n('OPERATION_REFERENCE'), n('INTEGER_CONSTANT')));
    expect(normalizeTs(n('assignment', n('call_expression'))).name).toBe('BINARY_EXPRESSION');
  });
  it('preserves named and bare context lists with annotations on the correct parameter', () => {
    same(n('context_receiver', n('parameter_modifiers', tsAnnotation()), n('parameter', n('simple_identifier'), tsType())),
      n('CONTEXT_PARAMETER_LIST', n('VALUE_PARAMETER', n('MODIFIER_LIST', psiAnnotation()), psiType())));
    same(n('context_receiver', tsType(), tsType()),
      n('CONTEXT_PARAMETER_LIST', n('CONTEXT_RECEIVER', psiType()), n('CONTEXT_RECEIVER', psiType())));
  });
  it('moves a type context list inside FUNCTION_TYPE through type modifiers and receiver wrappers', () => {
    const context = () => n('context_receiver', tsType());
    const expected = () => n('VALUE_PARAMETER', n('TYPE_REFERENCE', n('FUNCTION_TYPE',
      n('CONTEXT_PARAMETER_LIST', n('CONTEXT_RECEIVER', psiType())), n('FUNCTION_TYPE_RECEIVER', psiType()),
      n('VALUE_PARAMETER_LIST', n('VALUE_PARAMETER', psiType())), psiType())));
    same(n('parameter', n('simple_identifier'), n('type_modifiers', context()),
      n('function_type', n('receiver_type', tsType()), n('function_type_parameters', tsType()), tsType())), expected());
    same(n('parameter', n('simple_identifier'), n('function_type', n('receiver_type', n('type_modifiers', context()), tsType()),
      n('function_type_parameters', tsType()), tsType())), expected());
    const property = n('property_declaration', n('variable_declaration', n('simple_identifier'),
      n('type_modifiers', context()), n('function_type', n('function_type_parameters'), tsType())));
    expect(normalizeTs(property).children[0].name).toBe('FUNCTION_TYPE');
    expect(normalizeTs(property).children[0].children[0].name).toBe('CONTEXT_PARAMETER_LIST');
  });
  it('keeps declaration context clauses outside a function-valued return or alias target', () => {
    for (const [tsName, psiName] of [['function_declaration', 'FUN'], ['type_alias', 'TYPEALIAS']]) {
      same(n(tsName, n('modifiers', n('context_receiver', n('parameter', n('simple_identifier'), tsType()))),
        n('function_type', n('function_type_parameters'), tsType())),
      n(psiName, n('MODIFIER_LIST', n('CONTEXT_PARAMETER_LIST', n('VALUE_PARAMETER', psiType()))),
        n('TYPE_REFERENCE', n('FUNCTION_TYPE', n('VALUE_PARAMETER_LIST'), psiType()))));
    }
  });
  it('aligns attached annotations while preserving unary-expression structure', () => {
    same(n('prefix_expression', tsAnnotation(), n('this_expression')),
      n('ANNOTATED_EXPRESSION', n('ANNOTATION', psiAnnotation()), n('THIS_EXPRESSION', n('REFERENCE_EXPRESSION'))));
    same(n('prefix_expression', tsAnnotation(), n('prefix_expression', n('integer_literal'))),
      n('ANNOTATED_EXPRESSION', n('ANNOTATION', psiAnnotation()), n('PREFIX_EXPRESSION', n('INTEGER_CONSTANT'))));
    same(n('prefix_expression', tsAnnotation(), n('anonymous_function', n('context_receiver', tsType()), n('function_body'))),
      n('FUN', n('MODIFIER_LIST', psiAnnotation(), n('CONTEXT_PARAMETER_LIST', n('CONTEXT_RECEIVER', psiType()))), n('BLOCK')));
  });
});

describe('legacy normalizer prerequisites', () => {
  it('keeps every lambda parameter, including typed and destructured parameters', () => {
    same(n('lambda_parameters', n('variable_declaration', n('simple_identifier')), n('type_modifiers', tsAnnotation()), tsType(),
      n('multi_variable_declaration', n('variable_declaration'), n('variable_declaration'))),
    n('VALUE_PARAMETER_LIST', n('VALUE_PARAMETER', n('MODIFIER_LIST', psiAnnotation()), psiType()),
      n('VALUE_PARAMETER', n('DESTRUCTURING_DECLARATION', n('DESTRUCTURING_DECLARATION_ENTRY')))));
  });
  it('groups mixed named and unnamed function-type parameters independently', () => {
    same(n('function_type_parameters', n('type_modifiers', tsAnnotation()), tsType(), n('parameter', n('simple_identifier'), tsType())),
      n('VALUE_PARAMETER_LIST', n('VALUE_PARAMETER', n('MODIFIER_LIST', psiAnnotation()), psiType()), n('VALUE_PARAMETER', psiType())));
  });
  it('distinguishes class literals from callable references, including qualified navigation forms', () => {
    same(n('callable_reference', n('type_identifier')), n('CLASS_LITERAL_EXPRESSION', n('REFERENCE_EXPRESSION')));
    same(n('navigation_expression', n('navigation_expression', n('simple_identifier'), n('navigation_suffix', n('simple_identifier'))),
      n('navigation_suffix')), n('CLASS_LITERAL_EXPRESSION', n('DOT_QUALIFIED_EXPRESSION', n('REFERENCE_EXPRESSION'), n('REFERENCE_EXPRESSION'))));
    same(n('callable_reference', n('type_identifier'), n('simple_identifier')), n('CALLABLE_REFERENCE_EXPRESSION', n('REFERENCE_EXPRESSION')));
    expect(normalizeTs(n('navigation_expression', n('simple_identifier'), n('navigation_suffix', n('simple_identifier'))))).toBeNull();
  });
  it('recognizes a function-type operand as an is-test', () => {
    same(n('check_expression', n('simple_identifier'), n('function_type', n('function_type_parameters'), tsType())),
      n('IS_EXPRESSION', n('REFERENCE_EXPRESSION'), n('TYPE_REFERENCE', n('FUNCTION_TYPE', n('VALUE_PARAMETER_LIST'), psiType()))));
  });
});

describe('real structural differences remain visible', () => {
  it('does not attach a detached annotation to a following assignment', () => {
    different(n('function_body', n('statements', tsAnnotation(), n('assignment', n('simple_identifier'), n('integer_literal')))),
      n('BLOCK', n('ANNOTATED_EXPRESSION', n('ANNOTATION', psiAnnotation()), n('BINARY_EXPRESSION', n('REFERENCE_EXPRESSION'), n('INTEGER_CONSTANT')))));
  });
  it('does not turn a trailing lambda in a delegate into a class body', () => {
    different(n('class_declaration', n('explicit_delegation', n('call_expression', n('integer_literal'), n('call_suffix', n('annotated_lambda', n('lambda_literal')))))),
      n('CLASS', n('DELEGATED_SUPER_TYPE_ENTRY', n('INTEGER_CONSTANT')), n('CLASS_BODY')));
  });
  it('does not split a parsed lambda call chain into separate statements', () => {
    different(n('function_body', n('statements', n('call_expression', n('lambda_literal'), n('call_suffix', n('annotated_lambda', n('lambda_literal')))))),
      n('BLOCK', n('LAMBDA_EXPRESSION', n('FUNCTION_LITERAL', n('BLOCK'))), n('LAMBDA_EXPRESSION', n('FUNCTION_LITERAL', n('BLOCK')))));
  });
  it('does not invent a missing named block on a secondary constructor', () => {
    different(n('secondary_constructor'), n('SECONDARY_CONSTRUCTOR', n('BLOCK')));
  });
});
