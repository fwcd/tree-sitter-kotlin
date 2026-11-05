/**
 * AST normalizer for cross-validation between tree-sitter and PSI trees.
 * @module normalizer
 */

'use strict';

const { Node } = require('./models');
const { textNode, textNodes, mergeRuns } = require('./literal-runs');
const {
  TS_TO_PSI,
  SKIP_TS_NODES,
  SKIP_PSI_NODES,
  WRAPPER_COLLAPSE,
} = require('./mapping');

const STATEMENT_EXPRESSIONS = new Set([
  'postfix_expression', 'indexing_expression', 'navigation_expression', 'prefix_expression',
  'as_expression', 'spread_expression', 'multiplicative_expression', 'additive_expression',
  'range_expression', 'infix_expression', 'elvis_expression', 'check_expression',
  'comparison_expression', 'equality_expression', 'conjunction_expression', 'disjunction_expression',
  'simple_identifier', 'parenthesized_expression', 'call_expression', 'callable_reference',
  'if_expression', 'when_expression', 'try_expression', 'jump_expression',
  'lambda_literal', 'anonymous_function', 'object_literal', 'this_expression', 'super_expression',
  'string_literal', 'character_literal', 'boolean_literal', 'integer_literal', 'hex_literal',
  'bin_literal', 'real_literal', 'null_literal', 'long_literal', 'unsigned_literal',
]);

// ---------------------------------------------------------------------------
// Tree-sitter normalizer
// ---------------------------------------------------------------------------

/**
 * Internal: Normalize a TS node, returning an array of result nodes (0, 1, or many).
 * Transparent nodes promote their children into the parent's child list.
 *
 * @param {Node} node
 * @returns {Node[]}
 */
function _normalizeTsMulti(node, parentName = null) {
  if (!node) return [];

  const tsName = node.name;

  // Initializer modifiers belong to the declaration, outside its hidden brace body.
  if (tsName === 'anonymous_initializer') {
    const headers = node.children.filter(child => child.name === 'modifiers');
    const body = node.children.filter(child => child.name !== 'modifiers');
    return [new Node('CLASS_INITIALIZER', [
      ...headers.flatMap(child => _normalizeTsMulti(child, tsName)),
      new Node('BLOCK', body.flatMap(child => _normalizeTsMulti(child, tsName))),
    ])];
  }

  // _annotated_delegation_specifier is hidden; its prefix owns only this delegated entry.
  if (['class_declaration', 'object_declaration', 'object_literal', 'companion_object'].includes(tsName)) {
    const children = []; let changed = false;
    for (let i = 0; i < node.children.length; i++) {
      const first = node.children[i];
      if (first.name !== 'annotation') { children.push(first); continue; }
      let end = i + 1;
      while (end < node.children.length && ['annotation', 'line_comment', 'multiline_comment'].includes(node.children[end].name)) end++;
      const specifier = node.children[end];
      const entry = specifier?.name === 'delegation_specifier' && specifier.children.length === 1 && specifier.children[0];
      if (entry?.name !== 'explicit_delegation') { children.push(first); continue; }
      children.push(new Node('delegation_specifier', [new Node('explicit_delegation', node.children.slice(i, end).concat(entry.children))]));
      i = end; changed = true;
    }
    if (changed) return _normalizeTsMulti(new Node(tsName, children), parentName);
  }

  // A bracket annotation list aliases multiple unescaped entries inside one native annotation.
  if (tsName === 'annotation') {
    const entries = node.children.filter(child => ['user_type', 'constructor_invocation'].includes(child.name));
    const prefix = node.children.filter(child => !entries.includes(child));
    if (entries.length > 1 && prefix.every(child => ['use_site_target', 'line_comment', 'multiline_comment'].includes(child.name))) {
      return entries.flatMap(entry => _normalizeTsMulti(new Node('annotation', prefix.concat(entry)), parentName));
    }
  }

  // An inline final annotation makes a PSI LHS prefix; a line boundary retains the statement wrapper.
  if (tsName === 'annotated_expression') {
    const parts = node.children.filter(child => !['line_comment', 'multiline_comment'].includes(child.name));
    const assignment = parts[parts.length - 1];
    if (assignment?.name === 'assignment' && parts.length > 1 && parts.slice(0, -1).every(child => child.name === 'annotation')
        && node.sourceInfo?.inlineAssignmentAnnotation) {
      const lhs = new Node('prefix_expression', parts.slice(0, -1).concat(assignment.children[0]));
      return _normalizeTsMulti(new Node('assignment', [lhs, ...assignment.children.slice(1)]), parentName);
    }
  }

  // The restricted delegate grammar aliases a callee and its generic suffix separately.
  if (tsName === 'explicit_delegation') {
    const indices = node.children.map((child, i) => ['line_comment', 'multiline_comment'].includes(child.name) ? -1 : i).filter(i => i >= 0);
    const [leftIndex, rightIndex] = indices.slice(-2);
    const left = node.children[leftIndex], right = node.children[rightIndex];
    const receiver = left?.children.filter(child => !['line_comment', 'multiline_comment'].includes(child.name));
    const suffix = right?.children.filter(child => !['line_comment', 'multiline_comment'].includes(child.name));
    if (left?.name === 'call_expression' && receiver?.length === 1
        && right?.name === 'call_expression' && suffix?.length === 2
        && suffix[0].name === 'type_arguments' && suffix[1].name === 'value_arguments') {
      const comments = left.children.filter(child => ['line_comment', 'multiline_comment'].includes(child.name));
      const call = new Node('call_expression', [receiver[0], ...comments,
        ...node.children.slice(leftIndex + 1, rightIndex), new Node('call_suffix', right.children)]);
      return _normalizeTsMulti(new Node(tsName, [...node.children.slice(0, leftIndex), call, ...node.children.slice(rightIndex + 1)]), parentName);
    }
  }

  // _statement_annotations is hidden; only expression tails share that prefix.
  if ((['source_file', 'statements', 'control_structure_body'].includes(tsName)
      || (tsName === 'value_argument' && !node.sourceInfo?.tokens.some(token => ['=', '*'].includes(token.type))))
      && node.sourceInfo?.statementSpans && node.children.some(child => child.name === 'annotation')) {
    const grouped = groupStatementAnnotations(node);
    if (grouped.children.some((child, i) => child !== node.children[i])) {
      const replacement = new Node(tsName, grouped.children);
      Object.defineProperty(replacement, 'sourceInfo', {value: {...node.sourceInfo, statementSpans: grouped.spans}});
      return _normalizeTsMulti(replacement, parentName);
    }
  }

  // A declared when subject is the same property syntax as a local declaration.
  if (tsName === 'when_subject' && node.children.some(child =>
    ['variable_declaration', 'multi_variable_declaration'].includes(child.name))) {
    return _normalizeTsMulti(new Node('property_declaration', node.children), parentName);
  }

  // A string-content token is opaque; PSI splits the same text into literal and escape runs.
  if (tsName === 'string_literal' && node.sourceInfo?.string) {
    const children = [];
    const info = node.sourceInfo;
    if (info.string.prefix) children.push(new Node('STRING_INTERPOLATION_PREFIX', [], {
      value: info.string.prefix, start: info.start, end: info.start + info.string.prefix,
    }));
    let run;
    const flush = () => {
      if (run) children.push(...textNodes(run, info.string.raw));
      run = undefined;
    };
    for (const child of node.children) {
      const content = child.name === 'string_content' && child.sourceInfo;
      if (content) {
        if (run && run.end === content.start) {
          run = { start: run.start, end: content.end, text: run.text + content.text };
        } else { flush(); run = { ...content }; }
      } else { flush(); children.push(..._normalizeTsMulti(child, tsName)); }
    }
    flush();
    return [new Node('STRING_TEMPLATE', mergeRuns(children))];
  }
  // $this is a this-expression, while ordinary interpolated names remain references.
  if (tsName === 'interpolated_identifier' && node.sourceInfo?.text === 'this') {
    return [new Node('SHORT_STRING_TEMPLATE_ENTRY', [new Node('THIS_EXPRESSION')])];
  }

  // Mandatory brace bodies are hidden _block rules, but their scope is explicit in PSI.
  if (tsName === 'try_expression') {
    let end = node.children.findIndex(n => ['catch_block', 'finally_block'].includes(n.name));
    if (end < 0) end = node.children.length;
    return [new Node('TRY', [
      new Node('BLOCK', node.children.slice(0, end).flatMap(n => _normalizeTsMulti(n, tsName))),
      ...node.children.slice(end).flatMap(n => _normalizeTsMulti(n, tsName)),
    ])];
  }
  if (tsName === 'catch_block') {
    let body = node.children.findIndex(n => n.name === 'statements');
    if (body < 0) body = node.children.length;
    const parameter = new Node('parameter', node.children.slice(0, body));
    return [new Node('CATCH', [
      new Node('VALUE_PARAMETER_LIST', _normalizeTsMulti(parameter, 'function_value_parameters')),
      new Node('BLOCK', node.children.slice(body).flatMap(n => _normalizeTsMulti(n, tsName))),
    ])];
  }
  if (tsName === 'finally_block') {
    return [new Node('FINALLY', [new Node('BLOCK', node.children.flatMap(n => _normalizeTsMulti(n, tsName)))])];
  }
  // A secondary constructor's body is optional. Its implicit delegation has no source token.
  if (tsName === 'secondary_constructor') {
    const header = node.children.filter(n => ['modifiers', 'function_value_parameters', 'constructor_delegation_call'].includes(n.name));
    const body = node.children.filter(n => !header.includes(n));
    const children = header.flatMap(n => _normalizeTsMulti(n, tsName));
    if (!header.some(n => n.name === 'constructor_delegation_call')) children.push(new Node('CONSTRUCTOR_DELEGATION_CALL'));
    if (body.some(child => !['line_comment', 'multiline_comment'].includes(child.name)) || node.sourceInfo?.braced)
      children.push(new Node('BLOCK', body.flatMap(n => _normalizeTsMulti(n, tsName))));
    return [new Node('SECONDARY_CONSTRUCTOR', children)];
  }
  // Assignment targets emit postfix pieces instead of the expression wrapper used on the RHS.
  // The hidden lvalue rule still emits its postfix operators in their parsed order.
  if (tsName === 'directly_assignable_expression' && node.sourceInfo?.postfixSequence
      .some(part => !part.named && ['!!', '++', '--'].includes(part.type))) {
    let value, complete = true;
    for (const part of node.sourceInfo.postfixSequence) {
      if (!part.named) {
        if (!value || !['!!', '++', '--'].includes(part.type)) { complete = false; break; }
        value = new Node('postfix_expression', [value]);
      } else {
        const child = node.children[part.index];
        if (!child) { complete = false; break; }
        if (['line_comment', 'multiline_comment'].includes(child.name)) continue;
        if (!value) value = child;
        else if (['indexing_suffix', 'navigation_suffix'].includes(child.name)) {
          value = new Node(child.name === 'indexing_suffix' ? 'indexing_expression' : 'navigation_expression', [value, child]);
        } else { complete = false; break; }
      }
    }
    if (complete && value) return _normalizeTsMulti(value, parentName);
  }
  if (tsName === 'directly_assignable_expression' && node.children.slice(1).some(n => ['indexing_suffix', 'navigation_suffix'].includes(n.name))) {
    let value = node.children[0];
    for (const suffix of node.children.slice(1)) {
      if (!['indexing_suffix', 'navigation_suffix'].includes(suffix.name)) { value = null; break; }
      value = new Node(suffix.name === 'indexing_suffix' ? 'indexing_expression' : 'navigation_expression', [value, suffix]);
    }
    if (value) return _normalizeTsMulti(value, parentName);
  }
  // The parsed suffix operator, rather than its node label, identifies a callable reference.
  if (tsName === 'navigation_expression') {
    const suffix = node.children[node.children.length - 1];
    const operator = suffix?.sourceInfo?.tokens.find(n => ['.', '?.', '::'].includes(n.type));
    if (operator?.type === '::') {
      const isClass = suffix.sourceInfo.tokens.some(n => n.type === 'class');
      const argumentsNodes = suffix.children.filter(child => child.name === 'type_arguments');
      const selector = suffix.children.filter(child => child.name !== 'type_arguments');
      // PSI calls the parsed expression receiver Foo<T> a type-argument-only call.
      if (argumentsNodes.length === 1 && selector.every(child =>
        ['simple_identifier', 'line_comment', 'multiline_comment'].includes(child.name))) {
        const receiver = new Node('call_expression', node.children.slice(0, -1).concat(argumentsNodes));
        return [new Node(isClass ? 'CLASS_LITERAL_EXPRESSION' : 'CALLABLE_REFERENCE_EXPRESSION', [
          ..._normalizeTsMulti(receiver, tsName), ...selector.flatMap(child => _normalizeTsMulti(child, tsName)),
        ])];
      }
      return [new Node(isClass ? 'CLASS_LITERAL_EXPRESSION' : 'CALLABLE_REFERENCE_EXPRESSION',
        node.children.flatMap(n => _normalizeTsMulti(n, tsName)))];
    }
  }

  // Only a direct identifier under this/super denotes the @label. Identifiers
  // in user types retain the normal transparent treatment.
  if (tsName === 'type_identifier' && (parentName === 'this_expression' || parentName === 'super_expression')) {
    return [new Node('LABEL')];
  }

  // Preserve annotation ownership on both sides. Detached annotation siblings
  // must remain distinguishable from an annotated expression.
  if ((tsName === 'prefix_expression' || tsName === 'annotated_lambda')
      && node.children.some(child => child.name === 'annotation')) {
    const children = node.children.flatMap(child => _normalizeTsMulti(child, tsName));
    // An annotation directly on an anonymous function belongs to FUN's
    // modifiers in PSI, rather than an ANNOTATED_EXPRESSION around the FUN.
    if (tsName === 'prefix_expression' && node.children.some(child => child.name === 'anonymous_function')) {
      const fn = children.find(child => child.name === 'FUN');
      return [new Node('FUN', children.filter(child => child !== fn).concat(fn.children))];
    }
    return [new Node('ANNOTATED_EXPRESSION', children)];
  }

  if (parentName === 'for_statement' && tsName === 'variable_declaration') {
    return [new Node('VALUE_PARAMETER', _nestFunctionTypeContexts(
      node.children.flatMap(child => _normalizeTsMulti(child, tsName)), false))];
  }
  if (parentName === 'for_statement' && tsName === 'multi_variable_declaration') {
    return [new Node('VALUE_PARAMETER', _normalizeTsMulti(node))];
  }

  // A declaration's context list owns its parameters, including annotations
  // emitted as parameter_modifiers siblings by the grammar.
  if (tsName === 'context_receiver') {
    const entries = []; let modifiers = [];
    for (const child of node.children) {
      if (child.name === 'parameter_modifiers') modifiers.push(..._normalizeTsMulti(child, tsName));
      else {
        const normalized = _normalizeTsMulti(child, tsName);
        if (child.name === 'parameter' && modifiers.length) {
          normalized[0] = new Node('VALUE_PARAMETER', modifiers.concat(normalized[0].children));
        } else entries.push(...modifiers);
        modifiers = []; entries.push(...normalized);
      }
    }
    return [new Node('CONTEXT_PARAMETER_LIST', entries.concat(modifiers))];
  }

  // Recovery markers are explicit comparison nodes, including their named children.
  // The native fingerprint separately retains anonymous tokens and MISSING ranges.
  if (['ERROR', 'MISSING', 'UNEXPECTED'].includes(tsName)) {
    return [new Node(tsName, node.children.flatMap(child => _normalizeTsMulti(child, tsName)))];
  }

  // Nodes to skip entirely — transparent: promote children
  if (SKIP_TS_NODES.has(tsName)) {
    const kids = [];
    for (const child of node.children) {
      kids.push(..._normalizeTsMulti(child, tsName));
    }
    return tsName === 'variable_declaration' ? _nestFunctionTypeContexts(kids, false) : kids;
  }

  // Look up mapping
  const psiName = TS_TO_PSI[tsName];

  if (psiName === undefined) {
    throw new Error(`Unknown tree-sitter node type '${tsName}'; add an explicit mapping or transparent wrapper in tools/cross-validation/mapping.js`);
  }

  // Null mapping — transparent wrapper
  if (psiName === null) {
    const kids = [];
    for (const child of node.children) {
      kids.push(..._normalizeTsMulti(child, tsName));
    }
    return kids;
  }

  // Kotlin PSI models signed/unsigned numeric tokens as one atomic constant.
  if (tsName === 'unsigned_literal') {
    const children = node.children.flatMap(n => _normalizeTsMulti(n, tsName));
    if (children.length === 1 && children[0].name === 'INTEGER_CONSTANT') return children;
    return [new Node('INTEGER_CONSTANT', children)];
  }

  // lambda_parameters → preserve parameter count by generating VALUE_PARAMETER for each entry.
  // Plain lambda params (variable_declaration > simple_identifier) become transparent and vanish,
  // but PSI keeps them as empty VALUE_PARAMETER nodes. When destructuring is mixed with plain params,
  // we need to reconstruct the right number of VALUE_PARAMETER nodes.
  // Type annotations on destructuring params (from _lambda_parameter's optional type) appear as
  // siblings after multi_variable_declaration and need to be absorbed into the VALUE_PARAMETER.
  if (tsName === 'lambda_parameters') {
    const parameters = []; let current = null;
    const flush = () => { if (current !== null) parameters.push(new Node('VALUE_PARAMETER', current)); current = null; };
    for (const child of node.children) {
      const normalized = _normalizeTsMulti(child, tsName);
      if (child.name === 'variable_declaration' || child.name === 'multi_variable_declaration') {
        flush(); current = normalized;
      } else if (current !== null) current.push(...normalized);
      else parameters.push(...normalized);
    }
    flush();
    return [new Node('VALUE_PARAMETER_LIST', parameters)];
  }

  if (tsName === 'function_type_parameters') {
    const parameters = []; let modifiers = [];
    // The hidden dynamic type still occupies one function parameter slot.
    const inputs = node.sourceInfo?.typeParameterSequence
      ? node.sourceInfo.typeParameterSequence.flatMap(part => part.named
        ? [node.children[part.index]] : part.type === 'dynamic' ? [new Node('parameter')] : [])
      : node.children;
    for (const child of inputs) {
      const normalized = _normalizeTsMulti(child, tsName);
      if (child.name === 'type_modifiers') modifiers.push(...normalized);
      else if (child.name === 'parameter') {
        parameters.push(new Node('VALUE_PARAMETER', modifiers.concat(normalized[0].children))); modifiers = [];
      } else if (normalized.length) {
        parameters.push(new Node('VALUE_PARAMETER', modifiers.concat(normalized))); modifiers = [];
      }
    }
    parameters.push(...modifiers);
    return parameters.length ? [new Node('VALUE_PARAMETER_LIST', parameters)] : [];
  }

  // Normalize children (flattening transparent nodes)
  let children = [];
  for (const child of node.children) {
    children.push(..._normalizeTsMulti(child, tsName));
  }

  // Nest PROPERTY_ACCESSOR inside preceding PROPERTY (all TS nodes)
  children = _nestPropertyAccessors(children);

  // Type modifiers can precede a function_type or sit inside its receiver.
  // PSI places the context list directly inside FUNCTION_TYPE in both cases.
  if (['parameter', 'parenthesized_type', 'nullable_type', 'type_projection',
    'function_type', 'receiver_type'].includes(tsName)
      || (tsName === 'type_alias' && node.children.some(child => child.name === 'type_modifiers'))) {
    children = _nestFunctionTypeContexts(children, tsName === 'function_type');
  }

  // --- Special cases ---

  // An absent optional loop body is PSI's empty BODY slot, not a following sibling.
  if (['for_statement', 'while_statement'].includes(tsName)
      && !node.children.some(child => child.name === 'control_structure_body')) {
    children.push(new Node('BODY'));
  }

  // check_expression → IS_EXPRESSION for type tests, BINARY_EXPRESSION for in/!in
  if (tsName === 'check_expression') {
    const types = new Set(['type_test', 'user_type', 'nullable_type', 'function_type',
      'parenthesized_type', 'not_nullable_type', 'dynamic_type']);
    const hasTypeTest = node.children.some(c => types.has(c.name));
    if (!hasTypeTest) {
      return [new Node('BINARY_EXPRESSION', children)];
    }
    return [new Node('IS_EXPRESSION', children)];
  }

  // prefix_expression with label → transparent (matches PSI's LABELED_EXPRESSION)
  if (tsName === 'prefix_expression') {
    const hasLabel = node.children.some(c => c.name === 'label');
    if (hasLabel) {
      return children;
    }
  }

  // control_structure_body → BLOCK only for actual blocks, transparent otherwise
  if (tsName === 'control_structure_body') {
    const hasStatements = node.children.some(c => c.name === 'statements');
    const hasNonCommentChildren = node.children.some(c =>
      c.name !== 'statements' && c.name !== 'line_comment' && c.name !== 'multiline_comment'
    );
    const hasOnlyComments = !hasStatements && !hasNonCommentChildren &&
      node.children.some(c => c.name === 'line_comment' || c.name === 'multiline_comment');
    const isLoop = ['for_statement', 'while_statement', 'do_while_statement'].includes(parentName);
    let body;
    if (node.sourceInfo?.braced) body = [new Node('BLOCK', children)];
    else if (!hasStatements && hasNonCommentChildren) body = children;
    else if (hasStatements || hasOnlyComments || (isLoop && node.children.length === 0)) body = [new Node('BLOCK', children)];
    else body = children.length ? [new Node('BLOCK', children)] : [];
    return isLoop ? [new Node('BODY', body)] : body;
  }

  if ((tsName === 'property_declaration' || tsName === 'destructuring_declaration')
      && node.children.some(child => child.name === 'multi_variable_declaration')) {
    return [new Node('DESTRUCTURING_DECLARATION', children.flatMap(child =>
      child.name === 'DESTRUCTURING_DECLARATION' ? child.children : [child]))];
  }

  // ::class has no named member identifier; ::member does. Keep the PSI class
  // literal node instead of comparing it as a callable reference.
  if (tsName === 'callable_reference' && !node.children.some(child => child.name === 'simple_identifier')) {
    return [new Node('CLASS_LITERAL_EXPRESSION', children)];
  }
  // Qualified ::class can use navigation_expression instead. The grammar's
  // anonymous `class` selector is the only suffix with no named selector.
  const lastChild = node.children[node.children.length - 1];
  if (tsName === 'navigation_expression' && lastChild?.name === 'navigation_suffix'
      && lastChild.children.length === 0) {
    return [new Node('CLASS_LITERAL_EXPRESSION', children)];
  }

  // Empty DOT_QUALIFIED_EXPRESSION → drop
  if (psiName === 'DOT_QUALIFIED_EXPRESSION' && children.length === 0) {
    return [];
  }

  // CALL_EXPRESSION → flatten nested chains, then reorder DOT_QUALIFIED
  if (psiName === 'CALL_EXPRESSION') {
    const callee = node.children.find(child => !['line_comment', 'multiline_comment'].includes(child.name));
    // Applying a qualified call's result is an outer call, not another member suffix.
    if (callee?.name === 'call_expression' && children[0]?.name === 'DOT_QUALIFIED_EXPRESSION'
        && callee.children.some(child => child.name === 'call_suffix' && child.children.some(part =>
          ['value_arguments', 'annotated_lambda'].includes(part.name)))) {
      return [new Node('CALL_EXPRESSION', children)];
    }
    children = _flattenCallExpression(children);
    const reordered = _reorderDotQualifiedCall(children);
    if (reordered.length === 1 && reordered[0].name === 'DOT_QUALIFIED_EXPRESSION') {
      return reordered; // Already restructured, don't wrap in CALL_EXPRESSION
    }
    children = reordered;

    // If the original node was a dot-qualified call (navigation_expression child),
    // but the DQE was dropped because identifiers are transparent, still wrap in DQE
    if (node.children.some(c => c.name === 'navigation_expression') &&
        children.length > 0 && children[0].name !== 'DOT_QUALIFIED_EXPRESSION') {
      const innerCall = new Node('CALL_EXPRESSION', children);
      return [new Node('DOT_QUALIFIED_EXPRESSION', [innerCall])];
    }
  }

  // function_body — expression body detection
  if (tsName === 'function_body') {
    const hasStatements = node.children.some(c => c.name === 'statements');
    const hasNonCommentChildren = node.children.some(c =>
      c.name !== 'statements' && c.name !== 'line_comment' && c.name !== 'multiline_comment'
    );
    if (!hasStatements && hasNonCommentChildren) {
      // Expression body — transparent
      if (children.length === 1) return [children[0]];
      if (children.length === 0) return [];
      // Multiple children — keep wrapper
    }
    return [new Node('BLOCK', children)];
  }

  // PRIMARY_CONSTRUCTOR / PROPERTY_ACCESSOR → inject VALUE_PARAMETER_LIST if missing
  if (psiName === 'PRIMARY_CONSTRUCTOR') {
    children = _injectValueParameterList(children);
  }
  if (psiName === 'PROPERTY_ACCESSOR') {
    children = _injectValueParameterList(children);
  }

  // FUN / PROPERTY → unwrap FUNCTION_TYPE_RECEIVER
  if (psiName === 'FUN' || psiName === 'PROPERTY') {
    children = _unwrapFunctionTypeReceiver(children);
  }

  // FUNCTION_LITERAL → wrap body in BLOCK
  if (psiName === 'FUNCTION_LITERAL') {
    children = _wrapLambdaBodyInBlock(children);
  }

  // CLASS_INITIALIZER → wrap children in BLOCK
  if (psiName === 'CLASS_INITIALIZER') {
    children = [new Node('BLOCK', children)];
  }

  // OBJECT_LITERAL → inject OBJECT_DECLARATION wrapper
  if (psiName === 'OBJECT_LITERAL' && children.length > 0) {
    children = [new Node('OBJECT_DECLARATION', children)];
  }

  // VALUE_PARAMETER_LIST → absorb annotations/defaults, wrap bare types
  if (psiName === 'VALUE_PARAMETER_LIST') {
    children = _absorbIntoValueParameters(children);
    children = _wrapBareTypesInValueParameter(children);
    children = _wrapDestructuringInValueParameter(children);
  }

  // PARENTHESIZED → unwrap in type contexts (contains only type/annotation children)
  if (psiName === 'PARENTHESIZED') {
    const TYPE_NAMES = new Set(['USER_TYPE', 'FUNCTION_TYPE', 'NULLABLE_TYPE', 'ANNOTATION_ENTRY']);
    if (children.length > 0 && children.every(c => TYPE_NAMES.has(c.name))) {
      return children;
    }
  }

  // Drop empty IMPORT_LIST and PACKAGE_DIRECTIVE
  if ((psiName === 'IMPORT_LIST' || psiName === 'PACKAGE_DIRECTIVE') && children.length === 0) {
    return [];
  }

  // Drop empty VALUE_PARAMETER_LIST
  if (psiName === 'VALUE_PARAMETER_LIST' && children.length === 0) {
    return [];
  }

  // KtFile → merge consecutive FILE_ANNOTATION_LISTs
  if (psiName === 'KtFile') {
    children = _mergeFileAnnotationLists(children);
  }

  // Native nullable_type owns repeated quest children; PSI nests one wrapper per quest.
  if (tsName === 'nullable_type') {
    const count = node.children.filter(child => child.name === 'quest').length;
    if (count > 1) {
      let value = new Node('NULLABLE_TYPE', children);
      for (let i = 1; i < count; i++) value = new Node('NULLABLE_TYPE', [value]);
      return [value];
    }
  }

  return [new Node(psiName, children)];
}

/**
 * Normalize a tree-sitter AST node into the common representation.
 * Returns null if the node should be removed.
 *
 * @param {Node} node - A tree-sitter Node.
 * @returns {Node|null} Normalized node or null.
 */
function normalizeTs(node) {
  if (!node) return null;
  const results = _normalizeTsMulti(node);
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];
  return results[0];
}

function groupStatementAnnotations(node) {
  const result = [], resultSpans = [], spans = node.sourceInfo.statementSpans;
  const keep = (child, span) => { result.push(child); resultSpans.push(span); };
  for (let i = 0; i < node.children.length; i++) {
    const first = node.children[i];
    if (first.name !== 'annotation') { keep(first, spans[i]); continue; }
    let end = i + 1;
    while (end < node.children.length && ['annotation', 'label', 'line_comment', 'multiline_comment'].includes(node.children[end].name)) end++;
    const expression = node.children[end];
    const separated = spans[i] && spans[end] && node.sourceInfo.tokens.some(token =>
      token.type === ';' && token.start >= spans[i].end && token.end <= spans[end].start);
    if (!expression || !STATEMENT_EXPRESSIONS.has(expression.name) || separated) {
      keep(first, spans[i]); continue;
    }
    const tail = expression.name === 'prefix_expression' && expression.children.some(child => child.name === 'annotation')
      ? expression.children : [expression];
    keep(new Node('prefix_expression', node.children.slice(i, end).concat(tail)),
      spans[i] && spans[end] ? {start: spans[i].start, end: spans[end].end} : undefined);
    i = end;
  }
  return {children: result, spans: resultSpans};
}

function _nestFunctionTypeContexts(children, insideFunctionType) {
  const result = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i], next = children[i + 1];
    if (child.name === 'CONTEXT_PARAMETER_LIST' && next?.name === 'FUNCTION_TYPE') {
      result.push(new Node('FUNCTION_TYPE', [child, ...next.children])); i++;
    } else if (insideFunctionType && child.name === 'FUNCTION_TYPE_RECEIVER'
        && child.children.some(entry => entry.name === 'CONTEXT_PARAMETER_LIST')) {
      result.push(...child.children.filter(entry => entry.name === 'CONTEXT_PARAMETER_LIST'));
      result.push(new Node('FUNCTION_TYPE_RECEIVER', child.children.filter(entry => entry.name !== 'CONTEXT_PARAMETER_LIST')));
    } else result.push(child);
  }
  return result;
}


// ---------------------------------------------------------------------------
// PSI normalizer
// ---------------------------------------------------------------------------

/**
 * Internal: Normalize a PSI node, returning an array of result nodes.
 *
 * @param {Node} node
 * @returns {Node[]}
 */
function _normalizePsiMulti(node) {
  if (!node) return [];

  // Both PSI access labels use the native navigation wrapper; the operator stays lexical.
  const name = node.name === 'SAFE_ACCESS_EXPRESSION' ? 'DOT_QUALIFIED_EXPRESSION' : node.name;
  // A PSI bracket group's target applies to each entry, as in native annotation aliases.
  if (name === 'ANNOTATION') {
    const target = node.children.find(child => child.name === 'ANNOTATION_TARGET');
    const entries = node.children.filter(child => child.name === 'ANNOTATION_ENTRY');
    if (target && entries.length && node.children.every(child => child === target || entries.includes(child))) {
      return entries.flatMap(entry => _normalizePsiMulti(new Node('ANNOTATION_ENTRY', [target, ...entry.children])));
    }
  }
  // PSI's literal/escape segmentation is canonicalized from its own exact source spans.
  if (node.sourceInfo && name === 'LITERAL_STRING_TEMPLATE_ENTRY') {
    return [textNode(node.sourceInfo, true)];
  }
  if (node.sourceInfo && name === 'ESCAPE_STRING_TEMPLATE_ENTRY') {
    return [textNode(node.sourceInfo)];
  }
  if (node.sourceInfo && name === 'STRING_INTERPOLATION_PREFIX') {
    return [new Node(name, [], { value: node.sourceInfo.text.length, start: node.sourceInfo.start, end: node.sourceInfo.end })];
  }
  // Tree-sitter represents KDoc as a comment, without PSI's documentation AST.
  // Remove that AST before testing whether an import/package list is empty.
  if (name.startsWith('KDOC_')) return [];
  if (name === 'SCRIPT') {
    return node.children.flatMap(child => child.name === 'BLOCK'
      ? child.children.flatMap(_normalizePsiMulti) : _normalizePsiMulti(child));
  }
  if (name === 'SCRIPT_INITIALIZER') return node.children.flatMap(_normalizePsiMulti);

  // Skip transparent PSI nodes — promote children
  if (SKIP_PSI_NODES.has(name)) {
    const kids = [];
    for (const child of node.children) {
      kids.push(..._normalizePsiMulti(child));
    }
    return kids;
  }

  // Normalize children (flattening transparent nodes)
  let children = [];
  for (const child of node.children) {
    children.push(..._normalizePsiMulti(child));
  }

  // --- PSI-specific special cases ---

  // Wrapper collapse
  if (WRAPPER_COLLAPSE[name]) {
    const collapsed = WRAPPER_COLLAPSE[name];
    return [new Node(collapsed, children)];
  }

  // Empty PACKAGE_DIRECTIVE → drop
  if (name === 'PACKAGE_DIRECTIVE' && node.children.length === 0) {
    return [];
  }
  // Also drop if normalized children are empty
  if (name === 'PACKAGE_DIRECTIVE' && children.length === 0) {
    return [];
  }

  // Empty IMPORT_LIST → drop
  if (name === 'IMPORT_LIST' && children.length === 0) {
    return [];
  }

  // Empty VALUE_PARAMETER_LIST → drop
  if (name === 'VALUE_PARAMETER_LIST' && children.length === 0) {
    return [];
  }

  // Pure DOT_QUALIFIED_EXPRESSION chains → collapse to nothing
  if (name === 'DOT_QUALIFIED_EXPRESSION') {
    const referenceOnly = n => n.name === 'DOT_QUALIFIED_EXPRESSION' && n.children.every(referenceOnly);
    if (children.every(referenceOnly)) {
      return [];
    }
  }

  // Nest PROPERTY_ACCESSOR inside preceding PROPERTY
  if (name === 'CLASS_BODY' || name === 'KtFile' || name === 'BLOCK') {
    children = _nestPropertyAccessors(children);
  }

  // _injectValueParameterList for PSI side
  if (name === 'PRIMARY_CONSTRUCTOR') {
    children = _injectValueParameterList(children);
  }
  if (name === 'PROPERTY_ACCESSOR') {
    children = _injectValueParameterList(children);
  }

  // FUN / PROPERTY → unwrap FUNCTION_TYPE_RECEIVER
  if (name === 'FUN' || name === 'PROPERTY') {
    children = _unwrapFunctionTypeReceiver(children);
  }

  // CALL_EXPRESSION → flatten nested chains
  if (name === 'CALL_EXPRESSION') {
    children = _flattenCallExpression(children);
  }
  if (name === 'STRING_TEMPLATE') children = mergeRuns(children);

  // Empty DOT_QUALIFIED_EXPRESSION → drop
  if (name === 'DOT_QUALIFIED_EXPRESSION' && children.length === 0) {
    return [];
  }

  // FUNCTION_LITERAL → wrap body in BLOCK (same as TS side)
  if (name === 'FUNCTION_LITERAL') {
    children = _wrapLambdaBodyInBlock(children);
  }

  // CLASS_INITIALIZER → wrap children in BLOCK (PSI side only if not already a BLOCK)
  if (name === 'CLASS_INITIALIZER') {
    // PSI already has BLOCK inside CLASS_INITIALIZER — don't double-wrap
    const hasBlock = children.some(child => child.name === 'BLOCK');
    if (!hasBlock) {
      children = [new Node('BLOCK', children)];
    }
  }

  // OBJECT_LITERAL → inject OBJECT_DECLARATION wrapper (only if not already present)
  if (name === 'OBJECT_LITERAL') {
    const hasObjDecl = children.some(c => c.name === 'OBJECT_DECLARATION');
    if (!hasObjDecl) {
      children = [new Node('OBJECT_DECLARATION', children)];
    }
  }

  // VALUE_PARAMETER_LIST → wrap bare types in VALUE_PARAMETER
  if (name === 'VALUE_PARAMETER_LIST') {
    children = _wrapBareTypesInValueParameter(children);
  }

  // ENUM_ENTRY → strip USER_TYPE from ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION
  if (name === 'ENUM_ENTRY') {
    children = _stripEnumEntryUserType(children);
  }

  // FILE_ANNOTATION_LIST → strip ANNOTATION_ENTRY and ANNOTATION_TARGET wrappers
  if (name === 'FILE_ANNOTATION_LIST') {
    children = _stripAnnotationWrappers(children);
  }

  // USER_TYPE → flatten nested chains (PSI nests, TS flattens)
  if (name === 'USER_TYPE') {
    children = _flattenUserType(children);
  }

  return [new Node(name, children)];
}

/**
 * Normalize a PSI AST node into the common representation.
 * Returns null if the node should be removed.
 *
 * @param {Node} node - A PSI Node.
 * @returns {Node|null} Normalized node or null.
 */
function normalizePsi(node) {
  if (!node) return null;
  const results = _normalizePsiMulti(node);
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];
  return results[0];
}


// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Flatten nested CALL_EXPRESSION chains.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _flattenCallExpression(children) {
  if (!children.length || children[0].name !== 'CALL_EXPRESSION') {
    return children;
  }
  // Recursively flatten the first child
  const inner = children[0];
  const rest = children.slice(1);
  const innerFlattened = _flattenCallExpression(inner.children);
  return innerFlattened.concat(rest);
}

/**
 * Reorder DOT_QUALIFIED_EXPRESSION inside CALL_EXPRESSION to match PSI nesting.
 * TS: CALL_EXPRESSION(DOT_QUALIFIED_EXPRESSION(recv, member), args...)
 * PSI: DOT_QUALIFIED_EXPRESSION(recv, CALL_EXPRESSION(member, args...))
 * @param {Node[]} children - Already-flattened children of a CALL_EXPRESSION
 * @returns {Node[]} Possibly restructured as DOT_QUALIFIED_EXPRESSION wrapping CALL_EXPRESSION
 */
function _reorderDotQualifiedCall(children) {
  if (children.length < 2 || children[0].name !== 'DOT_QUALIFIED_EXPRESSION') {
    return children;
  }
  const dqe = children[0];
  const callArgs = children.slice(1);

  if (dqe.children.length === 0) return children;

  if (dqe.children.length === 1) {
    // DQE has only receiver (member name was transparent identifier, dropped)
    // → DOT_QUALIFIED_EXPRESSION(receiver, CALL_EXPRESSION(args...))
    const receiver = dqe.children[0];
    const innerCall = new Node('CALL_EXPRESSION', callArgs);
    return [new Node('DOT_QUALIFIED_EXPRESSION', [receiver, innerCall])];
  }

  // DQE has receiver + member: pull last child as call target
  const dqeReceiver = dqe.children.slice(0, -1);
  const callTarget = dqe.children[dqe.children.length - 1];
  const innerCall = new Node('CALL_EXPRESSION', [callTarget, ...callArgs]);
  const receiver = dqeReceiver.length === 1 ? dqeReceiver[0] :
    new Node('DOT_QUALIFIED_EXPRESSION', dqeReceiver);
  return [new Node('DOT_QUALIFIED_EXPRESSION', [receiver, innerCall])];
}

/**
 * Inject VALUE_PARAMETER_LIST wrapper around VALUE_PARAMETER children if not already present.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _injectValueParameterList(children) {
  if (children.some(c => c.name === 'VALUE_PARAMETER_LIST')) {
    return children;
  }
  if (!children.some(c => c.name === 'VALUE_PARAMETER')) {
    return children;
  }

  const result = [];
  const paramGroup = [];

  for (const child of children) {
    if (child.name === 'VALUE_PARAMETER') {
      paramGroup.push(child);
    } else {
      if (paramGroup.length > 0) {
        result.push(new Node('VALUE_PARAMETER_LIST', paramGroup.slice()));
        paramGroup.length = 0;
      }
      result.push(child);
    }
  }

  if (paramGroup.length > 0) {
    result.push(new Node('VALUE_PARAMETER_LIST', paramGroup));
  }

  return result;
}

/**
 * Unwrap FUNCTION_TYPE_RECEIVER: pull its children into the parent.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _unwrapFunctionTypeReceiver(children) {
  if (!children.some(c => c.name === 'FUNCTION_TYPE_RECEIVER')) {
    return children;
  }
  const result = [];
  for (const child of children) {
    if (child.name === 'FUNCTION_TYPE_RECEIVER') {
      result.push(...child.children);
    } else {
      result.push(child);
    }
  }
  return result;
}

/**
 * Wrap bare type nodes in VALUE_PARAMETER within a VALUE_PARAMETER_LIST.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _wrapBareTypesInValueParameter(children) {
  const TYPE_NAMES = new Set(['USER_TYPE', 'NULLABLE_TYPE', 'FUNCTION_TYPE', 'PARENTHESIZED']);
  if (!children.some(c => TYPE_NAMES.has(c.name))) {
    return children;
  }
  // Only wrap if there are no VALUE_PARAMETER children already
  if (children.some(c => c.name === 'VALUE_PARAMETER')) {
    return children;
  }
  return children.map(child => {
    if (TYPE_NAMES.has(child.name)) {
      return new Node('VALUE_PARAMETER', [child]);
    }
    return child;
  });
}

/**
 * Move PROPERTY_ACCESSOR nodes after PROPERTY into the preceding PROPERTY as children.
 * Caps at 2 accessors per property (getter + setter) to match PSI error recovery.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _nestPropertyAccessors(children) {
  if (!children.some(c => c.name === 'PROPERTY_ACCESSOR')) {
    return children;
  }
  const result = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.name === 'PROPERTY_ACCESSOR' && result.length > 0) {
      const last = result[result.length - 1];
      if (last.name === 'PROPERTY') {
        const accessorCount = last.children.filter(c => c.name === 'PROPERTY_ACCESSOR').length;
        if (accessorCount < 2) {
          // Create new node to avoid mutation
          result[result.length - 1] = new Node('PROPERTY', last.children.concat([child]));
          continue;
        }
        // More than 2 accessors: drop extra (PSI treats them as errors)
        continue;
      }
    }
    result.push(child);
  }
  return result;
}

/**
 * Wrap lambda body statements in BLOCK node.
 * Separates VALUE_PARAMETER_LIST from body content and wraps body in BLOCK.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _wrapLambdaBodyInBlock(children) {
  const params = children.filter(c => c.name === 'VALUE_PARAMETER_LIST');
  const body = children.filter(c => c.name !== 'VALUE_PARAMETER_LIST');

  if (body.length === 1 && body[0].name === 'BLOCK') {
    // Already wrapped
    return [...params, ...body];
  }
  if (body.length > 0) {
    return [...params, new Node('BLOCK', body)];
  }
  // Empty body
  return [...params, new Node('BLOCK')];
}

/**
 * Merge consecutive FILE_ANNOTATION_LIST nodes into a single list.
 * Does not add ANNOTATION_ENTRY/TARGET wrappers — both sides strip them.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _mergeFileAnnotationLists(children) {
  if (!children.some(c => c.name === 'FILE_ANNOTATION_LIST')) {
    return children;
  }
  const result = [];
  let mergedContent = [];

  for (const child of children) {
    if (child.name === 'FILE_ANNOTATION_LIST') {
      // Strip ANNOTATION_TARGET from TS children (comes from use_site_target)
      const content = child.children.filter(c => c.name !== 'ANNOTATION_TARGET');
      mergedContent.push(...content);
    } else {
      if (mergedContent.length > 0) {
        result.push(new Node('FILE_ANNOTATION_LIST', mergedContent));
        mergedContent = [];
      }
      result.push(child);
    }
  }
  if (mergedContent.length > 0) {
    result.push(new Node('FILE_ANNOTATION_LIST', mergedContent));
  }
  return result;
}

/**
 * Absorb annotations and default value expressions into VALUE_PARAMETER nodes.
 * Annotations before a VALUE_PARAMETER become its children (prepended).
 * Expressions after a VALUE_PARAMETER become its children (appended as defaults).
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _absorbIntoValueParameters(children) {
  if (!children.some(c => c.name === 'VALUE_PARAMETER')) {
    return children;
  }
  // Check if there are stray nodes that need absorption
  const hasStray = children.some(c =>
    c.name !== 'VALUE_PARAMETER' && c.name !== 'VALUE_PARAMETER_LIST'
  );
  if (!hasStray) return children;

  const result = [];
  let pending = []; // annotations waiting to be absorbed into next VP

  for (const child of children) {
    if (child.name === 'VALUE_PARAMETER') {
      // Absorb any pending annotations into this parameter
      if (pending.length > 0) {
        result.push(new Node('VALUE_PARAMETER', [...pending, ...child.children]));
        pending = [];
      } else {
        result.push(child);
      }
    } else if (child.name === 'ANNOTATION_ENTRY') {
      // Queue annotations to be absorbed into the next VALUE_PARAMETER
      pending.push(child);
    } else if (result.length > 0 && result[result.length - 1].name === 'VALUE_PARAMETER') {
      // Non-annotation, non-VP after VP → default value, absorb into preceding VP
      const vp = result[result.length - 1];
      result[result.length - 1] = new Node('VALUE_PARAMETER', vp.children.concat([child]));
    } else {
      result.push(child);
    }
  }
  // If there are leftover pending annotations with no following VP, just add them
  result.push(...pending);
  return result;
}

/**
 * Strip USER_TYPE from ENUM_ENTRY (comes from ENUM_ENTRY_SUPERCLASS_REFERENCE_EXPRESSION).
 * tree-sitter doesn't produce this implicit superclass reference.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _stripEnumEntryUserType(children) {
  // Only strip if there's also a VALUE_ARGUMENT_LIST (i.e., it's a constructor call)
  const hasVAL = children.some(c => c.name === 'VALUE_ARGUMENT_LIST');
  if (!hasVAL) return children;
  return children.filter(c => c.name !== 'USER_TYPE');
}

/**
 * Flatten nested USER_TYPE chains (PSI nests qualified types, TS flattens them).
 * USER_TYPE(USER_TYPE(USER_TYPE, TAL), TAL) → USER_TYPE(TAL, TAL)
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _flattenUserType(children) {
  if (!children.some(c => c.name === 'USER_TYPE')) {
    return children;
  }
  const result = [];
  for (const child of children) {
    if (child.name === 'USER_TYPE') {
      result.push(..._flattenUserType(child.children));
    } else {
      result.push(child);
    }
  }
  return result;
}

/**
 * Strip ANNOTATION_ENTRY and ANNOTATION_TARGET wrappers inside FILE_ANNOTATION_LIST.
 * Promotes ANNOTATION_ENTRY children; drops empty ANNOTATION_TARGET nodes.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _stripAnnotationWrappers(children) {
  const result = [];
  for (const child of children) {
    if (child.name === 'ANNOTATION_ENTRY') {
      // Promote children, recursively stripping nested wrappers
      result.push(..._stripAnnotationWrappers(child.children));
    } else if (child.name === 'ANNOTATION_TARGET') {
      // Drop annotation targets (they contain no structural info after normalization)
    } else {
      result.push(child);
    }
  }
  return result;
}

/**
 * Wrap DESTRUCTURING_DECLARATION nodes in VALUE_PARAMETER inside VALUE_PARAMETER_LIST.
 * PSI wraps each destructured lambda parameter as VALUE_PARAMETER > DESTRUCTURING_DECLARATION.
 * @param {Node[]} children
 * @returns {Node[]}
 */
function _wrapDestructuringInValueParameter(children) {
  if (!children.some(c => c.name === 'DESTRUCTURING_DECLARATION')) {
    return children;
  }
  return children.map(child => {
    if (child.name === 'DESTRUCTURING_DECLARATION') {
      return new Node('VALUE_PARAMETER', [child]);
    }
    return child;
  });
}

module.exports = { normalizeTs, normalizePsi };
