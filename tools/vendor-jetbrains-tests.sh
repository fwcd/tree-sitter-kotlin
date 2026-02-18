#!/usr/bin/env bash
#
# vendor-jetbrains-tests.sh — Generate tree-sitter corpus tests from JetBrains Kotlin fixtures.
#
# Usage:
#   ./tools/vendor-jetbrains-tests.sh <path-to-jetbrains-fixtures-dir>
#
# Example:
#   ./tools/vendor-jetbrains-tests.sh tools/cross-validation/fixtures/
#
# The script:
#   1. Reads every *.kt file in the source directory
#   2. Skips *_ERR.kt files (intentional parse error tests)
#   3. Skips files listed in tools/cross-validation/excluded.txt
#   4. Parses each with `tree-sitter parse`
#   5. If the parse is clean (no ERROR nodes), generates a corpus test file
#   6. Output goes to test/corpus/jetbrains/<OriginalName>.txt (one test per file)
#   7. Prints a summary when done
#
# Zero-length named nodes in tree-sitter parse output indicate MISSING tokens.
# These are transformed into the (MISSING _alpha_identifier) syntax that
# tree-sitter test expects.
#
# The script is idempotent — it cleans the output dir before generating.

set -euo pipefail

# --- Configuration -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/test/corpus/jetbrains"
EXCLUDED_FILE="$SCRIPT_DIR/cross-validation/excluded.txt"

# --- Argument handling -------------------------------------------------------
SOURCE_DIR="${1:-$SCRIPT_DIR/cross-validation/fixtures}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: fixtures directory does not exist: $SOURCE_DIR"
  echo ""
  echo "Run 'npm run vendor-fixtures' first to fetch JetBrains fixtures."
  echo "Or provide a path:  $0 <path-to-jetbrains-fixtures-dir>"
  exit 1
fi

# --- Load excluded list ------------------------------------------------------
declare -A EXCLUDED
if [[ -f "$EXCLUDED_FILE" ]]; then
  while IFS= read -r line; do
    # Skip empty lines and comments
    line="${line%%#*}"          # strip inline comments
    line="$(echo "$line" | xargs)"  # trim whitespace
    [[ -z "$line" ]] && continue
    EXCLUDED["$line"]=1
  done < "$EXCLUDED_FILE"
  echo "Loaded ${#EXCLUDED[@]} excluded files from: $EXCLUDED_FILE"
else
  echo "Warning: no excluded.txt found at $EXCLUDED_FILE — processing all files"
fi

# --- Counters ----------------------------------------------------------------
total=0
generated=0
skipped_err=0
skipped_parse=0
skipped_excluded=0

# --- Clean output directory --------------------------------------------------
echo "Cleaning output directory: $OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/*.txt
mkdir -p "$OUTPUT_DIR"

# --- Helper: transform parse output into corpus S-expression -----------------
# 1. Convert zero-length named child nodes into (NODE_NAME\n  (MISSING _alpha_identifier))
# 2. Strip position ranges
transform_sexp() {
  local raw="$1"

  # First pass: find zero-length child nodes and mark them for MISSING injection.
  # A zero-length node looks like: (name [R, C] - [R, C]) where start == end.
  local transformed
  transformed="$(echo "$raw" | perl -pe '
    # Match indented zero-length named nodes: "  (name [R, C] - [R, C])"
    # where start position equals end position
    if (/^(\s+)\(([a-z_]+) \[(\d+), (\d+)\] - \[\3, \4\]\)(.*)$/) {
      my ($indent, $name, $rest) = ($1, $2, $5);
      my $child_indent = $indent . "  ";
      $_ = "${indent}(${name}\n${child_indent}(MISSING _alpha_identifier))${rest}\n";
    }
  ')"

  # Second pass: strip position ranges from all remaining nodes
  echo "$transformed" | sed 's/ \[[0-9]*, [0-9]*\] - \[[0-9]*, [0-9]*\]//g'
}

# --- Process each .kt file ---------------------------------------------------
for kt_file in "$SOURCE_DIR"/*.kt; do
  [[ -f "$kt_file" ]] || continue
  total=$((total + 1))

  basename_kt="$(basename "$kt_file")"
  name="${basename_kt%.kt}"

  # Skip *_ERR files
  if [[ "$name" == *_ERR ]]; then
    skipped_err=$((skipped_err + 1))
    continue
  fi

  # Skip excluded files
  if [[ -n "${EXCLUDED[$name]+x}" ]]; then
    skipped_excluded=$((skipped_excluded + 1))
    continue
  fi

  # Parse with tree-sitter
  parse_output="$(tree-sitter parse "$kt_file" 2>&1)" || true

  # Check for ERROR nodes (real parse failures — skip these).
  # Also check for MISSING keyword tokens reported in the parse summary line
  # (e.g., MISSING "val"), which indicate incomplete parses that can't be
  # automatically fixed by the zero-length node transform.
  if echo "$parse_output" | grep -qE '\(ERROR|\(MISSING "'; then
    skipped_parse=$((skipped_parse + 1))
    continue
  fi

  # Transform to corpus S-expression format (handles MISSING nodes too)
  sexp="$(transform_sexp "$parse_output")"

  # Write corpus test file
  out_file="$OUTPUT_DIR/${name}.txt"
  {
    echo "=================="
    echo "$name"
    echo "=================="
    echo ""
    cat "$kt_file"
    echo ""
    echo "---"
    echo ""
    echo "$sexp"
  } > "$out_file"

  generated=$((generated + 1))
done

# --- Summary -----------------------------------------------------------------
echo ""
echo "Done."
echo "  Files processed:          $total"
echo "  Tests generated:          $generated"
echo "  Skipped (excluded.txt):   $skipped_excluded"
echo "  Skipped (parse errors):   $skipped_parse"
echo "  Skipped (_ERR files):     $skipped_err"
