"""Parser for tree-sitter S-expression output format.

Parses output like:
    (source_file [0, 0] - [7, 0]
      (class_declaration [4, 0] - [6, 1]
        (type_identifier [4, 6] - [4, 14])))

Into a tree of Node objects, stripping position info and keeping only named nodes.
"""

from __future__ import annotations

import re
from models import Node


def parse_tree_sitter(text: str) -> Node:
    """Parse a tree-sitter S-expression string into a Node tree.

    Args:
        text: The S-expression output from `tree-sitter parse`.

    Returns:
        The root Node of the parsed tree.

    Raises:
        ValueError: If the input is empty or malformed.
    """
    text = text.strip()
    if not text:
        raise ValueError("Empty input")

    tokens = _tokenize(text)
    node, _ = _parse_node(tokens, 0)
    return node


def _tokenize(text: str) -> list[str]:
    """Tokenize an S-expression into a list of meaningful tokens.

    Splits the text into '(', ')', node names, and skips position annotations
    like '[0, 0] - [7, 0]'.
    """
    # Remove position annotations: [row, col] - [row, col]
    cleaned = re.sub(r"\[\d+,\s*\d+\]\s*-\s*\[\d+,\s*\d+\]", "", text)

    tokens: list[str] = []
    i = 0
    while i < len(cleaned):
        ch = cleaned[i]
        if ch in " \t\n\r":
            i += 1
            continue
        if ch == "(":
            tokens.append("(")
            i += 1
            continue
        if ch == ")":
            tokens.append(")")
            i += 1
            continue
        # Read a node name (word characters, underscores, dots)
        j = i
        while j < len(cleaned) and cleaned[j] not in "() \t\n\r":
            j += 1
        word = cleaned[i:j]
        if word:
            tokens.append(word)
        i = j
    return tokens


def _parse_node(tokens: list[str], pos: int) -> tuple[Node, int]:
    """Parse a single node starting at the given token position.

    A node is: '(' name children... ')'

    Returns:
        A tuple of (parsed Node, next token position).
    """
    if pos >= len(tokens) or tokens[pos] != "(":
        raise ValueError(f"Expected '(' at position {pos}, got {tokens[pos] if pos < len(tokens) else 'EOF'}")

    pos += 1  # skip '('

    if pos >= len(tokens):
        raise ValueError("Unexpected end of input after '('")

    name = tokens[pos]
    pos += 1

    children: list[Node] = []
    while pos < len(tokens) and tokens[pos] != ")":
        if tokens[pos] == "(":
            child, pos = _parse_node(tokens, pos)
            children.append(child)
        else:
            # Skip any unexpected tokens (shouldn't happen after cleaning)
            pos += 1

    if pos >= len(tokens):
        raise ValueError("Unexpected end of input, expected ')'")

    pos += 1  # skip ')'
    return Node(name=name, children=children), pos
