# Kotlin PSI gate v2

The gate checks the **current working grammar** through this repository's own
`bindings/node`, built by the normal `npm install`. Every verdict is absolute.

## Prerequisites and setup

Use Node 22+, Git, and the native toolchain the repository's npm install already
needs (Python, make on Unix and a C++ compiler). Live PSI uses a **JRE 17+**; quick
uses stored PSI expectations and needs neither Java nor network.

    npm install
    npm run psi-gate -- quick
    npm run psi-gate -- full

No separate gate runtime or per-grammar addon is installed. Rebuild the ordinary
Node binding with `npm install` after changing generated parser/scanner sources.
The ordinary install script records the source/runtime and addon SHA-256 in
`build/node-binding-source.json`; source edits force a rebuild. Missing or stale
receipts fail the gate with the setup command. After editing `grammar.js`, run
`npm run generate` then `npm install`; generation refreshes the committed
`bindings/node/generation.json` identity,
which pairs grammar.js and the exact pinned generator with all three generated
outputs. Install and gate preparation verify that identity even on first install.
Commit the identity alongside generated-source updates.
A loadable old addon alone is insufficient to pass the gate.
For fast grammar iteration, edit grammar.js, run `npm run generate`, then
`npm install` and `npm run psi-gate -- quick`. Hand edits to generated parser.c,
grammar.json or node-types.json fail the generation identity check; scanner.c
is handwritten and needs install plus Quick. Generation prints progress every 10 seconds.
Successful native builds are quiet; failures show diagnostics. Set
`PSI_GATE_VERBOSE=1` for complete generator/build output.

The project approves the exact installed tree-sitter runtime/CLI lifecycle
scripts in package.json. Plain npm install verifies the dependency audit and
builds the current binding; Quick verifies setup.
 Curl and tar are
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

`coverage --out DIR` measures the curated corpus against live PSI and records
native/PSI type and context sets. Omit --out for a temporary report directory.

`regenerate-expectations` regenerates the existing corpus's pinned PSI truth.
`minimize FILE` shrinks one PSI-valid mismatch using the current binding/live PSI,
writes a reverified source/sidecar/index to a temporary directory, and prints its
paths. `--class ID` selects a mismatch family and `--max-seconds N` bounds
reduction (default 30); partial reduction exits 2. `add FILE` re-verifies one chosen
finding before explicit corpus admission.
`fuzz` is a deterministic, budgeted search producing suspect files/sidecars in an
untracked directory; it does not decide grammar/normalizer fixes or promote cases.
These corpus/search operations are maintained by their dedicated modules.

    npm run psi-gate -- fuzz --seed trial --max-inputs 400 --max-seconds 120

Search defaults to a new OS temporary folder; `--out DIR` selects an owned,
untracked output. Stdout contains only bare suspect Kotlin file paths, suitable
for `node tools/psi-gate/main.js fuzz ... | xargs -r ls`. `index.json` records ordered
paths/sidecars, seed, budgets, completeness and pending/suppressed known cases.
Every run prints a final tried/PSI-valid/suspect count, budget stop reason, output
directory and index path on stderr, including empty and partial searches.
Preparation and ten-second progress updates also go to stderr.
`coverage.json`, referenced by the index's `coverageRef`, stores compact counts,
missing types and per-view summaries by default. Frequency/context tables are
kept in the programmatic search result rather than duplicated on disk; the index
retains only coverage summary counts.
The full pinned oracle identity is stored once in `index.json`; each sidecar's
`oracleRef: "index.json#/oracle"` refers to it. Keep the index with the sidecars.
Each sidecar contains source SHA, provenance, comparison identity,
normalized PSI/native trees and full differences. Only completed, PSI-valid,
live-reverified reductions are emitted. Exact known observations are deduped;
shared signatures merely annotate possible known matches. A failing must-match
corpus case is never treated as a known-bug waiver.

PSI syntax validity does not imply compilable or well-typed Kotlin. Minimized
sources can have unresolved names, type errors or unusual valid constructs such
as `fun()=if(flag)else 2`. Compilation and type checking are not run; sidecars
record `compilationChecked: false` and `noteRef: "index.json#/syntaxNote"`.
The explanation is stored once in the index, shared by search and minimize output.

A separate per-file follow-up decides whether a suspect is a grammar bug,
requires normalization work, should be discarded, or is fixed and worth keeping.
Failing cases stay in the bug ledger. Corpus admission requires a separate explicit
add operation. To admit a selected, fixed example:

    npm run psi-gate -- add /tmp/psi-suspects-.../suspect-....kt

`add` re-verifies current grammar/live pinned PSI, requires a full named-tree and
source-fact match, checks sidecar/source integrity, dedupes and stages the chosen
source plus stored PSI expectation. It never commits or imports a still-failing
case into quick. It prints both paths and confirms the new pair is staged. Review
it before committing. After editing the source, run `regenerate-expectations`,
review the resulting PSI-reference diff, then use the printed `git add` command
to stage both source and expectation. Staging alone does not refresh PSI truth.
An existing duplicate prints its existing paths; it adds and stages nothing and
does not give staging advice. Quick remains entirely must-match.

`minimize` writes only bare source/sidecar paths to stdout. It reports unchanged
completed results as already minimal within its reduction limits, prints the
index path, and explains the next review/fix/add step on stderr.
Exhausted time budgets consistently exit 2. If no verified reduction was saved,
the partial index has no entries and no source/sidecar is emitted; increase
`--max-seconds` and retry. Keep each index with its referenced sidecars.

## Validation

    npm run test:tools

Native/oracle integration controls require the normal built binding and fetched
pinned jars. Ordinary grammar tests use `npm test`. Git-clean external inputs,
index-only selection, pin/config corruption, incomplete oracle results and native
errors are failures. Every selected input must match current PSI truth.
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

Rebuild after every generated-parser change before regenerating corpus trees.
Review promoted :error cases and parser/scanner fingerprints. Fixture imports remain
available for ordinary grammar tests and oracle checks.

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
expression positions where applicable. Later selection favors missing/rare named types
and parent-child pairs.
Generation and mutation have separate counters, so every-third source mutation
cannot skip declaration families.

Each search writes compact `coverage.json` counts and missing types, including
generated/mutated/corpus and native-clean summaries. Its programmatic result also
retains detailed intended/observed sets, frequencies and parent contexts.
Rejected PSI inputs contribute no coverage. The full catalogue and explicitly
non-emitted entries remain available in the detailed result; applicability
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

## Environment and budgets

Progress, diagnostics and incomplete-resource remedies use stderr. Stdout contains
conformance verdicts and saved artifact paths. Full reports verdicts in configured
order and total duration on stderr. Exit 0 means complete; exit 1 is a grammar
mismatch; exit 3 is a setup/acquisition/oracle failure; exit 2 means a resource
budget stopped an incomplete
check/search/reduction. No unverified specimen is emitted on an initial timeout.

`--timeout-ms` limits live PSI requests; `--parse-timeout-ms` separately limits
each native parse (default 10000 ms, maximum 60000 ms). Coverage honors both.
`minimize --max-seconds` and `fuzz --max-seconds` bound reductions/search; after
exhaustion retry with a larger displayed budget.

- `PSI_DEBUG=1`: show stack traces for unexpected errors.
- `PSI_GATE_VERBOSE=1`: inherit full generator/build diagnostics on stderr.
- `PSI_ORACLE_CACHE`: shared SHA-verified Maven jar cache.
- `PSI_JAVA`: Java 17+ executable.
- `PSI_GATE_GIT_TIMEOUT_MS`: per Git operation timeout (default 180000 ms).
- `HTTPS_PROXY`/`https_proxy` and npm proxy settings: HTTPS transport proxy.
- `CC`, `CXX`, `CFLAGS`, `CXXFLAGS`, `CPPFLAGS`, `LDFLAGS`: ordinary build settings.

Pinned dependencies are updated with npm install --save-dev --save-exact and
verified with npm audit plus the native/oracle suite before publication.

Undici is held at the audit-clean, maintained 6.29.1 line to support the advertised
Node 22 range without the higher Node minimum of 8.x; its ProxyAgent API remains
compatible. Review its audit and supported engine range before changing that pin.

Git timeouts retain exit 2/resource context and name PSI_GATE_GIT_TIMEOUT_MS.
An incomplete cached repository with no HEAD and no indexed work is recovered by
fetch/checkout on retry. Dirty or unverifiable caches are preserved and refused,
with an exact fresh-home command; no reset or forced checkout is used.
Full prints ERROR/exit 3 for setup failures, FAIL/exit 1 for grammar mismatches, and
INCOMPLETE/exit 2 for resource expiry. CI can distinguish these outcomes directly.

## Uniform entry-point outcomes

All psi-gate commands, the psi-fuzz npm alias and direct fuzz.js entry use the
same contract: 0 completed/pass; 1 a genuine conformance or admission comparison
mismatch; 2 incomplete resource budget; 3 setup/acquisition/oracle/usage error.
Stored PSI source/oracle/normalizer identity errors are setup errors 3 everywhere,
not grammar mismatch counts. Search and minimization findings are successful
processing, not conformance verdicts; their findings do not imply exit 1.

Quick/Full/Repo print conformance verdicts on stdout; artifact commands emit
bare existing paths. Labels, details, progress, duration and remedies use stderr.
Repo prints PASS/FAIL/INCOMPLETE/ERROR and duration just like Full. Add rejects
a nonmatching native tree with mismatch 1, without changing the corpus or index.

Stdout shape is deliberate by command class. Quick, Full, Repo and
regenerate-expectations emit PASS/FAIL/INCOMPLETE/ERROR verdicts (conformance
commands also include file counts/report paths). Add, minimize, coverage and fuzz
emit bare saved artifact paths. Details, progress, timing and remedies use stderr.
A duration is printed only after valid options start a Full/Repo run.
