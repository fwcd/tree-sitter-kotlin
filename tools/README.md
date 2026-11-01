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

- 399 parse-clean fixtures currently have CST expectations.
- 39 known parser failures currently use `:error` and an empty CST expectation.

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

## Live PSI oracle

The goldens cover only the pinned testData. `psi-oracle/` runs the Kotlin
2.4.21 parser itself on any `.kt`/`.kts` file, so new input — hand-written
edge cases, generated mutations, whole repositories — gets a PSI verdict too.
It needs a JDK (17 or newer), no Gradle or kotlinc:

```sh
npm run psi-oracle:fetch    # kotlin-compiler-embeddable 2.4.21 + runtime, SHA-256 pinned, into psi-oracle/lib/
npm run psi-oracle:verify   # every paired testData input, PSI-clean or not, against its golden
```

`PsiOracle.java` runs as a single-file Java program on the fetched jars. For a
file list it writes `DebugUtil.psiToString(file, true, false)` — the text the
Kotlin parsing tests compare — and an `index.jsonl` line per file with the
`PsiErrorElement` count and the first error's offset, line and message.

`vendor-fixtures.js --oracle-corpus DIR` exports all 789 paired inputs of the
pin, including the 342 the comparison fixtures leave out because their golden
holds a `PsiErrorElement`. `psi-oracle:verify` reproduces 788 of them byte for
byte. The 789th, `spec/linked/expressions/when-expression/p-6/neg/1.2`, is a
spec test marked `EXCEPTION: compiler`; upstream never compares its golden,
which is a truncated artefact, so it is reported as skipped.

## PSI differential run

`cross-validation/diff-run.js` compares tree-sitter with the oracle on any
corpus and for several grammar checkouts at once, so a branch is measured
against its base in one pass:

```sh
npm run psi-diff:mutations   # local/psi-diff/corpora/{mutations,review-329}
npm run psi-diff -- --corpus mutations --root local/psi-diff/corpora/mutations \
  --grammar head=. --grammar base=../base-checkout
npm run psi-diff:minimize -- --run local/psi-diff/runs/mutations
```

Each input gets a verdict per grammar: `A` (tree-sitter ERROR or MISSING, PSI
clean), `B` (tree-sitter clean, PSI `PsiErrorElement`), `C` (both clean,
normalized structures differ), `ok` or `both-error`. A, B and C carry a bucket
key — the first ERROR node with its parent and the PSI node at that offset, the
first PSI error with its parent and message, or the first diverging node — and
`report.md` lists each bucket's count per grammar with its smallest example.
Without `--list`, a git work tree contributes the `.kt`/`.kts` files it tracks;
`--exclude REGEX` drops paths. The run is sharded (`--shard-size`, `--jobs`)
and resumes from the shards already written under `local/psi-diff/runs/NAME`.

`minimize.js` shrinks each bucket's smallest example by deleting lines, then
tokens, while the bucket key holds; one warm oracle JVM (`PsiOracle --serve`)
answers every candidate batch. Keep run artefacts out of `build/`: node-gyp
deletes that directory on every rebuild.

## PSI gate

`psi-gate/run.sh` runs the differential where its verdicts say most: the whole Kotlin
repository at the oracle's commit (66,875 files, the `diagnostics`, `codegen/box` and spec test
data included), an IntelliJ checkout (`IDEA_ROOT`), and the generic mutations of
`psi-gate/mutate.js` over Kotlin's PSI test data: a comment between any two tokens of a line, a
line break before the tokens that decide statement termination, a Unicode suffix on every name,
and each hard keyword in place of a selector. `psi-gate/unmarked.py` leaves out files with IDE
test markup (`<caret>`, `<selection>`, highlighting tags), which Kotlin's parser reads as code.

```sh
zsh tools/psi-gate/run.sh kotlin mutations
IDEA_ROOT=~/idea zsh tools/psi-gate/run.sh idea
```

An `A` verdict on code the compiler accepts is a grammar gap. An `A` on code only PSI accepts,
and a `B`, is either fixed where that is cheap or one of the deliberate differences the pull
request lists.
