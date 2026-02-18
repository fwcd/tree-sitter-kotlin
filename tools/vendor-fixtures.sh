#!/usr/bin/env bash
#
# vendor-fixtures.sh — Fetch JetBrains Kotlin PSI test fixtures at a pinned commit.
#
# Usage:
#   ./tools/vendor-fixtures.sh              # fetch at pinned commit from .fixtures-version
#   ./tools/vendor-fixtures.sh <commit>     # fetch at specific commit (updates .fixtures-version)
#
# Downloads only compiler/testData/psi/ from the JetBrains/kotlin repo using
# sparse checkout + shallow clone. Populates tools/cross-validation/fixtures/
# with .kt and .txt file pairs.
#
# Requirements: git

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/cross-validation/fixtures"
VERSION_FILE="$SCRIPT_DIR/cross-validation/.fixtures-version"
JETBRAINS_REPO="https://github.com/JetBrains/kotlin.git"
PSI_PATH="compiler/testData/psi"

# --- Determine commit hash ---------------------------------------------------
if [[ $# -ge 1 ]]; then
  COMMIT="$1"
  echo "Using provided commit: $COMMIT"
elif [[ -f "$VERSION_FILE" ]]; then
  COMMIT="$(cat "$VERSION_FILE" | tr -d '[:space:]')"
  echo "Using pinned commit from .fixtures-version: $COMMIT"
else
  echo "Error: No commit hash provided and no .fixtures-version file found."
  echo ""
  echo "Usage:"
  echo "  $0 <commit-hash>    # first time — provide a commit"
  echo "  $0                   # subsequent — reads from .fixtures-version"
  exit 1
fi

# --- Fetch fixtures via sparse checkout --------------------------------------
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Cloning JetBrains/kotlin (sparse, depth=1) at $COMMIT..."
cd "$TEMP_DIR"
git init -q
git remote add origin "$JETBRAINS_REPO"
git sparse-checkout init --cone
git sparse-checkout set "$PSI_PATH"
git fetch --depth=1 origin "$COMMIT" -q
git checkout -q FETCH_HEAD

# Verify the directory exists
if [[ ! -d "$PSI_PATH" ]]; then
  echo "Error: $PSI_PATH not found at commit $COMMIT"
  exit 1
fi

# --- Copy fixtures ------------------------------------------------------------
echo "Copying fixtures to $FIXTURES_DIR..."
rm -rf "$FIXTURES_DIR"
mkdir -p "$FIXTURES_DIR"

# Copy only .kt and .txt files (not subdirectories)
find "$PSI_PATH" -maxdepth 1 -name '*.kt' -exec cp {} "$FIXTURES_DIR/" \;
find "$PSI_PATH" -maxdepth 1 -name '*.txt' -exec cp {} "$FIXTURES_DIR/" \;

KT_COUNT=$(ls "$FIXTURES_DIR"/*.kt 2>/dev/null | wc -l)
TXT_COUNT=$(ls "$FIXTURES_DIR"/*.txt 2>/dev/null | wc -l)

# --- Update version file -----------------------------------------------------
echo "$COMMIT" > "$VERSION_FILE"

echo ""
echo "Done."
echo "  Commit:     $COMMIT"
echo "  .kt files:  $KT_COUNT"
echo "  .txt files:  $TXT_COUNT"
echo "  Location:   $FIXTURES_DIR"
echo "  Version:    $VERSION_FILE"
