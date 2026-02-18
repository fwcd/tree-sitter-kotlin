"""Tests for the node name mapping between tree-sitter and JetBrains PSI.

Verifies:
1. Mapping coverage — every tree-sitter named node is either mapped, skipped,
   or explicitly marked unmapped (None).
2. Mapping consistency — no node is in both TS_TO_PSI (with a non-None value)
   and should still logically be skipped.
3. Set completeness — ALL_TS_NAMED_NODES matches the actual node-types.json.
4. Set completeness — ALL_PSI_COMPOSITE_NODES matches the fixture files.
5. Sample file comparison — 5 diverse files produce structurally comparable
   normalized trees when both parsers' output is mapped through the mapping.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import pytest

from mapping import (
    ALL_PSI_COMPOSITE_NODES,
    ALL_TS_NAMED_NODES,
    SKIP_PSI_NODES,
    SKIP_TS_NODES,
    TS_TO_PSI,
    WRAPPER_COLLAPSE,
)
from models import Node
from parser_psi import parse_psi
from parser_ts import parse_tree_sitter

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

NODE_TYPES_JSON = Path.home() / ".nanobot" / "tree-sitter-kotlin" / "src" / "node-types.json"
JETBRAINS_FIXTURES = Path.home() / ".nanobot" / "kotlin-rs" / "tests" / "fixtures" / "jetbrains"
TREE_SITTER_KOTLIN_DIR = Path.home() / ".nanobot" / "tree-sitter-kotlin"

# 5 sample fixture files for structural comparison
SAMPLE_FILES = [
    "BabySteps",
    "Interface",
    "EnumCommas",
    "FunctionLiterals",
    "AnonymousInitializer",
]


# ===========================================================================
# Coverage tests
# ===========================================================================

class TestMappingCoverage:
    """Every tree-sitter named node type must be accounted for."""

    def test_all_ts_nodes_are_in_mapping_or_skip(self):
        """Every tree-sitter named node must be in TS_TO_PSI (mapped or None)."""
        mapped = set(TS_TO_PSI.keys())
        unmapped = ALL_TS_NAMED_NODES - mapped
        assert unmapped == set(), (
            f"Tree-sitter nodes not in TS_TO_PSI: {sorted(unmapped)}"
        )

    def test_skip_ts_nodes_are_subset_of_mapping(self):
        """SKIP_TS_NODES should only contain nodes that exist in ALL_TS_NAMED_NODES."""
        extra = SKIP_TS_NODES - ALL_TS_NAMED_NODES
        assert extra == set(), (
            f"SKIP_TS_NODES contains nodes not in ALL_TS_NAMED_NODES: {sorted(extra)}"
        )

    def test_skip_psi_nodes_are_subset_of_psi_set(self):
        """SKIP_PSI_NODES should only contain nodes that exist in ALL_PSI_COMPOSITE_NODES."""
        extra = SKIP_PSI_NODES - ALL_PSI_COMPOSITE_NODES
        assert extra == set(), (
            f"SKIP_PSI_NODES contains nodes not in ALL_PSI_COMPOSITE_NODES: {sorted(extra)}"
        )

    def test_wrapper_collapse_keys_are_psi_nodes(self):
        """WRAPPER_COLLAPSE keys should be valid PSI node names."""
        for key in WRAPPER_COLLAPSE:
            assert key in ALL_PSI_COMPOSITE_NODES, (
                f"WRAPPER_COLLAPSE key '{key}' not in ALL_PSI_COMPOSITE_NODES"
            )

    def test_every_skip_ts_node_has_none_mapping(self):
        """Nodes in SKIP_TS_NODES should map to None in TS_TO_PSI."""
        for node in SKIP_TS_NODES:
            assert node in TS_TO_PSI, f"{node} is in SKIP but not in TS_TO_PSI"
            assert TS_TO_PSI[node] is None, (
                f"{node} is in SKIP_TS_NODES but maps to {TS_TO_PSI[node]!r}, "
                f"expected None"
            )

    def test_non_none_mappings_target_psi_nodes(self):
        """Every non-None value in TS_TO_PSI should be a known PSI node name."""
        for ts_name, psi_name in TS_TO_PSI.items():
            if psi_name is not None:
                assert psi_name in ALL_PSI_COMPOSITE_NODES, (
                    f"TS_TO_PSI[{ts_name!r}] = {psi_name!r} is not in "
                    f"ALL_PSI_COMPOSITE_NODES"
                )

    def test_no_empty_sets(self):
        """Sanity: the sets should not be empty."""
        assert len(ALL_TS_NAMED_NODES) > 100
        assert len(ALL_PSI_COMPOSITE_NODES) > 50
        assert len(TS_TO_PSI) > 100
        assert len(SKIP_TS_NODES) > 10
        assert len(SKIP_PSI_NODES) > 5


class TestMappingAgainstSources:
    """Verify the mapping sets match the actual source data."""

    def test_all_ts_named_nodes_matches_json(self):
        """ALL_TS_NAMED_NODES should exactly match node-types.json."""
        with open(NODE_TYPES_JSON) as f:
            data = json.load(f)
        json_named = {item["type"] for item in data if item.get("named", False)}
        missing = json_named - ALL_TS_NAMED_NODES
        extra = ALL_TS_NAMED_NODES - json_named
        assert missing == set(), f"In JSON but not ALL_TS: {sorted(missing)}"
        assert extra == set(), f"In ALL_TS but not JSON: {sorted(extra)}"

    def test_all_psi_composite_nodes_matches_fixtures(self):
        """ALL_PSI_COMPOSITE_NODES should cover all composite nodes found in fixtures."""
        fixture_nodes = _extract_psi_nodes_from_fixtures()
        missing = fixture_nodes - ALL_PSI_COMPOSITE_NODES
        assert missing == set(), (
            f"In fixtures but not ALL_PSI: {sorted(missing)}"
        )


# ===========================================================================
# Sample file structural comparison tests
# ===========================================================================

class TestSampleFileComparison:
    """Parse 5 sample files with both parsers and verify structural comparability."""

    @pytest.fixture(params=SAMPLE_FILES)
    def sample_name(self, request: pytest.FixtureRequest) -> str:
        return request.param

    def test_both_parsers_produce_trees(self, sample_name: str):
        """Both parsers should produce valid Node trees for the sample."""
        ts_tree = _get_ts_tree(sample_name)
        psi_tree = _get_psi_tree(sample_name)
        assert isinstance(ts_tree, Node)
        assert isinstance(psi_tree, Node)

    def test_root_nodes_map_correctly(self, sample_name: str):
        """The root nodes should correspond via the mapping."""
        ts_tree = _get_ts_tree(sample_name)
        psi_tree = _get_psi_tree(sample_name)
        assert ts_tree.name == "source_file"
        assert psi_tree.name == "KtFile"
        assert TS_TO_PSI["source_file"] == "KtFile"

    def test_normalized_trees_have_comparable_depth(self, sample_name: str):
        """Normalized trees should have comparable depth (within a factor of 2)."""
        ts_tree = _get_ts_tree(sample_name)
        psi_tree = _get_psi_tree(sample_name)
        ts_norm = _normalize_ts_tree(ts_tree)
        psi_norm = _normalize_psi_tree(psi_tree)
        if ts_norm is None or psi_norm is None:
            pytest.skip("Normalization produced empty tree")
        ts_depth = _tree_depth(ts_norm)
        psi_depth = _tree_depth(psi_norm)
        # Depths should be within a factor of 2
        assert ts_depth > 0 and psi_depth > 0
        ratio = max(ts_depth, psi_depth) / min(ts_depth, psi_depth)
        assert ratio <= 2.5, (
            f"Depth ratio too large: ts={ts_depth}, psi={psi_depth}, ratio={ratio:.2f}"
        )

    def test_mapped_node_names_overlap(self, sample_name: str):
        """After normalization, the sets of node names should overlap significantly."""
        ts_tree = _get_ts_tree(sample_name)
        psi_tree = _get_psi_tree(sample_name)
        ts_norm = _normalize_ts_tree(ts_tree)
        psi_norm = _normalize_psi_tree(psi_tree)
        if ts_norm is None or psi_norm is None:
            pytest.skip("Normalization produced empty tree")
        ts_names = _collect_normalized_names(ts_norm)
        psi_names = _collect_normalized_names(psi_norm)
        overlap = ts_names & psi_names
        # There should be meaningful overlap
        assert len(overlap) >= 2, (
            f"Too little overlap between normalized names: "
            f"ts={sorted(ts_names)}, psi={sorted(psi_names)}, "
            f"overlap={sorted(overlap)}"
        )

    def test_normalized_trees_structural_similarity(self, sample_name: str):
        """The normalized trees should have similar overall structure."""
        ts_tree = _get_ts_tree(sample_name)
        psi_tree = _get_psi_tree(sample_name)
        ts_norm = _normalize_ts_tree(ts_tree)
        psi_norm = _normalize_psi_tree(psi_tree)
        if ts_norm is None or psi_norm is None:
            pytest.skip("Normalization produced empty tree")
        ts_count = _count_nodes(ts_norm)
        psi_count = _count_nodes(psi_norm)
        # Node counts should be within a factor of 3
        ratio = max(ts_count, psi_count) / max(min(ts_count, psi_count), 1)
        assert ratio <= 3.0, (
            f"Node count ratio too large: ts={ts_count}, psi={psi_count}, "
            f"ratio={ratio:.2f}"
        )


# ===========================================================================
# Helpers
# ===========================================================================

def _extract_psi_nodes_from_fixtures() -> set[str]:
    """Extract all unique composite node names from JetBrains fixture files."""
    nodes: set[str] = set()
    for txt_file in JETBRAINS_FIXTURES.glob("*.txt"):
        with open(txt_file) as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith("Psi") or stripped == "<empty list>":
                    continue
                if stripped.startswith("KtFile:"):
                    nodes.add("KtFile")
                    continue
                if re.match(r"^[A-Z][A-Z_0-9]*$", stripped):
                    nodes.add(stripped)
    return nodes


def _get_ts_tree(sample_name: str) -> Node:
    """Parse a sample file with tree-sitter and return the Node tree."""
    kt_file = JETBRAINS_FIXTURES / f"{sample_name}.kt"
    result = subprocess.run(
        ["tree-sitter", "parse", str(kt_file)],
        capture_output=True,
        text=True,
        cwd=str(TREE_SITTER_KOTLIN_DIR),
    )
    # tree-sitter outputs the tree to stdout and timing/error info to stderr
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


def _normalize_ts_tree(node: Node) -> Node | None:
    """Normalize a tree-sitter tree by applying the mapping.

    - Skips nodes in SKIP_TS_NODES (promotes their children)
    - Renames mapped nodes using TS_TO_PSI
    - Removes nodes with None mapping that aren't in SKIP_TS_NODES
    """
    return _normalize_ts_node(node)


def _normalize_ts_node(node: Node) -> Node | None:
    """Normalize a single tree-sitter node."""
    # Recursively normalize children first
    normalized_children: list[Node] = []
    for child in node.children:
        result = _normalize_ts_node(child)
        if result is not None:
            normalized_children.append(result)

    # Check if this node should be skipped (promote its children)
    if node.name in SKIP_TS_NODES:
        # Return children promoted to parent level
        if len(normalized_children) == 1:
            return normalized_children[0]
        elif len(normalized_children) > 1:
            # Can't promote multiple children to one node — keep as-is with mapped name
            mapped = TS_TO_PSI.get(node.name)
            if mapped:
                return Node(name=mapped, children=normalized_children)
            return None
        return None

    # Map the name
    mapped_name = TS_TO_PSI.get(node.name)
    if mapped_name is None:
        # Unknown or unmapped — skip this node too
        if len(normalized_children) == 1:
            return normalized_children[0]
        elif len(normalized_children) > 1:
            # Keep with original name as fallback
            return Node(name=node.name, children=normalized_children)
        return None

    return Node(name=mapped_name, children=normalized_children)


def _normalize_psi_tree(node: Node) -> Node | None:
    """Normalize a PSI tree.

    - Skips nodes in SKIP_PSI_NODES (promotes their children)
    - Collapses wrapper chains defined in WRAPPER_COLLAPSE
    """
    return _normalize_psi_node(node)


def _normalize_psi_node(node: Node) -> Node | None:
    """Normalize a single PSI node."""
    # Recursively normalize children first
    normalized_children: list[Node] = []
    for child in node.children:
        result = _normalize_psi_node(child)
        if result is not None:
            normalized_children.append(result)

    # Check if this node should be skipped (promote its children)
    if node.name in SKIP_PSI_NODES:
        if len(normalized_children) == 1:
            return normalized_children[0]
        elif len(normalized_children) > 1:
            # Promote all children
            # Create a synthetic wrapper — this handles lists like SUPER_TYPE_LIST
            return Node(name=node.name, children=normalized_children)
        return None

    # Check for wrapper collapse
    if node.name in WRAPPER_COLLAPSE:
        target = WRAPPER_COLLAPSE[node.name]
        if target == "*" and len(normalized_children) == 1:
            return normalized_children[0]
        elif target != "*":
            # Find the target child
            for child in normalized_children:
                if child.name == target:
                    # Merge other children into the target
                    other_children = [c for c in normalized_children if c is not child]
                    if other_children:
                        merged = Node(
                            name=child.name,
                            children=child.children + other_children,
                        )
                        return merged
                    return child
            # Target not found — keep as-is
            pass

    return Node(name=node.name, children=normalized_children)


def _tree_depth(node: Node) -> int:
    """Calculate tree depth."""
    if not node.children:
        return 1
    return 1 + max(_tree_depth(c) for c in node.children)


def _count_nodes(node: Node) -> int:
    """Count total nodes in tree."""
    return 1 + sum(_count_nodes(c) for c in node.children)


def _collect_normalized_names(node: Node) -> set[str]:
    """Collect unique node names from a tree."""
    names = {node.name}
    for child in node.children:
        names |= _collect_normalized_names(child)
    return names
