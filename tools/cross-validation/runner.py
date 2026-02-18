"""Runner that validates all JetBrains fixture files against tree-sitter.

Iterates all .kt files in the JetBrains fixtures directory, parses each
with tree-sitter, checks for ERROR/MISSING nodes, and if clean, performs
a full structural comparison against the corresponding PSI fixture.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

from comparator import CompareResult, Status, compare_trees
from models import Node
from normalizer import normalize_psi, normalize_ts
from parser_psi import parse_psi
from parser_ts import parse_tree_sitter

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

JETBRAINS_FIXTURES = (
    Path.home() / ".nanobot" / "kotlin-rs" / "tests" / "fixtures" / "jetbrains"
)
TREE_SITTER_KOTLIN_DIR = Path.home() / ".nanobot" / "tree-sitter-kotlin"


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------


@dataclass
class FileResult:
    """Result of validating a single fixture file.

    Attributes:
        filename: Base name of the .kt file (without extension).
        status: Overall status from comparison (or TS_PARSE_ERROR).
        compare_result: The full CompareResult, if comparison was performed.
        ts_error_detail: Brief description if tree-sitter had parse errors.
        error_message: Error message if an unexpected exception occurred.
    """

    filename: str
    status: Status
    compare_result: CompareResult | None = None
    ts_error_detail: str | None = None
    error_message: str | None = None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def run_all() -> list[FileResult]:
    """Run cross-validation against all .kt fixture files.

    Returns:
        A list of FileResult objects, one per .kt file, sorted by filename.
    """
    kt_files = sorted(JETBRAINS_FIXTURES.glob("*.kt"))
    results: list[FileResult] = []

    for kt_file in kt_files:
        name = kt_file.stem
        print(f"  Processing {name}...", file=sys.stderr)
        result = _validate_file(name, kt_file)
        results.append(result)

    return results


def _validate_file(name: str, kt_file: Path) -> FileResult:
    """Validate a single fixture file.

    Steps:
    1. Run tree-sitter parse; if ERROR/MISSING in output -> TS_PARSE_ERROR.
    2. Parse the tree-sitter S-expression into a Node tree.
    3. Parse the corresponding .txt PSI fixture into a Node tree.
    4. Normalize both trees.
    5. Compare and return the result.
    """
    # Step 1: Run tree-sitter parse
    try:
        ts_output = _run_tree_sitter(kt_file)
    except Exception as e:
        return FileResult(
            filename=name,
            status=Status.TS_PARSE_ERROR,
            ts_error_detail=f"tree-sitter execution failed: {e}",
        )

    # Check for ERROR/MISSING nodes in tree-sitter output
    if _has_parse_errors(ts_output):
        error_count = _count_parse_errors(ts_output)
        return FileResult(
            filename=name,
            status=Status.TS_PARSE_ERROR,
            ts_error_detail=f"{error_count} ERROR/MISSING node(s) in tree-sitter output",
        )

    # Step 2: Parse tree-sitter output
    try:
        ts_tree = parse_tree_sitter(ts_output)
    except Exception as e:
        return FileResult(
            filename=name,
            status=Status.TS_PARSE_ERROR,
            ts_error_detail=f"Failed to parse tree-sitter output: {e}",
        )

    # Step 3: Parse PSI fixture
    txt_file = JETBRAINS_FIXTURES / f"{name}.txt"
    if not txt_file.exists():
        return FileResult(
            filename=name,
            status=Status.PSI_PARSE_ERROR,
            error_message=f"No PSI fixture file: {txt_file.name}",
        )

    try:
        psi_text = txt_file.read_text()
        psi_tree = parse_psi(psi_text)
    except Exception as e:
        return FileResult(
            filename=name,
            status=Status.PSI_PARSE_ERROR,
            error_message=f"Failed to parse PSI fixture: {e}",
        )

    # Step 4: Normalize both trees
    ts_norm = normalize_ts(ts_tree)
    psi_norm = normalize_psi(psi_tree)

    # Step 5: Compare
    compare_result = compare_trees(ts_norm, psi_norm)

    return FileResult(
        filename=name,
        status=compare_result.status,
        compare_result=compare_result,
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _run_tree_sitter(kt_file: Path) -> str:
    """Run `tree-sitter parse` on a .kt file and return stdout."""
    result = subprocess.run(
        ["tree-sitter", "parse", str(kt_file)],
        capture_output=True,
        text=True,
        cwd=str(TREE_SITTER_KOTLIN_DIR),
        timeout=30,
    )
    output = result.stdout.strip()
    if not output:
        raise ValueError(f"tree-sitter produced no output for {kt_file.name}")
    return output


def _has_parse_errors(ts_output: str) -> bool:
    """Check if tree-sitter output contains ERROR or MISSING nodes."""
    return "(ERROR" in ts_output or "(MISSING" in ts_output


def _count_parse_errors(ts_output: str) -> int:
    """Count ERROR and MISSING nodes in tree-sitter output."""
    return ts_output.count("(ERROR") + ts_output.count("(MISSING")
