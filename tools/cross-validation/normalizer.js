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

  // CALL_EXPRESSION → flatten nested chains
  if (psiName === 'CALL_EXPRESSION') {
    children = _flattenCallExpression(children);
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

  // Empty FUNCTION_LITERAL → inject BLOCK child
  if (psiName === 'FUNCTION_LITERAL' && children.length === 0) {
    children = [new Node('BLOCK')];
  }

  // CLASS_INITIALIZER → wrap children in BLOCK
  if (psiName === 'CLASS_INITIALIZER' && children.length > 0) {
    children = [new Node('BLOCK', children)];
  }

  // OBJECT_LITERAL → inject OBJECT_DECLARATION wrapper
  if (psiName === 'OBJECT_LITERAL' && children.length > 0) {
    children = [new Node('OBJECT_DECLARATION', children)];
  }

  // VALUE_PARAMETER_LIST → wrap bare types in VALUE_PARAMETER
  if (psiName === 'VALUE_PARAMETER_LIST') {
    children = _wrapBareTypesInValueParameter(children);
  }

  // Drop empty IMPORT_LIST and PACKAGE_DIRECTIVE
  if ((psiName === 'IMPORT_LIST' || psiName === 'PACKAGE_DIRECTIVE') && children.length === 0) {
    return [];
  }

  // Drop empty MODIFIER_LIST — modifier keywords are leaves
  if (psiName === 'MODIFIER_LIST' && children.length === 0) {
    return [];
  }

  // Drop empty VALUE_PARAMETER_LIST
  if (psiName === 'VALUE_PARAMETER_LIST' && children.length === 0) {
    return [];
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

  // Empty MODIFIER_LIST → drop
  if (name === 'MODIFIER_LIST' && children.length === 0) {
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

  // Empty FUNCTION_LITERAL → inject BLOCK child
  if (name === 'FUNCTION_LITERAL' && children.length === 0) {
    children = [new Node('BLOCK')];
  }

  // CLASS_INITIALIZER → wrap children in BLOCK (PSI side only if not already a BLOCK)
  if (name === 'CLASS_INITIALIZER') {
    // PSI already has BLOCK inside CLASS_INITIALIZER — don't double-wrap
    const hasBlock = children.length === 1 && children[0].name === 'BLOCK';
    if (!hasBlock) {
      children = [new Node('BLOCK', children)];
    }
  }

  // OBJECT_LITERAL → inject OBJECT_DECLARATION wrapper
  if (name === 'OBJECT_LITERAL') {
    children = [new Node('OBJECT_DECLARATION', children)];
  }

  // VALUE_PARAMETER_LIST → wrap bare types in VALUE_PARAMETER
  if (name === 'VALUE_PARAMETER_LIST') {
    children = _wrapBareTypesInValueParameter(children);
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

module.exports = { normalizeTs, normalizePsi };
