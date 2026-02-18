"""Shared data model for parsed syntax trees."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Node:
    """A node in a syntax tree.

    Attributes:
        name: The node type name (e.g. 'source_file', 'CLASS', 'PACKAGE_DIRECTIVE').
        children: Child nodes.
    """

    name: str
    children: list[Node] = field(default_factory=list)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Node):
            return NotImplemented
        return self.name == other.name and self.children == other.children

    def __repr__(self) -> str:
        if self.children:
            children_repr = ", ".join(repr(c) for c in self.children)
            return f"Node({self.name!r}, [{children_repr}])"
        return f"Node({self.name!r})"
