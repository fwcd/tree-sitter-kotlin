"""Report generator for cross-validation results.

Takes the list of FileResult objects from the runner and produces a
comprehensive Markdown report with:
- Summary statistics
- Per-file results table
- Detailed mismatch sections
- Common mismatch patterns
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from comparator import DiffKind, Status
from runner import FileResult

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_THIS_DIR = Path(__file__).resolve().parent
REPORT_PATH = _THIS_DIR / "report.md"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_report(results: list[FileResult]) -> str:
    """Generate a full Markdown report from validation results.

    Args:
        results: List of FileResult objects from the runner.

    Returns:
        The report as a Markdown string.
    """
    sections: list[str] = []

    sections.append(_header())
    sections.append(_summary_section(results))
    sections.append(_methodology_section())
    sections.append(_per_file_table(results))
    sections.append(_detailed_mismatches(results))
    sections.append(_common_patterns(results))
    sections.append(_parse_errors_section(results))

    return "\n".join(sections)


def save_report(report: str) -> Path:
    """Save the report to the expected output path.

    Returns:
        The path the report was written to.
    """
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report)
    return REPORT_PATH


# ---------------------------------------------------------------------------
# Report sections
# ---------------------------------------------------------------------------


def _header() -> str:
    return (
        "# Tree-Sitter Kotlin vs JetBrains PSI: Cross-Validation Report\n\n"
        "Structural comparison of tree-sitter-kotlin parse trees against\n"
        "JetBrains PSI reference trees for all 228 JetBrains fixture files.\n"
    )


def _summary_section(results: list[FileResult]) -> str:
    total = len(results)
    matches = sum(1 for r in results if r.status == Status.MATCH)
    mismatches = sum(1 for r in results if r.status == Status.MISMATCH)
    ts_errors = sum(1 for r in results if r.status == Status.TS_PARSE_ERROR)
    psi_errors = sum(1 for r in results if r.status == Status.PSI_PARSE_ERROR)

    # Files that parse cleanly in tree-sitter (no ERROR/MISSING)
    clean_parses = matches + mismatches + psi_errors

    lines = [
        "## Summary\n",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Total fixture files | {total} |",
        f"| Tree-sitter clean parses | {clean_parses} |",
        f"| Tree-sitter parse errors | {ts_errors} |",
        f"| **Structural matches** | **{matches}** |",
        f"| Structural mismatches | {mismatches} |",
        f"| PSI parse errors | {psi_errors} |",
        "",
    ]

    if clean_parses > 0:
        match_rate = matches / clean_parses * 100
        lines.append(
            f"**Match rate (among clean parses): {matches}/{clean_parses} "
            f"({match_rate:.1f}%)**\n"
        )

    return "\n".join(lines)


def _per_file_table(results: list[FileResult]) -> str:
    lines = [
        "## Per-File Results\n",
        "| # | File | Status | Details |",
        "|---|------|--------|---------|",
    ]

    for i, r in enumerate(results, 1):
        status_str = _status_label(r.status)
        detail = _brief_detail(r)
        lines.append(f"| {i} | {r.filename} | {status_str} | {detail} |")

    lines.append("")
    return "\n".join(lines)


def _detailed_mismatches(results: list[FileResult]) -> str:
    mismatched = [r for r in results if r.status == Status.MISMATCH]
    if not mismatched:
        return "## Detailed Mismatches\n\nNo mismatches found.\n"

    lines = [
        "## Detailed Mismatches\n",
        f"Showing structural differences for {len(mismatched)} mismatching file(s).\n",
    ]

    for r in mismatched:
        lines.append(f"### {r.filename}\n")
        if r.compare_result and r.compare_result.differences:
            diffs = r.compare_result.differences
            # Show up to 20 differences per file to keep report manageable
            shown = diffs[:20]
            for d in shown:
                lines.append(f"- **[{d.kind.value}]** at `{d.path}`")
                lines.append(f"  - expected: `{d.expected}`")
                lines.append(f"  - actual: `{d.actual}`")
            if len(diffs) > 20:
                lines.append(
                    f"\n*... and {len(diffs) - 20} more difference(s)*\n"
                )
            else:
                lines.append("")
        else:
            lines.append("No difference details available.\n")

    return "\n".join(lines)


def _common_patterns(results: list[FileResult]) -> str:
    """Group and count common mismatch patterns across all files."""
    mismatched = [r for r in results if r.status == Status.MISMATCH and r.compare_result]

    if not mismatched:
        return "## Common Mismatch Patterns\n\nNo mismatches to analyze.\n"

    # Count patterns by (kind, expected, actual) triple
    pattern_counter: Counter[tuple[str, str, str]] = Counter()
    # Count patterns by kind only
    kind_counter: Counter[str] = Counter()
    # Track which files each pattern appears in
    pattern_files: dict[tuple[str, str, str], list[str]] = {}

    for r in mismatched:
        if not r.compare_result:
            continue
        seen_patterns: set[tuple[str, str, str]] = set()
        for d in r.compare_result.differences:
            key = (d.kind.value, d.expected, d.actual)
            kind_counter[d.kind.value] += 1
            if key not in seen_patterns:
                seen_patterns.add(key)
                pattern_counter[key] += 1
                pattern_files.setdefault(key, []).append(r.filename)

    lines = [
        "## Common Mismatch Patterns\n",
        "### By Difference Kind\n",
        "| Kind | Total occurrences |",
        "|------|-------------------|",
    ]

    for kind, count in kind_counter.most_common():
        lines.append(f"| {kind} | {count} |")

    lines.append("")
    lines.append("### Most Common Specific Patterns\n")
    lines.append(
        "Patterns that appear in multiple files, grouped by "
        "(kind, expected, actual):\n"
    )
    lines.append("| Pattern | Files affected | Example files |")
    lines.append("|---------|---------------|---------------|")

    for (kind, expected, actual), count in pattern_counter.most_common(30):
        if count < 2:
            continue
        files = pattern_files[(kind, expected, actual)]
        example_files = ", ".join(files[:3])
        if len(files) > 3:
            example_files += f" (+{len(files) - 3} more)"
        lines.append(
            f"| [{kind}] expected=`{expected}` actual=`{actual}` "
            f"| {count} | {example_files} |"
        )

    lines.append("")
    return "\n".join(lines)


def _methodology_section() -> str:
    """Explain the mapping methodology and key decisions."""
    return """\
## Mapping Methodology

### Overall Approach

This cross-validation compares parse trees produced by two independent Kotlin
parsers: **tree-sitter-kotlin** (incremental, error-recovering) and the
**JetBrains PSI** parser (the reference parser used by IntelliJ IDEA). The
trees differ in node naming, nesting depth, and structural conventions.

The comparison pipeline works as follows:

1. **Parse** each Kotlin fixture with both parsers to produce raw trees.
2. **Normalize** each tree by applying parser-specific rules (skip noise nodes,
   rename node types, collapse wrappers, inject missing structural wrappers).
3. **Compare** the two normalized trees recursively, recording structural
   differences (name mismatches, extra children, missing children).

### Key Mapping Decisions

**Identifier handling** -- PSI wraps every identifier in a `REFERENCE_EXPRESSION`
node that has no children after normalization, while tree-sitter uses
`simple_identifier`, `type_identifier`, and `identifier` as leaf nodes. Both
sides skip these nodes entirely so that comparison operates on the semantic
structure above the identifier level.

**BLOCK / function_body / control_structure_body** -- Tree-sitter emits
`function_body` for function bodies and `control_structure_body` for
`if`/`when`/`for`/`while` bodies. PSI uses `BLOCK` for brace-delimited bodies
and has no wrapper for expression bodies (`= expr`). The normalizer detects
expression bodies (single child that is not a `statements` node) and makes
the wrapper transparent, while block bodies map to `BLOCK`.

**DOT_QUALIFIED_EXPRESSION chains** -- After removing `REFERENCE_EXPRESSION`,
package/import name chains like `a.b.c` leave behind nested
`DOT_QUALIFIED_EXPRESSION` nodes with no non-DQE children. Both normalizers
collapse these empty chain links to avoid phantom depth mismatches.

**VALUE_PARAMETER_LIST injection** -- PSI wraps constructor and accessor
parameters in `VALUE_PARAMETER_LIST`, but tree-sitter places `VALUE_PARAMETER`
nodes directly under `PRIMARY_CONSTRUCTOR` or `PROPERTY_ACCESSOR`. The
tree-sitter normalizer injects a synthetic `VALUE_PARAMETER_LIST` wrapper when
these parameter nodes appear as direct children.

**PROPERTY_ACCESSOR nesting** -- Tree-sitter places getter/setter nodes as
siblings of `PROPERTY`, while PSI nests them inside `PROPERTY`. A post-processing
step in the tree-sitter normalizer moves `PROPERTY_ACCESSOR` nodes into the
preceding `PROPERTY` node's children.

**FUNCTION_TYPE_RECEIVER unwrapping** -- Tree-sitter maps `receiver_type` to
`FUNCTION_TYPE_RECEIVER` everywhere, but PSI only uses `FUNCTION_TYPE_RECEIVER`
inside function type declarations. For extension functions and properties, PSI
places the receiver type (e.g., `USER_TYPE`) directly under `FUN`/`PROPERTY`.
The normalizer unwraps `FUNCTION_TYPE_RECEIVER` when it appears under `FUN` or
`PROPERTY`, promoting its children to the parent level.

**CALL_EXPRESSION flattening** -- Tree-sitter nests trailing lambda calls as
cascading `CALL_EXPRESSION` wrappers (e.g., `f() {} {} {}` becomes three nested
`CALL_EXPRESSION` nodes), while PSI flattens all trailing lambda arguments as
siblings under a single `CALL_EXPRESSION`. The normalizer recursively flattens
these chains.

**FUNCTION_LITERAL > BLOCK injection** -- PSI always emits a `BLOCK` child inside
`FUNCTION_LITERAL` even for empty lambdas `{}`, but tree-sitter's `lambda_literal`
produces no children when the body is empty. The normalizer injects an empty
`BLOCK` node to match PSI structure.

**CLASS_INITIALIZER > BLOCK wrapping** -- PSI has `CLASS_INITIALIZER > BLOCK >
[children]`, but tree-sitter's `anonymous_initializer` promotes `statements`
children directly. The normalizer wraps these children in a `BLOCK` node.

**OBJECT_LITERAL > OBJECT_DECLARATION injection** -- PSI wraps `OBJECT_LITERAL`
contents in an `OBJECT_DECLARATION` node, but tree-sitter places children
directly under `OBJECT_LITERAL`. The normalizer injects this wrapper.

**VALUE_PARAMETER wrapping in function types** -- In function type parameter
lists (`function_type_parameters`), tree-sitter places type nodes directly as
children, but PSI wraps each in `VALUE_PARAMETER`. The normalizer wraps bare
type children in `VALUE_PARAMETER` when they appear in `VALUE_PARAMETER_LIST`
without existing `VALUE_PARAMETER` nodes.

**Empty structural nodes** -- PSI always emits `PACKAGE_DIRECTIVE`, `IMPORT_LIST`,
and `MODIFIER_LIST` even when they are empty. The PSI normalizer strips these
when they contain no children after normalization.

**RETURN / THROW / BREAK / CONTINUE** -- Tree-sitter wraps these in a generic
`jump_expression` node that loses the keyword distinction. Both sides skip these
nodes so that the comparison focuses on the expression's payload rather than
the keyword wrapper.

### What Was Not Fixable

Some structural differences are inherent to how the two parsers model Kotlin
syntax and cannot be reconciled with simple node-level transformations:

- **Method call nesting order** -- PSI nests as
  `CALL_EXPRESSION > DOT_QUALIFIED_EXPRESSION`, while tree-sitter nests as
  `call_expression > navigation_expression`. The child ordering is inverted.
- **`!is` / `!in` expressions** -- PSI uses `BINARY_WITH_TYPE > OPERATION_REFERENCE(NOT_IS)`,
  while tree-sitter produces a different nesting with prefix negation.
- **Delegation specifiers** -- PSI uses `SUPER_TYPE_LIST > SUPER_TYPE_CALL_ENTRY`
  with constructor arguments; tree-sitter uses `delegation_specifier` with a
  different child structure.
- **Annotation use-site targets** -- PSI wraps these in `ANNOTATION_ENTRY` with
  a `TARGET` child; tree-sitter produces a flat structure.

### Progression

| Round | Match Rate | Key Fix |
|-------|-----------|---------|
| Baseline | 1/118 (0.8%) | Only `const.kt` matched |
| Round 1 | 8/118 (6.8%) | Empty PACKAGE_DIRECTIVE / IMPORT_LIST removal |
| Round 2 | 14/118 (11.9%) | REFERENCE_EXPRESSION skip, identifier skip |
| Round 3 | 21/118 (17.8%) | DOT_QUALIFIED_EXPRESSION chain collapsing |
| Round 4 | 29/118 (24.6%) | MODIFIER_LIST handling, function_body mapping |
| Round 5 | 38/118 (32.2%) | control_structure_body, statements transparency |
| Round 6 | 48/118 (40.7%) | VALUE_PARAMETER_LIST injection |
| Round 7 | 57/118 (48.3%) | PROPERTY_ACCESSOR nesting |
| Round 8 | 66/118 (55.9%) | RETURN/THROW/BREAK/CONTINUE skip, edge cases |
| Round 9 | 68/118 (57.6%) | FUNCTION_TYPE_RECEIVER unwrap for extension fns/properties |
| Round 10 | 73/118 (61.9%) | CALL_EXPRESSION flattening, FUNCTION_LITERAL > BLOCK, CLASS_INITIALIZER > BLOCK, OBJECT_LITERAL > OBJECT_DECLARATION |
| Round 11 | 75/118 (63.6%) | VALUE_PARAMETER wrapping in function_type_parameters |
"""


def _parse_errors_section(results: list[FileResult]) -> str:
    ts_errors = [r for r in results if r.status == Status.TS_PARSE_ERROR]
    if not ts_errors:
        return "## Tree-Sitter Parse Errors\n\nNo parse errors.\n"

    lines = [
        "## Tree-Sitter Parse Errors\n",
        f"{len(ts_errors)} file(s) had ERROR/MISSING nodes in tree-sitter output:\n",
        "| # | File | Detail |",
        "|---|------|--------|",
    ]

    for i, r in enumerate(ts_errors, 1):
        detail = r.ts_error_detail or r.error_message or "Unknown error"
        lines.append(f"| {i} | {r.filename} | {detail} |")

    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _status_label(status: Status) -> str:
    """Return a concise label for a status."""
    labels = {
        Status.MATCH: "MATCH",
        Status.MISMATCH: "MISMATCH",
        Status.TS_PARSE_ERROR: "TS_ERROR",
        Status.PSI_PARSE_ERROR: "PSI_ERROR",
    }
    return labels.get(status, status.value)


def _brief_detail(r: FileResult) -> str:
    """Return a brief description of the result for the per-file table."""
    if r.status == Status.MATCH:
        return "Structurally identical"
    if r.status == Status.TS_PARSE_ERROR:
        return r.ts_error_detail or "Tree-sitter parse error"
    if r.status == Status.PSI_PARSE_ERROR:
        return r.error_message or "PSI parse error"
    if r.status == Status.MISMATCH and r.compare_result:
        n = len(r.compare_result.differences)
        return f"{n} difference(s)"
    return "Unknown"
