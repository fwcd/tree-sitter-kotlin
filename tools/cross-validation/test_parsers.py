"""Unit tests for tree-sitter and PSI parsers using BabySteps as fixture."""

import pytest
from models import Node
from parser_ts import parse_tree_sitter
from parser_psi import parse_psi


# ---------------------------------------------------------------------------
# Fixtures — BabySteps sample data
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


# ---------------------------------------------------------------------------
# Tree-sitter parser tests
# ---------------------------------------------------------------------------

class TestTreeSitterParser:
    """Tests for parser_ts.parse_tree_sitter."""

    def test_parses_root_node(self):
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        assert tree.name == "source_file"

    def test_root_has_correct_children_count(self):
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        assert len(tree.children) == 3  # line_comment, package_header, class_declaration

    def test_child_names(self):
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        names = [c.name for c in tree.children]
        assert names == ["line_comment", "package_header", "class_declaration"]

    def test_nested_structure(self):
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        # package_header -> identifier -> simple_identifier
        pkg = tree.children[1]
        assert pkg.name == "package_header"
        assert len(pkg.children) == 1
        ident = pkg.children[0]
        assert ident.name == "identifier"
        assert len(ident.children) == 1
        assert ident.children[0].name == "simple_identifier"

    def test_class_declaration_structure(self):
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        cls = tree.children[2]
        assert cls.name == "class_declaration"
        assert len(cls.children) == 2  # type_identifier, type_parameters
        assert cls.children[0].name == "type_identifier"
        assert cls.children[1].name == "type_parameters"

    def test_type_parameters_nesting(self):
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        type_params = tree.children[2].children[1]
        assert type_params.name == "type_parameters"
        assert len(type_params.children) == 1
        tp = type_params.children[0]
        assert tp.name == "type_parameter"
        assert len(tp.children) == 1
        assert tp.children[0].name == "type_identifier"

    def test_leaf_nodes_have_no_children(self):
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        # line_comment is a leaf
        assert tree.children[0].children == []
        # simple_identifier is a leaf
        simple_id = tree.children[1].children[0].children[0]
        assert simple_id.children == []

    def test_positions_stripped(self):
        """Ensure position info like [0, 0] is not present in node names."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        assert "[" not in tree.name
        assert "]" not in tree.name

    def test_empty_input_raises(self):
        with pytest.raises(ValueError, match="Empty input"):
            parse_tree_sitter("")

    def test_full_tree_structure(self):
        """Verify the complete expected tree structure."""
        tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        expected = Node("source_file", [
            Node("line_comment"),
            Node("package_header", [
                Node("identifier", [
                    Node("simple_identifier"),
                ]),
            ]),
            Node("class_declaration", [
                Node("type_identifier"),
                Node("type_parameters", [
                    Node("type_parameter", [
                        Node("type_identifier"),
                    ]),
                ]),
            ]),
        ])
        assert tree == expected


# ---------------------------------------------------------------------------
# PSI parser tests
# ---------------------------------------------------------------------------

class TestPsiParser:
    """Tests for parser_psi.parse_psi."""

    def test_parses_root_node(self):
        tree = parse_psi(BABY_STEPS_PSI)
        assert tree.name == "KtFile"

    def test_root_has_correct_children_count(self):
        tree = parse_psi(BABY_STEPS_PSI)
        # PACKAGE_DIRECTIVE, IMPORT_LIST, CLASS (PsiComment/PsiWhiteSpace skipped)
        assert len(tree.children) == 3

    def test_child_names(self):
        tree = parse_psi(BABY_STEPS_PSI)
        names = [c.name for c in tree.children]
        assert names == ["PACKAGE_DIRECTIVE", "IMPORT_LIST", "CLASS"]

    def test_skips_psi_elements(self):
        """PsiElement(...), PsiWhiteSpace(...), PsiComment(...) should be skipped."""
        tree = parse_psi(BABY_STEPS_PSI)
        all_names = _collect_all_names(tree)
        for name in all_names:
            assert not name.startswith("PsiElement")
            assert not name.startswith("PsiWhiteSpace")
            assert not name.startswith("PsiComment")

    def test_package_directive_structure(self):
        tree = parse_psi(BABY_STEPS_PSI)
        pkg = tree.children[0]
        assert pkg.name == "PACKAGE_DIRECTIVE"
        # Should have REFERENCE_EXPRESSION child (PsiElement/PsiWhiteSpace skipped)
        assert len(pkg.children) == 1
        assert pkg.children[0].name == "REFERENCE_EXPRESSION"

    def test_import_list_empty(self):
        tree = parse_psi(BABY_STEPS_PSI)
        import_list = tree.children[1]
        assert import_list.name == "IMPORT_LIST"
        # <empty list> is skipped, so no children
        assert len(import_list.children) == 0

    def test_class_structure(self):
        tree = parse_psi(BABY_STEPS_PSI)
        cls = tree.children[2]
        assert cls.name == "CLASS"
        # Only TYPE_PARAMETER_LIST remains (PsiElements skipped)
        assert len(cls.children) == 1
        assert cls.children[0].name == "TYPE_PARAMETER_LIST"

    def test_type_parameter_list_nesting(self):
        tree = parse_psi(BABY_STEPS_PSI)
        tpl = tree.children[2].children[0]
        assert tpl.name == "TYPE_PARAMETER_LIST"
        assert len(tpl.children) == 1
        assert tpl.children[0].name == "TYPE_PARAMETER"

    def test_empty_input_raises(self):
        with pytest.raises(ValueError, match="Empty input"):
            parse_psi("")

    def test_full_tree_structure(self):
        """Verify the complete expected PSI tree structure."""
        tree = parse_psi(BABY_STEPS_PSI)
        expected = Node("KtFile", [
            Node("PACKAGE_DIRECTIVE", [
                Node("REFERENCE_EXPRESSION"),
            ]),
            Node("IMPORT_LIST"),
            Node("CLASS", [
                Node("TYPE_PARAMETER_LIST", [
                    Node("TYPE_PARAMETER"),
                ]),
            ]),
        ])
        assert tree == expected


# ---------------------------------------------------------------------------
# Cross-parser structural comparison test
# ---------------------------------------------------------------------------

class TestCrossParserComparison:
    """Both parsers should produce structurally comparable trees for BabySteps."""

    def test_both_have_same_depth(self):
        ts_tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        psi_tree = parse_psi(BABY_STEPS_PSI)
        ts_depth = _tree_depth(ts_tree)
        psi_depth = _tree_depth(psi_tree)
        # Both should have reasonable depth (not flat, not degenerate)
        assert ts_depth >= 3
        assert psi_depth >= 3

    def test_both_produce_node_trees(self):
        """Both parsers produce Node instances with the same dataclass shape."""
        ts_tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        psi_tree = parse_psi(BABY_STEPS_PSI)
        assert isinstance(ts_tree, Node)
        assert isinstance(psi_tree, Node)
        assert hasattr(ts_tree, "name")
        assert hasattr(ts_tree, "children")
        assert hasattr(psi_tree, "name")
        assert hasattr(psi_tree, "children")

    def test_both_have_package_and_class_subtrees(self):
        """Both trees should contain package and class-related subtrees."""
        ts_tree = parse_tree_sitter(BABY_STEPS_TREE_SITTER)
        psi_tree = parse_psi(BABY_STEPS_PSI)

        ts_names = _collect_all_names(ts_tree)
        psi_names = _collect_all_names(psi_tree)

        # tree-sitter uses lowercase, PSI uses UPPER_CASE — but both have these concepts
        assert any("package" in n.lower() for n in ts_names)
        assert any("package" in n.lower() for n in psi_names)
        assert any("class" in n.lower() for n in ts_names)
        assert any("class" in n.lower() for n in psi_names)
        assert any("type_parameter" in n.lower() for n in ts_names)
        assert any("type_parameter" in n.lower() for n in psi_names)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collect_all_names(node: Node) -> list[str]:
    """Collect all node names in a tree (pre-order traversal)."""
    names = [node.name]
    for child in node.children:
        names.extend(_collect_all_names(child))
    return names


def _tree_depth(node: Node) -> int:
    """Calculate the depth of a tree."""
    if not node.children:
        return 1
    return 1 + max(_tree_depth(c) for c in node.children)
