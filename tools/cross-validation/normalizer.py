"""Tree normalization for cross-parser comparison.

Normalizes tree-sitter and JetBrains PSI trees so they can be
structurally compared. Normalization includes:

- Renaming tree-sitter nodes to their PSI equivalents via TS_TO_PSI
- Skipping nodes that have no counterpart (SKIP_TS_NODES / SKIP_PSI_NODES)
- Collapsing wrapper chains (WRAPPER_COLLAPSE)
- Lifting children of skipped nodes into the parent
"""

from __future__ import annotations

from mapping import (
    SKIP_PSI_NODES,
    SKIP_TS_NODES,
    TS_TO_PSI,
    WRAPPER_COLLAPSE,
)
from models import Node


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def normalize_ts(node: Node) -> Node | None:
    """Normalize a tree-sitter tree for comparison with PSI.

    Applies the TS_TO_PSI name mapping, skips nodes listed in
    SKIP_TS_NODES (promoting their children), and drops nodes with
    no mapping (None in TS_TO_PSI) that aren't in SKIP_TS_NODES.

    Args:
        node: Root of the tree-sitter Node tree.

    Returns:
        A new normalized Node tree, or None if the entire tree is unmapped.
    """
    return _normalize_ts_node(node)


def normalize_psi(node: Node) -> Node | None:
    """Normalize a JetBrains PSI tree for comparison with tree-sitter.

    Skips nodes listed in SKIP_PSI_NODES (promoting their children)
    and collapses wrapper chains defined in WRAPPER_COLLAPSE.

    Args:
        node: Root of the PSI Node tree.

    Returns:
        A new normalized Node tree, or None if the entire tree is skipped.
    """
    return _normalize_psi_node(node)


# ---------------------------------------------------------------------------
# Internals — tree-sitter normalization
# ---------------------------------------------------------------------------


def _nest_property_accessors(children: list[Node]) -> list[Node]:
    """Nest PROPERTY_ACCESSOR nodes inside the preceding PROPERTY node.

    In tree-sitter, getter/setter nodes are siblings of property_declaration.
    In PSI, PROPERTY_ACCESSOR is a child of PROPERTY. This function moves
    PROPERTY_ACCESSOR nodes into the preceding PROPERTY.
    """
    if not any(c.name == "PROPERTY_ACCESSOR" for c in children):
        return children

    result: list[Node] = []
    for child in children:
        if child.name == "PROPERTY_ACCESSOR" and result and result[-1].name == "PROPERTY":
            # Absorb into preceding PROPERTY
            prop = result[-1]
            result[-1] = Node(
                name="PROPERTY",
                children=prop.children + [child],
            )
        else:
            result.append(child)
    return result


def _inject_value_parameter_list(children: list[Node]) -> list[Node]:
    """Wrap consecutive VALUE_PARAMETER children in a VALUE_PARAMETER_LIST.

    In tree-sitter, primary_constructor has class_parameter children directly,
    but PSI wraps them in VALUE_PARAMETER_LIST. This function groups
    VALUE_PARAMETER children into a VALUE_PARAMETER_LIST wrapper to match PSI.
    """
    if not any(c.name == "VALUE_PARAMETER" for c in children):
        return children

    result: list[Node] = []
    param_group: list[Node] = []

    for child in children:
        if child.name == "VALUE_PARAMETER":
            param_group.append(child)
        else:
            if param_group:
                result.append(Node(name="VALUE_PARAMETER_LIST", children=param_group))
                param_group = []
            result.append(child)

    if param_group:
        result.append(Node(name="VALUE_PARAMETER_LIST", children=param_group))

    return result


def _normalize_ts_node(node: Node) -> Node | None:
    """Normalize a single tree-sitter node recursively."""
    # Recursively normalize children first
    normalized_children: list[Node] = []
    for child in node.children:
        normalized = _normalize_ts_child(child)
        normalized_children.extend(normalized)

    # Nest PROPERTY_ACCESSOR inside preceding PROPERTY — tree-sitter puts
    # getter/setter as siblings of property_declaration, but PSI nests
    # PROPERTY_ACCESSOR inside PROPERTY.
    normalized_children = _nest_property_accessors(normalized_children)

    # Check if this node should be skipped (promote its children)
    if node.name in SKIP_TS_NODES:
        if len(normalized_children) == 1:
            return normalized_children[0]
        elif len(normalized_children) > 1:
            # Can't promote multiple children to one slot — try mapped name
            mapped = TS_TO_PSI.get(node.name)
            if mapped:
                return Node(name=mapped, children=normalized_children)
            # No mapping; promote children will be handled by parent
            return None
        return None

    # Map the name
    mapped_name = TS_TO_PSI.get(node.name)
    if mapped_name is None:
        # Unknown or explicitly unmapped — skip, promote children
        if len(normalized_children) == 1:
            return normalized_children[0]
        elif len(normalized_children) > 1:
            # Keep with original name as fallback so structure is preserved
            return Node(name=node.name, children=normalized_children)
        return None

    # Handle check_expression: PSI uses IS_EXPRESSION for `is`/`!is` (type check)
    # but BINARY_EXPRESSION for `in`/`!in` (containment check). Tree-sitter uses
    # check_expression for both. Distinguish by checking if any child is a type
    # node (user_type, nullable_type, etc.) — if so, it's IS_EXPRESSION.
    if node.name == "check_expression":
        type_children = {"user_type", "nullable_type", "parenthesized_type",
                         "function_type", "type_identifier"}
        has_type_child = any(c.name in type_children for c in node.children)
        mapped_name = "IS_EXPRESSION" if has_type_child else "BINARY_EXPRESSION"

    # Handle control_structure_body: maps to BLOCK only for actual blocks (with
    # statements or empty {}). For single-expression bodies like `if (x) expr`,
    # the body is transparent — the expression is promoted directly.
    if mapped_name == "BLOCK" and node.name == "control_structure_body":
        has_statements = any(c.name == "statements" for c in node.children)
        has_non_comment_children = any(
            c.name not in ("statements", "line_comment", "multiline_comment")
            for c in node.children
        )
        if not has_statements and has_non_comment_children:
            # Single-expression body — skip BLOCK wrapper, promote children
            if len(normalized_children) == 1:
                return normalized_children[0]
            elif not normalized_children:
                return None

    # Skip leaf DOT_QUALIFIED_EXPRESSION — when all identifier children are
    # removed, the node is a pure name reference (like a.b.c). PSI equivalent
    # also collapses to nothing after REFERENCE_EXPRESSION removal.
    if mapped_name == "DOT_QUALIFIED_EXPRESSION" and not normalized_children:
        return None

    # Inject VALUE_PARAMETER_LIST wrapper for PRIMARY_CONSTRUCTOR and
    # PROPERTY_ACCESSOR — tree-sitter puts parameters directly as children,
    # but PSI wraps them in VALUE_PARAMETER_LIST.
    if mapped_name in ("PRIMARY_CONSTRUCTOR", "PROPERTY_ACCESSOR"):
        normalized_children = _inject_value_parameter_list(normalized_children)

    # Unwrap FUNCTION_TYPE_RECEIVER for extension functions/properties.
    # In PSI, extension receivers are bare USER_TYPE under FUN/PROPERTY,
    # but tree-sitter wraps them in receiver_type -> FUNCTION_TYPE_RECEIVER.
    if mapped_name in ("FUN", "PROPERTY"):
        normalized_children = _unwrap_receiver_type(normalized_children)

    # Flatten nested CALL_EXPRESSION chains — tree-sitter nests trailing
    # lambdas as new CALL_EXPRESSION wrappers around the previous call,
    # but PSI puts all children (args, lambdas) flat under one CALL_EXPRESSION.
    if mapped_name == "CALL_EXPRESSION":
        normalized_children = _flatten_call_expression(normalized_children)

    # Inject empty BLOCK into FUNCTION_LITERAL — PSI always emits
    # FUNCTION_LITERAL > BLOCK (even for empty lambdas `{}`), but
    # tree-sitter's lambda_literal has no children when the body is empty.
    if mapped_name == "FUNCTION_LITERAL" and not normalized_children:
        normalized_children = [Node(name="BLOCK")]

    # Wrap CLASS_INITIALIZER children in BLOCK — PSI always has
    # CLASS_INITIALIZER > BLOCK > [children], but tree-sitter has
    # anonymous_initializer > statements > [children] where statements
    # is transparent and children get promoted directly.
    if mapped_name == "CLASS_INITIALIZER" and normalized_children:
        normalized_children = [Node(name="BLOCK", children=normalized_children)]

    # Inject OBJECT_DECLARATION wrapper inside OBJECT_LITERAL — PSI has
    # OBJECT_LITERAL > OBJECT_DECLARATION > [children], but tree-sitter has
    # object_literal > [children] directly.
    if mapped_name == "OBJECT_LITERAL" and normalized_children:
        normalized_children = [Node(name="OBJECT_DECLARATION", children=normalized_children)]

    # Wrap bare USER_TYPE children in VALUE_PARAMETER inside VALUE_PARAMETER_LIST —
    # in function_type_parameters, tree-sitter puts user_type directly as children,
    # but PSI wraps each parameter type in VALUE_PARAMETER > USER_TYPE.
    if mapped_name == "VALUE_PARAMETER_LIST":
        normalized_children = _wrap_bare_types_in_value_parameter(normalized_children)

    # Handle function_body expression bodies — tree-sitter wraps both
    # block bodies `{ ... }` and expression bodies `= expr` in function_body.
    # PSI only uses BLOCK for block bodies. Detect expression bodies by
    # checking if the original node had a `statements` child (block body)
    # or was empty (empty block body). Expression bodies have non-statements
    # children (like integer_literal, call_expression, etc.).
    if mapped_name == "BLOCK" and node.name == "function_body":
        has_statements = any(c.name == "statements" for c in node.children)
        has_non_comment_children = any(
            c.name not in ("statements", "line_comment", "multiline_comment")
            for c in node.children
        )
        if not has_statements and has_non_comment_children:
            # Expression body — skip BLOCK wrapper, promote children
            if len(normalized_children) == 1:
                return normalized_children[0]
            elif not normalized_children:
                return None
            # Multiple children in expression body is unusual; keep wrapper

    # Skip leaf MODIFIER_LIST — modifier keywords (enum, data, inner, etc.)
    # are not consistently produced by both parsers. Remove empty MODIFIER_LIST
    # on both sides for consistent comparison.
    if mapped_name == "MODIFIER_LIST" and not normalized_children:
        return None

    # Skip empty VALUE_PARAMETER_LIST — both sides should omit when empty.
    if mapped_name == "VALUE_PARAMETER_LIST" and not normalized_children:
        return None

    return Node(name=mapped_name, children=normalized_children)


def _unwrap_receiver_type(children: list[Node]) -> list[Node]:
    """Unwrap FUNCTION_TYPE_RECEIVER when it appears under FUN or PROPERTY.

    In PSI, extension function/property receivers are bare USER_TYPE children
    of FUN/PROPERTY, not wrapped in FUNCTION_TYPE_RECEIVER. Tree-sitter always
    wraps them in receiver_type -> FUNCTION_TYPE_RECEIVER. This function
    promotes the children of FUNCTION_TYPE_RECEIVER so they appear directly
    under the parent node, matching PSI structure.

    Note: FUNCTION_TYPE_RECEIVER inside FUNCTION_TYPE is correct and should
    NOT be unwrapped — that case is handled by this function only being called
    for FUN and PROPERTY parents.
    """
    if not any(c.name == "FUNCTION_TYPE_RECEIVER" for c in children):
        return children

    result: list[Node] = []
    for child in children:
        if child.name == "FUNCTION_TYPE_RECEIVER":
            # Promote children (typically a single USER_TYPE or NULLABLE_TYPE)
            result.extend(child.children)
        else:
            result.append(child)
    return result


def _flatten_call_expression(children: list[Node]) -> list[Node]:
    """Flatten nested CALL_EXPRESSION chains from trailing lambda nesting.

    Tree-sitter represents `f() {} {}` as:
        CALL_EXPRESSION
          CALL_EXPRESSION
            CALL_EXPRESSION
              (callee)
              VALUE_ARGUMENT_LIST
              FUNCTION_LITERAL    # first trailing lambda
            FUNCTION_LITERAL      # second trailing lambda
          FUNCTION_LITERAL        # third trailing lambda

    PSI represents it flat:
        CALL_EXPRESSION
          (callee)
          VALUE_ARGUMENT_LIST
          FUNCTION_LITERAL
          FUNCTION_LITERAL
          FUNCTION_LITERAL

    This function recursively unwraps the inner CALL_EXPRESSION to flatten
    the chain.
    """
    if not children or children[0].name != "CALL_EXPRESSION":
        return children

    # The first child is a nested CALL_EXPRESSION — flatten it
    inner = children[0]
    rest = children[1:]
    # Recursively flatten the inner call first
    inner_flattened = _flatten_call_expression(inner.children)
    return inner_flattened + rest


def _wrap_bare_types_in_value_parameter(children: list[Node]) -> list[Node]:
    """Wrap bare type children in VALUE_PARAMETER inside VALUE_PARAMETER_LIST.

    In function_type_parameters, tree-sitter puts user_type/nullable_type/
    function_type directly as children of VALUE_PARAMETER_LIST, but PSI wraps
    each in VALUE_PARAMETER > type. This function wraps bare type children.
    """
    type_names = {"USER_TYPE", "NULLABLE_TYPE", "FUNCTION_TYPE", "PARENTHESIZED"}
    if not any(c.name in type_names and c.name != "VALUE_PARAMETER" for c in children):
        return children

    # Only wrap if there are no VALUE_PARAMETER children already
    # (to avoid double-wrapping in function_value_parameters contexts)
    has_value_params = any(c.name == "VALUE_PARAMETER" for c in children)
    if has_value_params:
        return children

    result: list[Node] = []
    for child in children:
        if child.name in type_names:
            result.append(Node(name="VALUE_PARAMETER", children=[child]))
        else:
            result.append(child)
    return result


def _normalize_ts_child(node: Node) -> list[Node]:
    """Normalize a tree-sitter child node, potentially producing 0..N nodes.

    When a node is skipped, its children are promoted (flattened into the
    parent's child list). This helper returns a list so the caller can
    splice promoted children in place.
    """
    result = _normalize_ts_node(node)
    if result is not None:
        return [result]

    # Node was dropped — but it may have children to promote
    promoted: list[Node] = []
    for child in node.children:
        promoted.extend(_normalize_ts_child(child))
    return promoted


# ---------------------------------------------------------------------------
# Internals — PSI normalization
# ---------------------------------------------------------------------------


def _normalize_psi_node(node: Node) -> Node | None:
    """Normalize a single PSI node recursively."""
    # Recursively normalize children first
    normalized_children: list[Node] = []
    for child in node.children:
        normalized = _normalize_psi_child(child)
        normalized_children.extend(normalized)

    # Skip empty PACKAGE_DIRECTIVE — PSI always emits it, but tree-sitter
    # only produces package_header when there is an actual package statement.
    # Only skip when the original node had no children (truly empty directive).
    if node.name == "PACKAGE_DIRECTIVE" and not node.children:
        return None

    # Skip empty IMPORT_LIST — PSI always emits it, but tree-sitter only
    # produces import_list when there are actual import statements.
    if node.name == "IMPORT_LIST" and not normalized_children:
        return None

    # Skip leaf MODIFIER_LIST — on both TS and PSI sides, modifier keywords
    # are leaves (PsiElement or tree-sitter keywords), so MODIFIER_LIST becomes
    # empty after normalization. Skip on PSI side for consistency.
    if node.name == "MODIFIER_LIST" and not normalized_children:
        return None

    # Skip empty VALUE_PARAMETER_LIST — PSI always emits it even for
    # parameter-less constructors; tree-sitter omits it when empty.
    if node.name == "VALUE_PARAMETER_LIST" and not normalized_children:
        return None

    # Collapse pure DOT_QUALIFIED_EXPRESSION chains — after REFERENCE_EXPRESSION
    # removal, a pure name chain like a.b.c becomes DQE > DQE > DQE (all leaves).
    # These are equivalent to tree-sitter's `identifier` node which is skipped.
    # Skip when all children are either empty or just nested DQE chains.
    if node.name == "DOT_QUALIFIED_EXPRESSION":
        non_dqe = [c for c in normalized_children
                   if c.name != "DOT_QUALIFIED_EXPRESSION"]
        if not non_dqe:
            # Pure identifier chain — skip (promote non-DQE children, if any)
            return None

    # Check if this node should be skipped (promote its children)
    if node.name in SKIP_PSI_NODES:
        if len(normalized_children) == 1:
            return normalized_children[0]
        elif len(normalized_children) > 1:
            # Promote all children — parent will absorb them
            # Return None so _normalize_psi_child promotes children
            return None
        return None

    # Check for wrapper collapse
    if node.name in WRAPPER_COLLAPSE:
        target = WRAPPER_COLLAPSE[node.name]
        if target == "*" and len(normalized_children) == 1:
            return normalized_children[0]
        elif target != "*":
            # Find the target child and collapse wrapper into it
            for child in normalized_children:
                if child.name == target:
                    other_children = [c for c in normalized_children if c is not child]
                    if other_children:
                        return Node(
                            name=child.name,
                            children=child.children + other_children,
                        )
                    return child
            # Target child not found — keep node as-is

    return Node(name=node.name, children=normalized_children)


def _normalize_psi_child(node: Node) -> list[Node]:
    """Normalize a PSI child node, potentially producing 0..N nodes.

    When a node is skipped, its children are promoted (flattened into the
    parent's child list).
    """
    result = _normalize_psi_node(node)
    if result is not None:
        return [result]

    # Node was dropped — promote its children
    promoted: list[Node] = []
    for child in node.children:
        promoted.extend(_normalize_psi_child(child))
    return promoted
