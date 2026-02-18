# Tools

All tools are written in Node.js — no Python, bash, or platform-specific dependencies. Works on Windows, macOS, and Linux.

## Quick Start

```bash
# Install dependencies (includes vitest for unit tests)
npm install

# Fetch JetBrains fixtures (one-time setup)
npm run vendor-fixtures

# Generate corpus tests from fixtures
npm run vendor-jetbrains

# Run all tree-sitter tests (includes JetBrains corpus)
npm test

# Run structural cross-validation
npm run cross-validate

# Run cross-validation unit tests
npm run cross-validate:test
```

## vendor-fixtures.js

Fetches JetBrains Kotlin PSI test fixtures at a pinned commit hash via sparse checkout.

**What it does:**

1. Reads the pinned commit from `cross-validation/.fixtures-version`
2. Sparse-clones `compiler/testData/psi/` from JetBrains/kotlin at that commit
3. Copies `.kt` and `.txt` files into `cross-validation/fixtures/`
4. Updates `.fixtures-version` if a new commit was provided

**Usage:**

```bash
# Fetch at pinned commit (from .fixtures-version)
npm run vendor-fixtures

# Fetch at a specific commit (updates .fixtures-version)
npm run vendor-fixtures -- <commit-hash>
```

Fixtures are **not checked into git** — they're fetched on demand. The `.fixtures-version` file is tracked so builds are reproducible.

## vendor-jetbrains-tests.js

Generates tree-sitter corpus tests from vendored JetBrains fixtures.

**What it does:**

1. Reads every `.kt` file in `cross-validation/fixtures/`
2. Skips `*_ERR.kt` files (intentional parse errors)
3. Skips files listed in `cross-validation/excluded.txt`
4. Parses each file with `tree-sitter parse`
5. Skips files that produce ERROR nodes or MISSING keyword tokens
6. Converts zero-length named nodes into `(MISSING _alpha_identifier)` syntax
7. Writes one corpus test file per fixture to `test/corpus/jetbrains/<Name>.txt`

**Usage:**

```bash
# Uses default fixtures path (tools/cross-validation/fixtures/)
npm run vendor-jetbrains

# Pass custom fixtures path via environment variable
FIXTURES_PATH=/path/to/fixtures npm run vendor-jetbrains
```

**Requires:** `tree-sitter` CLI (installed via `npm install`)

## Cross-Validation

The `cross-validation/` directory contains a Node.js tool that structurally compares tree-sitter-kotlin parse trees against JetBrains PSI reference trees.

**What it does:**

1. Parses each JetBrains `.kt` fixture with `tree-sitter parse`
2. Parses the corresponding `.txt` PSI fixture (indented tree format)
3. Normalizes both trees (110+ node type mappings, noise skipping, wrapper collapsing)
4. Compares the normalized trees structurally and records differences
5. Generates a Markdown report with per-file results and mismatch analysis

**Current results:** 74/121 (61.2%) structural match among clean parses.

**Usage:**

```bash
# Full validation
npm run cross-validate

# Debug a single fixture
npm run cross-validate:debug -- BabySteps

# Run unit tests (vitest)
npm run cross-validate:test
```

### Key Files

| File | Description |
| ---- | ----------- |
| `.fixtures-version` | Pinned JetBrains/kotlin commit hash |
| `excluded.txt` | Files excluded from corpus (grammar issues or wrong AST) |
| `TODO.md` | Categorized grammar issues ranked by difficulty |
| `report.md` | Latest cross-validation report |
| `main.js` | CLI entry point |
| `normalizer.js` | Tree normalization (node type mapping, noise removal) |
| `comparator.js` | Structural tree comparison |
| `parser-ts.js` | tree-sitter S-expression parser |
| `parser-psi.js` | JetBrains PSI indented tree parser |
| `mapping.js` | 110+ node type mappings (tree-sitter → JetBrains PSI) |
| `models.js` | Shared tree node model |
| `runner.js` | Test runner orchestration |
| `report.js` | Markdown report generator |
| `vitest.config.js` | Test configuration (at project root) |
