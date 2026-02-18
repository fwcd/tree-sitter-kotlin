# Tools

## JetBrains Corpus Tests

The `test/corpus/jetbrains/` directory contains tree-sitter corpus tests derived from the JetBrains Kotlin parser test fixtures. These fixtures exercise a wide range of Kotlin syntax and serve as a compatibility benchmark.

**Source:** The original `.kt` fixtures come from the [JetBrains Kotlin compiler test suite](https://github.com/ArcticLampyrid/kotlin-rs), typically found at a local checkout such as `~/.nanobot/kotlin-rs/tests/fixtures/jetbrains/`.

### vendor-jetbrains-tests.sh

This script regenerates all JetBrains corpus tests from source fixtures.

**What it does:**

1. Reads every `.kt` file in the given source directory
2. Skips `*_ERR.kt` files (intentional parse errors)
3. Parses each file with `tree-sitter parse`
4. Skips files that produce ERROR nodes or MISSING keyword tokens
5. Converts zero-length named nodes into `(MISSING _alpha_identifier)` syntax
6. Writes one corpus test file per fixture to `test/corpus/jetbrains/<Name>.txt`
7. Cleans the output directory first (idempotent)

**Usage:**

```bash
./tools/vendor-jetbrains-tests.sh <path-to-jetbrains-fixtures-dir>
```

**Example:**

```bash
./tools/vendor-jetbrains-tests.sh ~/.nanobot/kotlin-rs/tests/fixtures/jetbrains/
```

**Verify tests pass:**

```bash
tree-sitter test
```

### Updating when new JetBrains fixtures are available

1. Obtain the updated fixtures directory (e.g., pull the latest `kotlin-rs` repo)
2. Run the vendor script pointing at the new fixtures:
   ```bash
   ./tools/vendor-jetbrains-tests.sh /path/to/updated/fixtures/jetbrains/
   ```
3. Run `tree-sitter test` to verify all tests pass
4. Commit the regenerated test files

## Cross-Validation (tree-sitter vs JetBrains PSI)

The `tools/cross-validation/` directory contains a Python tool that structurally compares tree-sitter-kotlin parse trees against JetBrains PSI reference trees. This measures how closely tree-sitter-kotlin reproduces the official Kotlin parser's AST structure.

**What it does:**

1. Parses each JetBrains `.kt` fixture with `tree-sitter parse`
2. Parses the corresponding `.txt` PSI fixture (indented tree format)
3. Normalizes both trees (renames nodes, skips noise, collapses wrappers)
4. Compares the normalized trees structurally and records differences
5. Generates a Markdown report with per-file results and mismatch analysis

**Current results:** 75/118 (63.6%) structural match among clean parses.

See the full report: [tools/cross-validation/report.md](cross-validation/report.md)

**Usage:**

```bash
python tools/cross-validation/main.py <jetbrains-fixtures-dir>
```

**Debug a single file:**

```bash
python tools/cross-validation/main.py --debug BabySteps
```

**Run cross-validation tests:**

```bash
cd tools/cross-validation && python -m pytest
```
