/**
 * AST normalizer for cross-validation between tree-sitter and PSI trees.
 * @module normalizer
 */

'use strict';

const { Node } = require('./models');
const {
  TS_TO_PSI,
  SKIP_TS_NODES,
  SKIP_PSI_NODES,
  WRAPPER_COLLAPSE,
} = require('./mapping');

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
function _normalizeTsMulti(node) {
  if (!node) return [];

  const tsName = node.name;

  // Nodes to skip entirely — transparent: promote children
  if (SKIP_TS_NODES.has(tsName)) {
    const kids = [];
    for (const child of node.children) {
      kids.push(..._normalizeTsMulti(child));
    }
    return kids;
  }

  // Look up mapping
  const psiName = TS_TO_PSI[tsName];

  // Unknown TS node — transparent
  if (psiName === undefined) {
    const kids = [];
    for (const child of node.children) {
      kids.push(..._normalizeTsMulti(child));
    }
    return kids;
  }

  // Null mapping — transparent wrapper
  if (psiName === null) {
    const kids = [];
    for (const child of node.children) {
      kids.push(..._normalizeTsMulti(child));
    }
    return kids;
  }

  // Normalize children (flattening transparent nodes)
  let children = [];
  for (const child of node.children) {
    children.push(..._normalizeTsMulti(child));
  }

  // Nest PROPERTY_ACCESSOR inside preceding PROPERTY (all TS nodes)
  children = _nestPropertyAccessors(children);

  // --- Special cases ---

  // check_expression → IS_EXPRESSION for type tests, BINARY_EXPRESSION for in/!in
  if (tsName === 'check_expression') {
    const hasTypeTest = node.children.some(c =>
      c.name === 'type_test' || c.name === 'user_type' || c.name === 'nullable_type'
    );
    if (!hasTypeTest) {
      return [new Node('BINARY_EXPRESSION', children)];
    }
    return [new Node('IS_EXPRESSION', children)];
  }

  // control_structure_body → BLOCK only for actual blocks, transparent otherwise
  if (tsName === 'control_structure_body') {
    const hasStatements = node.children.some(c => c.name === 'statements');
    const hasNonCommentChildren = node.children.some(c =>
      c.name !== 'statements' && c.name !== 'line_comment' && c.name !== 'multiline_comment'
    );
    if (!hasStatements && hasNonCommentChildren) {
      // Single-expression body — transparent
      if (children.length === 1) return [children[0]];
      if (children.length === 0) return [];
    }
    if (children.length === 0) return [];
    return [new Node('BLOCK', children)];
  }

  // Empty DOT_QUALIFIED_EXPRESSION → drop
  if (psiName === 'DOT_QUALIFIED_EXPRESSION' && children.length === 0) {
    return [];
  }

  // CALL_EXPRESSION → flatten nested chains, then reorder DOT_QUALIFIED
  if (psiName === 'CALL_EXPRESSION') {
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
  if (psiName === 'CLASS_INITIALIZER' && children.length > 0) {
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

  const name = node.name;

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
    const nonDqe = children.filter(c => c.name !== 'DOT_QUALIFIED_EXPRESSION');
    if (nonDqe.length === 0) {
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
    const hasBlock = children.length === 1 && children[0].name === 'BLOCK';
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

  // SAFE_ACCESS_EXPRESSION → DOT_QUALIFIED_EXPRESSION
  if (name === 'SAFE_ACCESS_EXPRESSION') {
    return [new Node('DOT_QUALIFIED_EXPRESSION', children)];
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
        // Create new node to avoid mutation
        result[result.length - 1] = new Node('PROPERTY', last.children.concat([child]));
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

module.exports = { normalizeTs, normalizePsi };
