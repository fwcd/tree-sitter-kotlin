# JetBrains PSI test tools

The tools run on Node.js. The importer requires git; `--source-repo` also uses
tar to read a pinned local checkout. Install the native parser dependencies
with `npm install` before generation.

## Import and regenerate

```sh
npm run vendor-fixtures
npm run vendor-jetbrains
npm test
npm run cross-validate:test

# Optional existing JetBrains checkout containing the pinned commit.
npm run vendor-fixtures -- --source-repo /path/to/kotlin
```

`vendor-fixtures.js` reads `cross-validation/.fixtures-version`. The approved
source roots are `compiler/psi/psi-impl/testData/psi` (`.kt` and `.kts`) and
`compiler/tests-spec/testData/psi` (spec `.kt` files under a `spec/` namespace).
Each input must have a sibling file-PSI golden. Goldens containing a real
`PsiErrorElement` node are filtered before import; filenames and compiler-error
comments do not decide eligibility. Seven block/expression-fragment contexts
require separate adapters and are outside these whole-file roots.

The Kotlin 2.4.21 pin has 789 paired candidates, 342 PSI-invalid rejections and 447
PSI-clean originals. The 438 eligible inputs comprise 365 existing `.kt` files,
13 scripts and 60 linked spec files. Script extensions and all relative paths
are preserved. Spec headers use the upstream metadata filter; unsupported
preprocessing directives fail with a profile-review message.

## Explicit policy exclusions

The nine exclusions are recorded in `cross-validation/fixtures.manifest.json`
and `.import.json`, with their source/golden SHA256 and upstream paths.

| Policy | Files | Reason |
|---|---:|---|
| `multifile-file-annotation-v1` |2| FILE sections put `@file` inside a following function's PSI modifiers; splitting needs different node parents and chunk expectations. |
| `experimental-syntax-v1` |7| Two CompanionBlocksAndExtensions cases and five ContractSyntaxV2 cases are outside the supported feature set. |

The source and golden bytes are retained under
`cross-validation/fixtures/.context-exclusions/`. Multi-file records include
preamble/chunk names, half-open UTF-8 byte ranges, boundary line numbers and
hashes. Policies match full upstream paths and exact hashes; a changed input
requires a reviewed policy update. Other files with the same basename are
unaffected. Required policies, retained artifact membership and the complete
content digest are verified before corpus generation.

Schema 3 records 438 compared pairs and 447 retained PSI-positive pairs. The
content hash includes the retained exclusions and their policy metadata.
Re-importing the same pin must reproduce the manifest exactly. Existing fixture
and generated corpus trees are backed up under `build/` before replacement.

## Structural tests and known parser failures

`vendor-jetbrains-tests.js` uses the parser's native `rootNode.hasError` flag,
which also detects missing anonymous tokens absent from a printed tree. Binding
or verdict unavailability fails generation. It creates a corpus case for every
eligible fixture:

- 421 parse-clean fixtures currently have CST expectations.
- 15 known parser failures currently use `:error` and an empty CST expectation.

Both categories run under `npm test`. Known failures are never silently omitted
or marked `:skip`; a newly clean parse requires promotion to a structural test.
The committed `test/jetbrains-fixtures.json` records both ID lists, exclusions,
fixture digest and parser/scanner fingerprints. The detailed import manifest
links every input to its pinned source and golden.

After a grammar change, rebuild the binding and regenerate:

```sh
npm run generate
npm exec -- node-gyp rebuild
npm run vendor-jetbrains
npm test
```

Review changes in the original fixture, generated CST and expected-failure
list. A no-error tree alone does not establish structural agreement with PSI;
`npm run cross-validate` provides a separate normalized comparison.

## Structural cross-validation

`cross-validation/` compares the tree-sitter CST with the imported PSI goldens.
Use `npm run cross-validate:debug -- <relative-fixture-name>` to inspect one
fixture and `npm run cross-validate:test` to exercise importer/generator and
comparison helpers. Goldens, imports, exclusions and generated parser failures
are separate records; a grammar failure is not a fixture-policy exclusion.
