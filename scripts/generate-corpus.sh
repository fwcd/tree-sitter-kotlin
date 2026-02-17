#!/usr/bin/env bash
# Generate tree-sitter corpus test files from clean JetBrains .kt files
# Reads evaluation-results.json to find clean files, then creates
# corpus test entries from the .kt source and .sexp parse trees.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

EVAL_JSON="$PROJECT_DIR/scripts/evaluation-results.json"
KT_DIR="$HOME/.nanobot/kotlin-rs/tests/fixtures/jetbrains"
SEXP_DIR="$PROJECT_DIR/test/jetbrains-sexp"
CORPUS_DIR="$PROJECT_DIR/test/corpus/jetbrains"

# Create output directory
mkdir -p "$CORPUS_DIR"

# Remove any previously generated files
rm -f "$CORPUS_DIR"/*.txt

# Get list of clean files from evaluation-results.json
# Uses python3 for JSON parsing
clean_files=$(python3 -c "
import json, sys
with open('$EVAL_JSON') as f:
    data = json.load(f)
for entry in data['files']:
    if entry['status'] == 'clean':
        print(entry['file'])
")

# Sort files alphabetically
clean_files=$(echo "$clean_files" | sort)

# Group files by first character (lowercase) for output file naming
declare -A group_files
declare -A group_count

while IFS= read -r filename; do
    # Get first character, lowercase
    first_char=$(echo "${filename:0:1}" | tr '[:upper:]' '[:lower:]')
    if [[ -z "${group_files[$first_char]+x}" ]]; then
        group_files[$first_char]=""
        group_count[$first_char]=0
    fi
    group_files[$first_char]+="$filename"$'\n'
    group_count[$first_char]=$(( ${group_count[$first_char]} + 1 ))
done <<< "$clean_files"

total_tests=0
total_corpus_files=0

# For each group, write corpus file(s)
for letter in $(echo "${!group_files[@]}" | tr ' ' '\n' | sort); do
    files="${group_files[$letter]}"
    count="${group_count[$letter]}"

    # Split into chunks of max 20 tests per file
    chunk=0
    chunk_count=0
    chunk_content=""

    while IFS= read -r filename; do
        [[ -z "$filename" ]] && continue

        basename="${filename%.kt}"
        kt_file="$KT_DIR/$filename"
        sexp_file="$SEXP_DIR/${basename}.sexp"

        # Check both files exist
        if [[ ! -f "$kt_file" ]]; then
            echo "WARNING: Missing .kt file: $kt_file" >&2
            continue
        fi
        if [[ ! -f "$sexp_file" ]]; then
            echo "WARNING: Missing .sexp file: $sexp_file" >&2
            continue
        fi

        # Read source code
        source_code=$(cat "$kt_file")

        # Read sexp and strip position annotations [N, N] - [N, N]
        sexp=$(sed 's/ \[[0-9]\+, [0-9]\+\] - \[[0-9]\+, [0-9]\+\]//g' "$sexp_file")

        # Skip files with MISSING nodes (parser produces these for error recovery,
        # but tree-sitter test treats them as failures)
        if echo "$sexp" | grep -q 'MISSING'; then
            echo "SKIPPING: $filename has MISSING nodes in parse tree" >&2
            continue
        fi

        # Build test entry
        entry="==================
${basename}
==================

${source_code}

---

${sexp}
"
        if [[ -n "$chunk_content" ]]; then
            chunk_content+="
$entry"
        else
            chunk_content="$entry"
        fi

        chunk_count=$((chunk_count + 1))
        total_tests=$((total_tests + 1))

        # If chunk is full, write it and start a new one
        if [[ $chunk_count -ge 20 ]]; then
            if [[ $chunk -eq 0 ]]; then
                outfile="$CORPUS_DIR/${letter}.txt"
            else
                outfile="$CORPUS_DIR/${letter}_$((chunk + 1)).txt"
            fi
            echo "$chunk_content" > "$outfile"
            echo "Created $outfile ($chunk_count tests)"
            total_corpus_files=$((total_corpus_files + 1))
            chunk=$((chunk + 1))
            chunk_count=0
            chunk_content=""
        fi
    done <<< "$files"

    # Write remaining tests in this group
    if [[ $chunk_count -gt 0 ]]; then
        if [[ $chunk -eq 0 ]]; then
            outfile="$CORPUS_DIR/${letter}.txt"
        else
            outfile="$CORPUS_DIR/${letter}_$((chunk + 1)).txt"
        fi
        echo "$chunk_content" > "$outfile"
        echo "Created $outfile ($chunk_count tests)"
        total_corpus_files=$((total_corpus_files + 1))
    fi
done

echo ""
echo "Done! Generated $total_corpus_files corpus file(s) with $total_tests total tests."
