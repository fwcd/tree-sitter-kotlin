# Kotlin PSI gate v2

The gate checks the **current working grammar** through this repository's own
`bindings/node`, built by the normal `npm install`. Every verdict is absolute.
There is no base revision, merge-base, ratchet or past-result allowance.

## Prerequisites and setup

Use Node 22+, Git, and the native toolchain the repository's npm install already
needs (Python, make on Unix and a C++ compiler). Live PSI uses a **JRE 17+**; quick
uses stored PSI expectations and needs neither Java nor network.

    npm install
    npm run psi-gate -- quick
    npm run psi-gate -- full

No separate gate runtime or per-grammar addon is installed. Rebuild the ordinary
Node binding after changing generated parser/scanner sources. Curl and tar are
not required. The included `tools/psi-oracle/helpers/psi-oracle-1.jar` is compiled
from the repository's `PsiOracle.java` with Java 17; normal checks invoke its class,
never the Java source launcher. Its version/SHA-256 and Kotlin jar coordinates/
SHA-256 are pinned in `psigate.toml`. Rebuilding/releasing the helper needs a JDK;
running it needs only the normal Java SE modules plus `jdk.unsupported`/`jdk.zipfs`.
Use `PSI_JAVA` to select java. Kotlin parser jars are downloaded with Node HTTPS,
bounded requests/retries and SHA checks; `HTTPS_PROXY`/npm proxy settings and a
verified `PSI_ORACLE_CACHE` are supported.

## Configuration

`psigate.toml` is the only configuration format. `--config FILE` selects another
TOML file. It has `[kotlin-psi]` with an exact version, pinned coordinate/hash
jar records and a pinned helper version/hash; each `[[repo]]` has name, URL,
full commit `rev`, includes and excludes. See the checked-in real Okio example.
Includes default to `**/*.kt` and `**/*.kts`; globs are relative POSIX repository
paths. Unknown keys, missing pins and duplicate repository/jar names fail.
There is no known-failures table, content manifest or separate config lockfile.

The initial Okio pin is `1926f022425ccd85ee558c558f0a5b7b24826a57`. Production
source sets are included; two present grammar differences are named exclusions
with comments. Exclusions always pass. Full can print an informational notice
when an excluded file now matches; that notice never makes the gate fail.

## Commands

`quick` checks one curated, indexed corpus of must-match snippets against stored
PSI expectations. It reads current working-tree bytes, with no clean requirement
for this repository. A new snippet participates once staged with `git add`.
Failing grammar cases belong in the grammar-bug ledger, outside quick.

`full` starts quick and configured repository fetches concurrently. Repository
caches use exact Git commit pins; warm verified caches are reused. Every external
repository must have the configured HEAD and no modified/staged tracked files;
a failure lists those files. Inputs come only from `git ls-files`, then configured
includes/excludes. Untracked files are ignored. Selected inputs are compared to
live PSI with the current Node binding; mismatch file counts have target zero.

    npm run psi-gate -- repo /path/to/checkout

`repo DIR` uses the same external clean/index-only policy at its current HEAD.
It does not require a configured URL/revision. Source repositories are not reset
or rewritten. `--home DIR` selects an owned cache/result directory (default
`local/psi-gate`); `--jobs`, `--timeout-ms` and `--parse-timeout-ms` bound execution.

`regenerate-expectations` regenerates the existing corpus's pinned PSI truth.
`add FILE` re-verifies one chosen finding before explicit corpus admission.
`fuzz` is a deterministic, budgeted search producing suspect files/sidecars in an
untracked directory; it does not decide grammar/normalizer fixes or promote cases.
These corpus/search operations are maintained by their dedicated modules.

    npm run psi-gate -- fuzz --seed trial --max-inputs 400 --max-seconds 120

Search defaults to a new OS temporary folder; `--out DIR` selects an owned,
untracked output. Stdout lists suspect Kotlin paths. `index.json` records ordered
paths/sidecars, seed, budgets, completeness and pending/suppressed known cases.
Each sidecar contains source SHA, provenance, pinned oracle/comparison identity,
normalized PSI/native trees and full differences. Only completed, PSI-valid,
live-reverified reductions are emitted. Exact known observations are deduped;
shared signatures merely annotate possible known matches. A failing must-match
corpus case is never treated as a known-bug waiver.

A separate per-file follow-up decides whether a suspect is a grammar bug,
requires normalization work, should be discarded, or is fixed and worth keeping.
Failing cases stay in the bug ledger. There is no `--promote` or automatic corpus
production. To admit a selected, fixed example:

    npm run psi-gate -- add /tmp/psi-suspects-.../suspect-....kt

`add` re-verifies current grammar/live pinned PSI, requires a full named-tree and
source-fact match, checks sidecar/source integrity, dedupes and stages the chosen
source plus stored PSI expectation. It never commits or imports a still-failing
case into quick. Quick remains entirely must-match.

## Validation

    npm run cross-validate:test

Native/oracle integration controls require the normal built binding and fetched
pinned jars. Ordinary grammar tests use `npm test`. Git-clean external inputs,
index-only selection, pin/config corruption, incomplete oracle results and native
errors are failures. There is no relative headline or `update-expected` command.
Stored expectations are PSI truth, never snapshots of the current tree-sitter output.

## Fixture import and oracle verification

The importer pins cross-validation/.fixtures-version. It preserves .kt/.kts paths
from compiler/psi/psi-impl/testData/psi and linked spec inputs. At the current pin:
789 paired candidates, 342 PSI-invalid goldens, 447 retained positive pairs;
436 eligible comparisons and 11 hash-scoped context exclusions. Unsupported
fragment/multi-file/experimental contexts are not silently treated as whole files.
The detailed manifests are authoritative when refreshing this pin.

    npm install
    npm run vendor-fixtures
    npm exec -- node-gyp rebuild
    npm run vendor-jetbrains
    npm test
    npm run cross-validate

Rebuild after every generated-parser change before regenerating corpus trees.
Review promoted :error cases and parser/scanner fingerprints. Cross-validation
is the existing static fixture report; its match percentage is not the new gate.

Verify the live oracle against all positive and negative upstream goldens:

    npm run psi-oracle:fetch
    npm run psi-oracle:verify

The oracle reproduces 788 comparable goldens exactly; one upstream spec EXCEPTION
golden is intentionally excluded. The verification and mutation inputs are pinned
to Kotlin 2.4.21. Full runs should be accompanied by this oracle check when changing
its implementation or fixture/compiler pin.


### Tracked grammar counterexamples

`tools/psi-gate/grammar-bugs` contains curated catalog cases and minimized fuzz
cases, with source/expectation hashes, failure signatures, first seeds and
provenance. Compact `.expected.json` PSI shapes are authoritative; full dumps are
regenerated from the pinned Kotlin 2.4.21 oracle. Catalog `.psi.txt` sidecars remain
readable. Original whole-source inputs/dumps belong in research run artifacts.
Detailed affected-file measurements are archived at the immutable commit named
in the catalog ledger; the shipped ledger retains counts and causal descriptions.
The archive remains in the `VladimirMakaev/tree-sitter-kotlin` fork's
`psi-gate-improved` history after an upstream squash-merge, which does not retain
the original commits. Fetch the recorded revision from that fork and read the
recorded path with `git show REVISION:PATH`; verify its recorded SHA-256. The
[current archive](https://github.com/VladimirMakaev/tree-sitter-kotlin/blob/cff4a71d8282d40da840888853e6a30e93d1b1c2/tools/psi-gate/grammar-bugs/catalog-ledger.json)
is available independently of the upstream squash commit. Retain the fork history
for as long as those detailed measurements are needed.

The synthetic cases are part of this MIT-licensed grammar project. Derived
counterexamples use the Apache-2.0 Kotlin, Okio, Exposed, Ktor and kotlinx.coroutines
sources identified by repository, commit and relative path in the ledgers; the
Kotlin production-source pin is distinct from the JetBrains fixture-import pin.
Refer to those upstream licenses and original pinned sources for provenance.
The historical mixed-run entries now retain their recovered mutation seed, index,
operator and original source pin; reductions keep those original provenance fields.


### Grammar-driven generation and coverage

Generation reads `src/grammar.json` and `src/node-types.json`. Grammar combinators
supply operator, argument and expression productions; Kotlin context rules supply
declaration boundaries, valid annotation/type positions and lexical spellings.
The initial cycle covers every declaration/production family, using eight
expression positions where applicable. Later selection favors missing/rare named types and parent-child pairs.
Generation and mutation have separate counters, so every-third source mutation
cannot skip declaration families.

Each run writes `coverage.json` alongside clusters: intended and observed type/context
sets, per-file frequencies, generated/mutated/corpus partitions, native parent
contexts and a native-clean alternative. Rejected PSI inputs contribute no coverage.
The full catalogue and explicitly non-emitted entries remain visible; applicability
never changes because a run failed to hit a type. The pinned file PSI exposes
`kotlin.FILE` instead of its parser wrapper. Lexer recovery/reserved spellings and
one KDoc highlighting token are documented in `fuzz-psi-types.json` with reasons.
These are catalogue distinctions, not exclusions of valid corpus files.

The generator includes ordinary headers, grouped/file annotations, explicit backing
fields, named destructuring, guarded when entries, callable references, floating
literals, scripts and KDoc, plus syntax accepted by the pinned parser such as
contract-v2 and companion blocks. The live PSI-valid filter is authoritative;
syntax acceptance still does not imply successful type checking. Existing normalizer
cluster formats and local defect ledgers are unchanged. Intrinsic roots/directives
and some leaf types have only one legal direct parent; observed context sets show
that limitation rather than inventing additional contexts. Full type coverage alone
does not prove all combinations or grammar-wide normalizer correctness.
