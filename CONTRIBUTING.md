# Contributing to tree-sitter-kotlin

## Development Setup

```bash
npm install
```

## Key Files

| File | Description |
| ---- | ----------- |
| `grammar.js` | The grammar definition — edit this to change parsing rules |
| `src/scanner.c` | External scanner for ASI, strings, comments, and context-sensitive tokens |
| `src/parser.c` | Generated parser (~33 MB) — do **not** edit manually |
| `test/corpus/*.txt` | Test cases in tree-sitter corpus format |
| `queries/highlights.scm` | Syntax highlighting queries |
| `queries/tags.scm` | Code navigation tags |

## Making Grammar Changes

1. Edit `grammar.js` (and/or `src/scanner.c` for lexer-level changes)
2. Regenerate the parser:
   ```bash
   npm run generate
   ```
3. Run the tests:
   ```bash
   npm test
   ```
4. Commit **all** changed files in `src/` along with your grammar changes

## Parser Verification CI Check

The CI build regenerates the parser and verifies that the output matches what is committed in `src/`. If the diff is non-empty, the build fails.

**Important:** The output of `tree-sitter generate` is only deterministic on the same platform. Since CI runs on **x86_64 Linux** (Ubuntu), you must regenerate the parser from that same platform. Options:

- Use an x86_64 Linux machine or VM
- Use Docker: `docker run --rm -v $(pwd):/work -w /work node:18 bash -c "npm install && npm run generate"`
- Use the **Regenerate Parser** workflow: go to Actions > Regenerate Parser > Run workflow on your fork's branch. This runs `tree-sitter generate` on the CI runner and commits the result.

## Parser Size Limit

CI enforces a maximum parser size of **35 MiB** for `src/parser.c`. If your grammar changes cause the parser to exceed this, you may need to simplify or restructure the rules.

## Test Format

Tests use tree-sitter's corpus format:

```
================================================================================
Test Name
================================================================================

kotlin source code here

--------------------------------------------------------------------------------

(source_file
  (expected_parse_tree))
```

Place test files in `test/corpus/`. Each file can contain multiple test cases.

## Useful Commands

```bash
# Parse a specific file
npx tree-sitter parse path/to/file.kt

# Parse with XML output (shows all node details)
npx tree-sitter parse path/to/file.kt --xml

# Run tags extraction
npx tree-sitter tags path/to/file.kt

# Build native Node.js binding (needed for `tree-sitter parse`)
npx node-gyp rebuild

# Check compiled parser size
cc -O2 -I src -std=c11 -c src/parser.c -o /tmp/parser.o && wc -c /tmp/parser.o
```
