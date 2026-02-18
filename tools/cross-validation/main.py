"""Entry point: run full cross-validation and generate the report.

Usage::

    cd tools/cross-validation
    python main.py                     # full validation
    python main.py --debug BabySteps   # debug a single file
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

from comparator import Status, compare_trees
from models import Node
from normalizer import normalize_psi, normalize_ts
from parser_psi import parse_psi
from parser_ts import parse_tree_sitter
from report import generate_report, save_report
from runner import run_all, JETBRAINS_FIXTURES, TREE_SITTER_KOTLIN_DIR


# ---------------------------------------------------------------------------
# Debug mode helpers
# ---------------------------------------------------------------------------


def _print_tree(node: Node | None, indent: int = 0, file=sys.stderr) -> None:
    """Pretty-print a normalized Node tree."""
    if node is None:
        print(f"{'  ' * indent}(None)", file=file)
        return
    if node.children:
        print(f"{'  ' * indent}{node.name}", file=file)
        for child in node.children:
            _print_tree(child, indent + 1, file=file)
    else:
        print(f"{'  ' * indent}{node.name}", file=file)


def debug_file(name: str) -> None:
    """Print normalized trees side-by-side for a given fixture file."""
    print(f"=== Debug: {name} ===\n", file=sys.stderr)

    # Parse tree-sitter
    kt_file = JETBRAINS_FIXTURES / f"{name}.kt"
    if not kt_file.exists():
        print(f"ERROR: {kt_file} not found", file=sys.stderr)
        return
    result = subprocess.run(
        ["tree-sitter", "parse", str(kt_file)],
        capture_output=True,
        text=True,
        cwd=str(TREE_SITTER_KOTLIN_DIR),
        timeout=30,
    )
    ts_output = result.stdout.strip()
    if not ts_output:
        print("ERROR: tree-sitter produced no output", file=sys.stderr)
        return
    if "(ERROR" in ts_output or "(MISSING" in ts_output:
        print("WARNING: tree-sitter output contains ERROR/MISSING nodes", file=sys.stderr)

    ts_tree = parse_tree_sitter(ts_output)

    # Parse PSI
    txt_file = JETBRAINS_FIXTURES / f"{name}.txt"
    if not txt_file.exists():
        print(f"ERROR: {txt_file} not found", file=sys.stderr)
        return
    psi_text = txt_file.read_text()
    psi_tree = parse_psi(psi_text)

    # Normalize
    ts_norm = normalize_ts(ts_tree)
    psi_norm = normalize_psi(psi_tree)

    # Print side by side
    print("--- Tree-Sitter (normalized) ---", file=sys.stderr)
    _print_tree(ts_norm)
    print(file=sys.stderr)
    print("--- PSI (normalized) ---", file=sys.stderr)
    _print_tree(psi_norm)
    print(file=sys.stderr)

    # Compare
    cmp_result = compare_trees(ts_norm, psi_norm)
    print(f"--- Status: {cmp_result.status.value} ---", file=sys.stderr)
    if cmp_result.differences:
        print(f"Differences ({len(cmp_result.differences)}):", file=sys.stderr)
        for d in cmp_result.differences:
            print(f"  {d}", file=sys.stderr)
    print(file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Tree-Sitter Kotlin vs JetBrains PSI Cross-Validator"
    )
    parser.add_argument(
        "--debug",
        metavar="FILE",
        help="Debug a single fixture file (print normalized trees side-by-side)",
    )
    args = parser.parse_args()

    if args.debug:
        debug_file(args.debug)
        return

    print("=" * 60, file=sys.stderr)
    print("Tree-Sitter Kotlin ↔ JetBrains PSI Cross-Validator", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(file=sys.stderr)

    # Run validation
    print("Running validation against all fixture files...", file=sys.stderr)
    start = time.time()
    results = run_all()
    elapsed = time.time() - start
    print(f"\nValidation complete in {elapsed:.1f}s", file=sys.stderr)

    # Print quick summary to stderr
    total = len(results)
    matches = sum(1 for r in results if r.status == Status.MATCH)
    mismatches = sum(1 for r in results if r.status == Status.MISMATCH)
    ts_errors = sum(1 for r in results if r.status == Status.TS_PARSE_ERROR)
    psi_errors = sum(1 for r in results if r.status == Status.PSI_PARSE_ERROR)

    print(f"\nResults:", file=sys.stderr)
    print(f"  Total files:      {total}", file=sys.stderr)
    print(f"  Matches:          {matches}", file=sys.stderr)
    print(f"  Mismatches:       {mismatches}", file=sys.stderr)
    print(f"  TS parse errors:  {ts_errors}", file=sys.stderr)
    print(f"  PSI parse errors: {psi_errors}", file=sys.stderr)

    clean_parses = matches + mismatches + psi_errors
    if clean_parses > 0:
        match_rate = matches / clean_parses * 100
        print(f"  Match rate:       {matches}/{clean_parses} ({match_rate:.1f}%)", file=sys.stderr)

    # Generate and save report
    print("\nGenerating report...", file=sys.stderr)
    report = generate_report(results)
    path = save_report(report)
    print(f"Report saved to: {path}", file=sys.stderr)
    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
