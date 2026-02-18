# Tools

## JetBrains Corpus Tests

The `test/corpus/jetbrains/` directory contains tree-sitter corpus tests derived from the JetBrains Kotlin parser test fixtures. These fixtures exercise a wide range of Kotlin syntax and serve as a compatibility benchmark.

**Source:** The original `.kt` fixtures come from the [JetBrains Kotlin compiler test suite](https://github.com/JetBrains/kotlin/tree/master/compiler/testData/psi). The `.kt` and `.txt` (PSI expected output) pairs are vendored in `tools/cross-validation/fixtures/`.

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

**Example (using vendored fixtures):**

```bash
./tools/vendor-jetbrains-tests.sh tools/cross-validation/fixtures/
```

**Verify tests pass:**

```bash
tree-sitter test
```

### Updating when new JetBrains fixtures are available

1. Obtain the updated fixture `.kt` and `.txt` files from the JetBrains Kotlin repo
2. Copy them into `tools/cross-validation/fixtures/`
3. Re-run the vendor script:
   ```bash
   ./tools/vendor-jetbrains-tests.sh tools/cross-validation/fixtures/
   ```
4. Run `tree-sitter test` to verify all tests pass
5. Commit the regenerated test files

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

**Fixtures:** The `.kt` source files and `.txt` PSI expected output files are vendored in `tools/cross-validation/fixtures/`. These are self-contained — no external repos needed.

**Usage:**

```bash
cd tools/cross-validation
python main.py
```

**Debug a single file:**

```bash
cd tools/cross-validation
python main.py --debug BabySteps
```

**Run cross-validation tests:**

```bash
cd tools/cross-validation && python -m pytest
```
