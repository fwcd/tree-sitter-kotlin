"""Structural comparator for normalized syntax trees.

Takes two normalized trees (one from tree-sitter, one from JetBrains PSI)
and produces a structural diff describing matches and mismatches.

Usage::

    from comparator import compare_trees, Status
    from normalizer import normalize_ts, normalize_psi

    result = compare_trees(ts_normalized, psi_normalized)
    if result.status == Status.MATCH:
        print("Trees are structurally identical")
    else:
        for diff in result.differences:
            print(f"  {diff}")
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from models import Node


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


class Status(Enum):
    """Overall comparison result status."""

    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    TS_PARSE_ERROR = "TS_PARSE_ERROR"
    PSI_PARSE_ERROR = "PSI_PARSE_ERROR"


class DiffKind(Enum):
    """Kind of structural difference."""

    NAME_MISMATCH = "name_mismatch"
    MISSING_CHILD = "missing_child"
    EXTRA_CHILD = "extra_child"
    CHILD_COUNT_MISMATCH = "child_count_mismatch"


@dataclass
class Difference:
    """A single structural difference between two trees.

    Attributes:
        path: Location in the tree, e.g. ``"KtFile > CLASS > TYPE_PARAMETER_LIST"``.
        expected: What the PSI tree has (the reference).
        actual: What the tree-sitter tree has.
        kind: Category of the difference.
    """

    path: str
    expected: str
    actual: str
    kind: DiffKind

    def __repr__(self) -> str:
        return (
            f"Difference(path={self.path!r}, kind={self.kind.value!r}, "
            f"expected={self.expected!r}, actual={self.actual!r})"
        )

    def __str__(self) -> str:
        return (
            f"[{self.kind.value}] at {self.path}: "
            f"expected={self.expected}, actual={self.actual}"
        )


@dataclass
class CompareResult:
    """Result of comparing two normalized trees.

    Attributes:
        status: Overall status (MATCH, MISMATCH, TS_PARSE_ERROR, PSI_PARSE_ERROR).
        differences: List of structural differences found (empty for MATCH).
    """

    status: Status
    differences: list[Difference] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compare_trees(ts_tree: Node | None, psi_tree: Node | None) -> CompareResult:
    """Compare two normalized trees structurally.

    Both trees should already be normalized (names mapped to the same
    namespace, skip-nodes removed, wrappers collapsed).

    Args:
        ts_tree: The normalized tree-sitter tree (or None if parsing failed).
        psi_tree: The normalized PSI tree (or None if parsing failed).

    Returns:
        A CompareResult with status and any differences.
    """
    if ts_tree is None:
        return CompareResult(status=Status.TS_PARSE_ERROR)
    if psi_tree is None:
        return CompareResult(status=Status.PSI_PARSE_ERROR)

    differences: list[Difference] = []
    _compare_nodes(ts_tree, psi_tree, path="", differences=differences)

    if differences:
        return CompareResult(status=Status.MISMATCH, differences=differences)
    return CompareResult(status=Status.MATCH)


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _compare_nodes(
    ts_node: Node,
    psi_node: Node,
    path: str,
    differences: list[Difference],
) -> None:
    """Recursively compare two nodes and collect differences.

    Args:
        ts_node: Current node from the tree-sitter side.
        psi_node: Current node from the PSI side.
        path: Dot-separated path from root to current node.
        differences: Accumulator for found differences.
    """
    current_path = f"{path} > {psi_node.name}" if path else psi_node.name

    # Check name match
    if ts_node.name != psi_node.name:
        differences.append(
            Difference(
                path=current_path,
                expected=psi_node.name,
                actual=ts_node.name,
                kind=DiffKind.NAME_MISMATCH,
            )
        )
        # Names differ — still try to compare children for deeper diagnostics
        # but use the PSI name for the path since it's the reference

    ts_children = ts_node.children
    psi_children = psi_node.children

    # Compare child counts
    if len(ts_children) != len(psi_children):
        differences.append(
            Difference(
                path=current_path,
                expected=str(len(psi_children)),
                actual=str(len(ts_children)),
                kind=DiffKind.CHILD_COUNT_MISMATCH,
            )
        )

    # Compare children pairwise (up to the shorter list)
    min_count = min(len(ts_children), len(psi_children))
    for i in range(min_count):
        _compare_nodes(ts_children[i], psi_children[i], current_path, differences)

    # Report extra children on tree-sitter side
    for i in range(min_count, len(ts_children)):
        child_path = f"{current_path} > [child {i}]"
        differences.append(
            Difference(
                path=child_path,
                expected="(absent)",
                actual=ts_children[i].name,
                kind=DiffKind.EXTRA_CHILD,
            )
        )

    # Report missing children on tree-sitter side (present in PSI)
    for i in range(min_count, len(psi_children)):
        child_path = f"{current_path} > [child {i}]"
        differences.append(
            Difference(
                path=child_path,
                expected=psi_children[i].name,
                actual="(absent)",
                kind=DiffKind.MISSING_CHILD,
            )
        )
