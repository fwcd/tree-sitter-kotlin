"""Parser for JetBrains PSI indented tree format.

Parses output like:
    KtFile: BabySteps.kt
      PsiComment(EOL_COMMENT)('// COMPILATION_ERRORS')
      PsiWhiteSpace('\\n\\n')
      PACKAGE_DIRECTIVE
        PsiElement(package)('package')
        PsiWhiteSpace(' ')
        REFERENCE_EXPRESSION
          PsiElement(IDENTIFIER)('foo')

Into a tree of Node objects, keeping only composite nodes (ALL_CAPS names).
Skips PsiElement(...), PsiWhiteSpace(...), PsiComment(...), and <empty list>.
"""

from __future__ import annotations

import re
from models import Node


def parse_psi(text: str) -> Node:
    """Parse JetBrains PSI indented format into a Node tree.

    Args:
        text: The PSI tree text from a .txt fixture file.

    Returns:
        The root Node of the parsed tree.

    Raises:
        ValueError: If the input is empty or malformed.
    """
    text = text.strip()
    if not text:
        raise ValueError("Empty input")

    lines = text.split("\n")
    parsed_lines = _parse_lines(lines)
    if not parsed_lines:
        raise ValueError("No valid nodes found in input")

    root, _ = _build_tree(parsed_lines, 0, -1)
    return root


def _parse_lines(lines: list[str]) -> list[tuple[int, str]]:
    """Parse raw lines into (indent_level, node_name) pairs.

    Filters out:
    - PsiElement(...) lines (leaf token nodes)
    - PsiWhiteSpace(...) lines
    - PsiComment(...) lines
    - <empty list> lines
    - Blank lines

    The root line (KtFile: ...) gets indent -1 equivalent (handled specially).

    Returns:
        List of (indent, name) tuples for composite nodes only.
    """
    result: list[tuple[int, str]] = []

    for line in lines:
        if not line.strip():
            continue

        # Calculate indentation (number of leading spaces)
        stripped = line.lstrip()
        indent = len(line) - len(stripped)

        # Skip lines we don't care about
        if _should_skip(stripped):
            continue

        # Handle root: KtFile: filename.kt
        kt_file_match = re.match(r"^KtFile:\s*(.+)$", stripped)
        if kt_file_match:
            result.append((indent, "KtFile"))
            continue

        # Composite node: an ALL_CAPS name (with possible underscores)
        # e.g. PACKAGE_DIRECTIVE, CLASS, TYPE_PARAMETER_LIST
        node_name = stripped.strip()
        if _is_composite_node(node_name):
            result.append((indent, node_name))

    return result


def _should_skip(stripped: str) -> bool:
    """Check if a stripped line should be skipped."""
    if stripped.startswith("PsiElement("):
        return True
    if stripped.startswith("PsiWhiteSpace("):
        return True
    if stripped.startswith("PsiComment("):
        return True
    if stripped.startswith("PsiErrorElement"):
        return True
    if stripped == "<empty list>":
        return True
    return False


def _is_composite_node(name: str) -> bool:
    """Check if a name represents a composite PSI node.

    Composite nodes are ALL_CAPS with underscores (e.g., PACKAGE_DIRECTIVE, CLASS).
    """
    return bool(re.match(r"^[A-Z][A-Z_0-9]*$", name))


def _build_tree(
    lines: list[tuple[int, str]], start: int, parent_indent: int
) -> tuple[Node, int]:
    """Build a Node tree from parsed lines starting at the given index.

    Args:
        lines: List of (indent, name) tuples.
        start: Index to start building from.
        parent_indent: Indent level of the parent node.

    Returns:
        A tuple of (root Node, next index to process).
    """
    indent, name = lines[start]
    node = Node(name=name)
    i = start + 1

    while i < len(lines):
        child_indent, _ = lines[i]
        if child_indent <= indent:
            # This line is at the same level or above — not our child
            break
        # This is a child node
        child, i = _build_tree(lines, i, indent)
        node.children.append(child)

    return node, i
