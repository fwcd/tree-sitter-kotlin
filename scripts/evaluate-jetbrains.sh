#!/usr/bin/env bash
# evaluate-jetbrains.sh
# Parses all 228 JetBrains .kt fixtures with tree-sitter-kotlin and
# generates a structured JSON report with per-file results.
set -euo pipefail

TREE_SITTER="/home/vmakaev/.local/share/mise/installs/node/20.20.0/bin/tree-sitter"
FIXTURES_DIR="$HOME/.nanobot/kotlin-rs/tests/fixtures/jetbrains"
REPO_DIR="$HOME/.nanobot/tree-sitter-kotlin"
SEXP_DIR="$REPO_DIR/test/jetbrains-sexp"
RESULTS_FILE="$REPO_DIR/scripts/evaluation-results.json"

# Ensure we run from inside the tree-sitter-kotlin directory
cd "$REPO_DIR"

# Create output directories
mkdir -p "$SEXP_DIR"
mkdir -p "$(dirname "$RESULTS_FILE")"

# Counters
total=0
clean=0
error_files=0
fail_files=0

# Start building JSON array of per-file results
json_entries=""

for ktfile in "$FIXTURES_DIR"/*.kt; do
    filename="$(basename "$ktfile")"
    total=$((total + 1))

    # Run tree-sitter parse, capture stdout and exit code
    sexp_output=""
    exit_code=0
    sexp_output=$("$TREE_SITTER" parse "$ktfile" 2>/dev/null) || exit_code=$?

    # Count lines of S-expression (excluding the summary/stats line at end)
    # The last line of stdout for files with errors contains the file path + timing info
    # For clean files, there is no such summary line in stdout
    sexp_lines=$(echo "$sexp_output" | wc -l)

    # Find ERROR and MISSING nodes in the S-expression output
    # Grep only lines that are part of the tree (indented with spaces and parentheses)
    error_nodes=()
    while IFS= read -r line; do
        [ -n "$line" ] && error_nodes+=("$line")
    done < <(echo "$sexp_output" | grep -E '^\s+\((ERROR|MISSING)' || true)

    error_count=${#error_nodes[@]}

    # Determine status
    if [ "$exit_code" -ne 0 ] && [ "$error_count" -eq 0 ]; then
        # Parse failed entirely (non-zero exit but no ERROR nodes found in sexp)
        status="fail"
        fail_files=$((fail_files + 1))
    elif [ "$error_count" -gt 0 ]; then
        status="error"
        error_files=$((error_files + 1))
    else
        status="clean"
        clean=$((clean + 1))
        # Save S-expression for clean files
        echo "$sexp_output" > "$SEXP_DIR/${filename%.kt}.sexp"
    fi

    # Build JSON errors array
    errors_json="["
    first=true
    for err in "${error_nodes[@]+"${error_nodes[@]}"}"; do
        # Trim leading/trailing whitespace
        err_trimmed="$(echo "$err" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')"
        # Escape for JSON
        err_escaped="$(echo "$err_trimmed" | sed 's/\\/\\\\/g; s/"/\\"/g')"
        if [ "$first" = true ]; then
            first=false
        else
            errors_json+=","
        fi
        errors_json+="\"$err_escaped\""
    done
    errors_json+="]"

    # Build per-file JSON entry
    entry="$(printf '{"file":"%s","status":"%s","error_count":%d,"errors":%s,"sexp_lines":%d}' \
        "$filename" "$status" "$error_count" "$errors_json" "$sexp_lines")"

    if [ -n "$json_entries" ]; then
        json_entries+=","
    fi
    json_entries+="$entry"

    # Progress indicator
    if [ "$status" = "clean" ]; then
        printf "  [%3d/%3d] %-50s %s\n" "$total" 228 "$filename" "CLEAN"
    else
        printf "  [%3d/%3d] %-50s %s (%d errors)\n" "$total" 228 "$filename" "$status" "$error_count"
    fi
done

# Build full JSON report
cat > "$RESULTS_FILE" <<EOF
{
  "summary": {
    "total": $total,
    "clean": $clean,
    "error": $error_files,
    "fail": $fail_files
  },
  "files": [$json_entries]
}
EOF

# Print summary
echo ""
echo "========================================="
echo "  Evaluation Summary"
echo "========================================="
echo "  Total files:  $total"
echo "  Clean:        $clean"
echo "  With errors:  $error_files"
echo "  Failed:       $fail_files"
echo "========================================="
echo ""
echo "Results saved to: $RESULTS_FILE"
echo "S-expressions saved to: $SEXP_DIR/"
