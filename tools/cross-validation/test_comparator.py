"""Tests for the structural comparator and normalizer.

Verifies:
1. BabySteps inline fixture produces a MATCH after normalization.
2. Real BabySteps fixture (from disk) produces a result with known differences.
3. Deliberately wrong trees produce specific mismatches.
4. Child count differences are detected.
5. Name mismatches at various depths are detected.
6. Parse-error statuses are returned for None inputs.
7. Normalizer correctly maps, skips, and collapses nodes.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from comparator import CompareResult, Difference, DiffKind, Status, compare_trees
from models import Node
from normalizer import normalize_psi, normalize_ts
from parser_psi import parse_psi
from parser_ts import parse_tree_sitter

# ---------------------------------------------------------------------------
# Paths for real-file tests
# ---------------------------------------------------------------------------

_THIS_DIR = Path(__file__).resolve().parent
JETBRAINS_FIXTURES = _THIS_DIR / "fixtures"
TREE_SITTER_KOTLIN_DIR = _THIS_DIR.parent.parent  # repo root


# ---------------------------------------------------------------------------
# BabySteps inline fixture data (same as test_parsers.py)
# ---------------------------------------------------------------------------

BABY_STEPS_TREE_SITTER = """\
(source_file [0, 0] - [7, 0]
  (line_comment [0, 0] - [0, 21])
  (package_header [2, 0] - [2, 11]
    (identifier [2, 8] - [2, 11]
      (simple_identifier [2, 8] - [2, 11])))
  (class_declaration [4, 0] - [6, 1]
    (type_identifier [4, 6] - [4, 14])
    (type_parameters [4, 14] - [4, 19]
      (type_parameter [4, 15] - [4, 16]
        (type_identifier [4, 15] - [4, 16])))))
"""

BABY_STEPS_PSI = """\
KtFile: BabySteps.kt
  PsiComment(EOL_COMMENT)('// COMPILATION_ERRORS')
  PsiWhiteSpace('\\n\\n')
  PACKAGE_DIRECTIVE
    PsiElement(package)('package')
    PsiWhiteSpace(' ')
    REFERENCE_EXPRESSION
      PsiElement(IDENTIFIER)('foo')
  IMPORT_LIST
    <empty list>
  CLASS
    PsiElement(class)('class')
    PsiWhiteSpace(' ')
    PsiElement(IDENTIFIER)('Runnable')
    TYPE_PARAMETER_LIST
      PsiElement(LT)('<')
      TYPE_PARAMETER
        PsiElement(IDENTIFIER)('a')
      PsiElement(GT)('>')
"""


# ===========================================================================
# Normalizer tests
# ===========================================================================


class TestNormalizerTS:
    """Tests for normalize_ts()."""

    def test_maps_root_name(self):
        """source_file should be renamed to KtFile."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        assert norm.name == "KtFile"

    def test_skips_line_comment(self):
        """line_comment has no PSI composite equivalent — should be removed."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        child_names = [c.name for c in norm.children]
        assert "line_comment" not in child_names

    def test_maps_package_header(self):
        """package_header -> PACKAGE_DIRECTIVE."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        assert norm.children[0].name == "PACKAGE_DIRECTIVE"

    def test_skips_simple_identifier(self):
        """simple_identifier is in SKIP_TS_NODES — should be removed."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        all_names = _collect_names(norm)
        assert "simple_identifier" not in all_names

    def test_skips_type_identifier(self):
        """type_identifier is in SKIP_TS_NODES — should be removed."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        all_names = _collect_names(norm)
        assert "type_identifier" not in all_names

    def test_skips_identifier(self):
        """identifier is in SKIP_TS_NODES — should be removed."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        all_names = _collect_names(norm)
        assert "identifier" not in all_names

    def test_maps_class_declaration(self):
        """class_declaration -> CLASS."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        assert norm.children[1].name == "CLASS"

    def test_maps_type_parameters(self):
        """type_parameters -> TYPE_PARAMETER_LIST."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        assert norm is not None
        cls = norm.children[1]
        assert cls.children[0].name == "TYPE_PARAMETER_LIST"

    def test_normalize_ts_none_for_empty_leaf(self):
        """A single unmapped leaf node with no children returns None."""
        node = Node("simple_identifier")
        result = normalize_ts(node)
        assert result is None

    def test_full_normalized_ts_structure(self):
        """The full normalized tree should match expected structure."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        norm = normalize_ts(tree)
        expected = Node("KtFile", [
            Node("PACKAGE_DIRECTIVE"),
            Node("CLASS", [
                Node("TYPE_PARAMETER_LIST", [
                    Node("TYPE_PARAMETER"),
                ]),
            ]),
        ])
        assert norm == expected


class TestNormalizerPSI:
    """Tests for normalize_psi()."""

    def test_root_name_preserved(self):
        """KtFile should remain KtFile."""
        tree = parse_psi(BABY_STEPS_PSI)
        norm = normalize_psi(tree)
        assert norm is not None
        assert norm.name == "KtFile"

    def test_skips_import_list(self):
        """IMPORT_LIST is in SKIP_PSI_NODES — should be removed when empty."""
        tree = parse_psi(BABY_STEPS_PSI)
        norm = normalize_psi(tree)
        assert norm is not None
        child_names = [c.name for c in norm.children]
        assert "IMPORT_LIST" not in child_names

    def test_skips_reference_expression(self):
        """REFERENCE_EXPRESSION is in SKIP_PSI_NODES — should be removed."""
        tree = parse_psi(BABY_STEPS_PSI)
        norm = normalize_psi(tree)
        assert norm is not None
        all_names = _collect_names(norm)
        assert "REFERENCE_EXPRESSION" not in all_names

    def test_preserves_class(self):
        """CLASS should be preserved."""
        tree = parse_psi(BABY_STEPS_PSI)
        norm = normalize_psi(tree)
        assert norm is not None
        assert any(c.name == "CLASS" for c in norm.children)

    def test_preserves_type_parameter_list(self):
        """TYPE_PARAMETER_LIST should be preserved."""
        tree = parse_psi(BABY_STEPS_PSI)
        norm = normalize_psi(tree)
        assert norm is not None
        cls = [c for c in norm.children if c.name == "CLASS"][0]
        assert cls.children[0].name == "TYPE_PARAMETER_LIST"

    def test_full_normalized_psi_structure(self):
        """The full normalized tree should match expected structure."""
        tree = parse_psi(BABY_STEPS_PSI)
        norm = normalize_psi(tree)
        expected = Node("KtFile", [
            Node("PACKAGE_DIRECTIVE"),
            Node("CLASS", [
                Node("TYPE_PARAMETER_LIST", [
                    Node("TYPE_PARAMETER"),
                ]),
            ]),
        ])
        assert norm == expected


# ===========================================================================
# Comparator tests — matching trees
# ===========================================================================


class TestComparatorMatch:
    """Tests where trees should match."""

    def test_baby_steps_inline_match(self):
        """BabySteps inline fixture should produce MATCH after normalization."""
        ts_tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        psi_tree = parse_psi(BABY_STEPS_PSI)
        ts_norm = normalize_ts(ts_tree)
        psi_norm = normalize_psi(psi_tree)
        result = compare_trees(ts_norm, psi_norm)
        assert result.status == Status.MATCH
        assert result.differences == []

    def test_identical_single_node(self):
        """Two identical leaf nodes should match."""
        a = Node("KtFile")
        b = Node("KtFile")
        result = compare_trees(a, b)
        assert result.status == Status.MATCH
        assert result.differences == []

    def test_identical_deep_tree(self):
        """Two identical deep trees should match."""
        tree = Node("KtFile", [
            Node("CLASS", [
                Node("TYPE_PARAMETER_LIST", [
                    Node("TYPE_PARAMETER"),
                ]),
                Node("CLASS_BODY", [
                    Node("FUN", [
                        Node("BLOCK"),
                    ]),
                ]),
            ]),
        ])
        # Use the same structure
        tree2 = Node("KtFile", [
            Node("CLASS", [
                Node("TYPE_PARAMETER_LIST", [
                    Node("TYPE_PARAMETER"),
                ]),
                Node("CLASS_BODY", [
                    Node("FUN", [
                        Node("BLOCK"),
                    ]),
                ]),
            ]),
        ])
        result = compare_trees(tree, tree2)
        assert result.status == Status.MATCH
        assert result.differences == []


# ===========================================================================
# Comparator tests — mismatches
# ===========================================================================


class TestComparatorMismatch:
    """Tests where trees should have specific mismatches."""

    def test_root_name_mismatch(self):
        """Different root names should produce a name_mismatch."""
        a = Node("KtFile")
        b = Node("CLASS")
        result = compare_trees(a, b)
        assert result.status == Status.MISMATCH
        assert len(result.differences) >= 1
        assert result.differences[0].kind == DiffKind.NAME_MISMATCH
        assert result.differences[0].expected == "CLASS"
        assert result.differences[0].actual == "KtFile"

    def test_name_mismatch_at_depth(self):
        """Name mismatch at depth 2 should include the correct path."""
        a = Node("KtFile", [Node("FUN")])
        b = Node("KtFile", [Node("CLASS")])
        result = compare_trees(a, b)
        assert result.status == Status.MISMATCH
        diffs = [d for d in result.differences if d.kind == DiffKind.NAME_MISMATCH]
        assert len(diffs) == 1
        assert "KtFile" in diffs[0].path
        assert diffs[0].expected == "CLASS"
        assert diffs[0].actual == "FUN"

    def test_name_mismatch_at_depth_3(self):
        """Name mismatch at depth 3 should include full path."""
        a = Node("KtFile", [Node("CLASS", [Node("BLOCK")])])
        b = Node("KtFile", [Node("CLASS", [Node("FUN")])])
        result = compare_trees(a, b)
        assert result.status == Status.MISMATCH
        diffs = [d for d in result.differences if d.kind == DiffKind.NAME_MISMATCH]
        assert len(diffs) == 1
        assert "CLASS" in diffs[0].path
        assert diffs[0].expected == "FUN"
        assert diffs[0].actual == "BLOCK"


# ===========================================================================
# Comparator tests — child count differences
# ===========================================================================


class TestComparatorChildCount:
    """Tests for child count mismatches and extra/missing children."""

    def test_extra_child(self):
        """Tree-sitter has an extra child — should produce extra_child."""
        a = Node("KtFile", [Node("CLASS"), Node("FUN")])
        b = Node("KtFile", [Node("CLASS")])
        result = compare_trees(a, b)
        assert result.status == Status.MISMATCH
        kinds = {d.kind for d in result.differences}
        assert DiffKind.CHILD_COUNT_MISMATCH in kinds
        assert DiffKind.EXTRA_CHILD in kinds

    def test_missing_child(self):
        """Tree-sitter is missing a child — should produce missing_child."""
        a = Node("KtFile", [Node("CLASS")])
        b = Node("KtFile", [Node("CLASS"), Node("FUN")])
        result = compare_trees(a, b)
        assert result.status == Status.MISMATCH
        kinds = {d.kind for d in result.differences}
        assert DiffKind.CHILD_COUNT_MISMATCH in kinds
        assert DiffKind.MISSING_CHILD in kinds
        missing = [d for d in result.differences if d.kind == DiffKind.MISSING_CHILD]
        assert len(missing) == 1
        assert missing[0].expected == "FUN"

    def test_child_count_mismatch_values(self):
        """The child_count_mismatch should report the correct counts."""
        a = Node("KtFile", [Node("A"), Node("B"), Node("C")])
        b = Node("KtFile", [Node("A")])
        result = compare_trees(a, b)
        count_diffs = [
            d for d in result.differences if d.kind == DiffKind.CHILD_COUNT_MISMATCH
        ]
        assert len(count_diffs) >= 1
        root_count = count_diffs[0]
        assert root_count.expected == "1"
        assert root_count.actual == "3"

    def test_empty_vs_nonempty_children(self):
        """Leaf vs node with children should produce child_count_mismatch."""
        a = Node("KtFile")
        b = Node("KtFile", [Node("CLASS")])
        result = compare_trees(a, b)
        assert result.status == Status.MISMATCH
        kinds = {d.kind for d in result.differences}
        assert DiffKind.CHILD_COUNT_MISMATCH in kinds
        assert DiffKind.MISSING_CHILD in kinds


# ===========================================================================
# Comparator tests — parse error statuses
# ===========================================================================


class TestComparatorParseErrors:
    """Tests for TS_PARSE_ERROR and PSI_PARSE_ERROR statuses."""

    def test_ts_parse_error(self):
        """None ts_tree should produce TS_PARSE_ERROR."""
        result = compare_trees(None, Node("KtFile"))
        assert result.status == Status.TS_PARSE_ERROR
        assert result.differences == []

    def test_psi_parse_error(self):
        """None psi_tree should produce PSI_PARSE_ERROR."""
        result = compare_trees(Node("KtFile"), None)
        assert result.status == Status.PSI_PARSE_ERROR
        assert result.differences == []

    def test_both_none_returns_ts_error(self):
        """Both None — TS error takes precedence."""
        result = compare_trees(None, None)
        assert result.status == Status.TS_PARSE_ERROR


# ===========================================================================
# Comparator tests — Difference has clear paths and descriptions
# ===========================================================================


class TestDifferencePaths:
    """Tests that differences include clear paths for debugging."""

    def test_root_path(self):
        """Difference at root should have just the root name in path."""
        a = Node("WRONG")
        b = Node("KtFile")
        result = compare_trees(a, b)
        assert result.differences[0].path == "KtFile"

    def test_nested_path_format(self):
        """Nested differences should use ' > ' separator in paths."""
        a = Node("KtFile", [Node("CLASS", [Node("WRONG")])])
        b = Node("KtFile", [Node("CLASS", [Node("FUN")])])
        result = compare_trees(a, b)
        name_diffs = [d for d in result.differences if d.kind == DiffKind.NAME_MISMATCH]
        assert len(name_diffs) == 1
        assert name_diffs[0].path == "KtFile > CLASS > FUN"

    def test_extra_child_path_format(self):
        """Extra child paths should include the child index."""
        a = Node("KtFile", [Node("CLASS"), Node("EXTRA")])
        b = Node("KtFile", [Node("CLASS")])
        result = compare_trees(a, b)
        extra = [d for d in result.differences if d.kind == DiffKind.EXTRA_CHILD]
        assert len(extra) == 1
        assert "[child 1]" in extra[0].path

    def test_difference_str_format(self):
        """str() of a Difference should be human-readable."""
        diff = Difference(
            path="KtFile > CLASS",
            expected="FUN",
            actual="BLOCK",
            kind=DiffKind.NAME_MISMATCH,
        )
        s = str(diff)
        assert "name_mismatch" in s
        assert "KtFile > CLASS" in s
        assert "FUN" in s
        assert "BLOCK" in s


# ===========================================================================
# Integration test with real BabySteps from disk
# ===========================================================================


class TestRealBabySteps:
    """Integration test using real BabySteps.kt parsed by tree-sitter and PSI fixture."""

    def test_real_baby_steps_produces_result(self):
        """Real BabySteps should produce a CompareResult (MATCH or MISMATCH with details)."""
        ts_tree = _get_ts_tree("BabySteps")
        psi_tree = _get_psi_tree("BabySteps")
        ts_norm = normalize_ts(ts_tree)
        psi_norm = normalize_psi(psi_tree)
        result = compare_trees(ts_norm, psi_norm)
        assert result.status in (Status.MATCH, Status.MISMATCH)
        # If there are mismatches, they should have valid paths and descriptions
        for diff in result.differences:
            assert diff.path  # non-empty path
            assert diff.kind in DiffKind
            assert diff.expected  # non-empty
            assert diff.actual  # non-empty

    def test_real_baby_steps_differences_have_paths(self):
        """All differences from real BabySteps should have meaningful paths."""
        ts_tree = _get_ts_tree("BabySteps")
        psi_tree = _get_psi_tree("BabySteps")
        ts_norm = normalize_ts(ts_tree)
        psi_norm = normalize_psi(psi_tree)
        result = compare_trees(ts_norm, psi_norm)
        for diff in result.differences:
            # Paths should contain the root
            assert "KtFile" in diff.path

    def test_real_baby_steps_root_names_match(self):
        """After normalization, both roots should be KtFile."""
        ts_tree = _get_ts_tree("BabySteps")
        psi_tree = _get_psi_tree("BabySteps")
        ts_norm = normalize_ts(ts_tree)
        psi_norm = normalize_psi(psi_tree)
        assert ts_norm is not None
        assert psi_norm is not None
        assert ts_norm.name == "KtFile"
        assert psi_norm.name == "KtFile"


# ===========================================================================
# Tests for new normalization rules (Round 9-11 fixes)
# ===========================================================================


class TestFunctionTypeReceiverUnwrap:
    """Tests for FUNCTION_TYPE_RECEIVER unwrapping in FUN/PROPERTY contexts."""

    def test_unwraps_receiver_in_fun(self):
        """FUNCTION_TYPE_RECEIVER should be unwrapped under FUN."""
        # Simulate: fun String.foo() -- TS has receiver_type > user_type
        ts_tree = Node("source_file", [
            Node("function_declaration", [
                Node("receiver_type", [
                    Node("user_type", [Node("type_identifier")]),
                ]),
            ]),
        ])
        norm = normalize_ts(ts_tree)
        assert norm is not None
        fun = norm.children[0]
        assert fun.name == "FUN"
        # USER_TYPE should be a direct child of FUN, not wrapped in FUNCTION_TYPE_RECEIVER
        child_names = [c.name for c in fun.children]
        assert "FUNCTION_TYPE_RECEIVER" not in child_names
        assert "USER_TYPE" in child_names

    def test_preserves_receiver_in_function_type(self):
        """FUNCTION_TYPE_RECEIVER should be preserved inside FUNCTION_TYPE."""
        # Simulate: (A.() -> B)  -- receiver_type inside function_type
        ts_tree = Node("source_file", [
            Node("function_declaration", [
                Node("function_value_parameters", [
                    Node("parameter", [
                        Node("function_type", [
                            Node("receiver_type", [
                                Node("user_type", [Node("type_identifier")]),
                            ]),
                            Node("user_type", [Node("type_identifier")]),
                        ]),
                    ]),
                ]),
            ]),
        ])
        norm = normalize_ts(ts_tree)
        assert norm is not None
        fun = norm.children[0]
        # Find FUNCTION_TYPE
        vpl = fun.children[0]
        vp = vpl.children[0]
        ft = vp.children[0]
        assert ft.name == "FUNCTION_TYPE"
        # FUNCTION_TYPE_RECEIVER should be preserved inside FUNCTION_TYPE
        child_names = [c.name for c in ft.children]
        assert "FUNCTION_TYPE_RECEIVER" in child_names


class TestCallExpressionFlattening:
    """Tests for CALL_EXPRESSION chain flattening."""

    def test_flattens_nested_calls(self):
        """Nested CALL_EXPRESSION chains should be flattened."""
        # Simulate: f() {} {} -- TS nests calls
        ts_tree = Node("source_file", [
            Node("call_expression", [
                Node("call_expression", [
                    Node("call_expression", [
                        Node("simple_identifier"),
                        Node("call_suffix", [
                            Node("value_arguments"),
                            Node("annotated_lambda", [
                                Node("lambda_literal"),
                            ]),
                        ]),
                    ]),
                    Node("call_suffix", [
                        Node("annotated_lambda", [
                            Node("lambda_literal"),
                        ]),
                    ]),
                ]),
                Node("call_suffix", [
                    Node("annotated_lambda", [
                        Node("lambda_literal"),
                    ]),
                ]),
            ]),
        ])
        norm = normalize_ts(ts_tree)
        assert norm is not None
        call = norm.children[0]
        assert call.name == "CALL_EXPRESSION"
        # Should have flat children: VALUE_ARGUMENT_LIST, FUNCTION_LITERAL, FUNCTION_LITERAL, FUNCTION_LITERAL
        child_names = [c.name for c in call.children]
        assert child_names.count("FUNCTION_LITERAL") == 3
        # No nested CALL_EXPRESSION
        assert "CALL_EXPRESSION" not in child_names


class TestFunctionLiteralBlockInjection:
    """Tests for BLOCK injection into empty FUNCTION_LITERAL."""

    def test_injects_block_in_empty_lambda(self):
        """Empty FUNCTION_LITERAL should get an injected BLOCK child."""
        # Simulate: f {} -- empty lambda
        ts_tree = Node("source_file", [
            Node("call_expression", [
                Node("simple_identifier"),
                Node("call_suffix", [
                    Node("annotated_lambda", [
                        Node("lambda_literal"),  # empty
                    ]),
                ]),
            ]),
        ])
        norm = normalize_ts(ts_tree)
        assert norm is not None
        call = norm.children[0]
        fl = [c for c in call.children if c.name == "FUNCTION_LITERAL"][0]
        assert len(fl.children) == 1
        assert fl.children[0].name == "BLOCK"


class TestClassInitializerBlockWrap:
    """Tests for CLASS_INITIALIZER > BLOCK wrapping."""

    def test_wraps_children_in_block(self):
        """CLASS_INITIALIZER children should be wrapped in BLOCK."""
        ts_tree = Node("source_file", [
            Node("class_declaration", [
                Node("class_body", [
                    Node("anonymous_initializer", [
                        Node("statements", [
                            Node("call_expression", [
                                Node("simple_identifier"),
                                Node("call_suffix", [
                                    Node("value_arguments"),
                                ]),
                            ]),
                        ]),
                    ]),
                ]),
            ]),
        ])
        norm = normalize_ts(ts_tree)
        assert norm is not None
        cls = norm.children[0]
        body = cls.children[0]
        init = body.children[0]
        assert init.name == "CLASS_INITIALIZER"
        assert len(init.children) == 1
        assert init.children[0].name == "BLOCK"
        # BLOCK should contain the call expression
        assert len(init.children[0].children) >= 1


class TestObjectLiteralWrapper:
    """Tests for OBJECT_LITERAL > OBJECT_DECLARATION injection."""

    def test_injects_object_declaration(self):
        """OBJECT_LITERAL should wrap its children in OBJECT_DECLARATION."""
        ts_tree = Node("source_file", [
            Node("object_literal", [
                Node("class_body"),
            ]),
        ])
        norm = normalize_ts(ts_tree)
        assert norm is not None
        obj_lit = norm.children[0]
        assert obj_lit.name == "OBJECT_LITERAL"
        assert len(obj_lit.children) == 1
        assert obj_lit.children[0].name == "OBJECT_DECLARATION"
        assert obj_lit.children[0].children[0].name == "CLASS_BODY"


class TestValueParameterWrapping:
    """Tests for VALUE_PARAMETER wrapping in function type parameters."""

    def test_wraps_bare_types(self):
        """Bare USER_TYPE in VALUE_PARAMETER_LIST should be wrapped in VALUE_PARAMETER."""
        # Simulate: function_type_parameters with bare user_type
        ts_tree = Node("source_file", [
            Node("function_declaration", [
                Node("function_value_parameters", [
                    Node("parameter", [
                        Node("function_type", [
                            Node("function_type_parameters", [
                                Node("user_type", [Node("type_identifier")]),
                                Node("user_type", [Node("type_identifier")]),
                            ]),
                            Node("user_type", [Node("type_identifier")]),
                        ]),
                    ]),
                ]),
            ]),
        ])
        norm = normalize_ts(ts_tree)
        assert norm is not None
        fun = norm.children[0]
        vpl = fun.children[0]
        vp = vpl.children[0]
        ft = vp.children[0]
        inner_vpl = [c for c in ft.children if c.name == "VALUE_PARAMETER_LIST"][0]
        # Each USER_TYPE should be wrapped in VALUE_PARAMETER
        for child in inner_vpl.children:
            assert child.name == "VALUE_PARAMETER"
            assert child.children[0].name == "USER_TYPE"


# ===========================================================================
# Helpers
# ===========================================================================


def _collect_names(node: Node) -> set[str]:
    """Collect all unique node names in a tree."""
    names = {node.name}
    for child in node.children:
        names |= _collect_names(child)
    return names


def _get_ts_tree(sample_name: str) -> Node:
    """Parse a sample file with tree-sitter and return the Node tree."""
    kt_file = JETBRAINS_FIXTURES / f"{sample_name}.kt"
    result = subprocess.run(
        ["tree-sitter", "parse", str(kt_file)],
        capture_output=True,
        text=True,
        cwd=str(TREE_SITTER_KOTLIN_DIR),
    )
    sexp = result.stdout.strip()
    if not sexp:
        raise ValueError(f"tree-sitter produced no output for {sample_name}")
    return parse_tree_sitter(sexp)


def _get_psi_tree(sample_name: str) -> Node:
    """Parse a sample file's PSI fixture and return the Node tree."""
    txt_file = JETBRAINS_FIXTURES / f"{sample_name}.txt"
    with open(txt_file) as f:
        text = f.read()
    return parse_psi(text)
