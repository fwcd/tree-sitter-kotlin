# Kotlin PSI tools

The gate compares the **generated native parser** with Kotlin 2.4.21 syntax PSI.
It checks fresh inputs and parser changes; ordinary corpus tests still check CST
expectations. Regenerate your grammar before checking it.

## Common jobs

Requires Node 22+, JDK 17+, git, curl, tar, Python 3.8+ and a C++17 compiler
(GCC/Clang 8+, or MSVC 19.20+). Linux/macOS also need make. Prerequisites and
cache ownership are checked before downloading/building. Linux is verified;
macOS/Windows native builds have not been tested here.

One command from a bare checkout compares snippets against the common ancestor
of HEAD and the upstream branch:

    npm run psi-gate -- quick

The default uses Git's merge-base, so upstream-only commits after the branch
point are excluded from the contributor's change. The tool prints the selected
commit and reason. It prefers a configured upstream/origin remote whose URL
points to the canonical repository. If none exists, the documented fallback is
https://github.com/fwcd/tree-sitter-kotlin.git, branch main. A configured remote's
HEAD supplies its default branch when available.

Override the upstream remote/URL and branch through flags or environment:

    npm run psi-gate -- quick --upstream upstream --upstream-branch main
    PSI_GATE_UPSTREAM=https://github.com/OWNER/REPO.git PSI_GATE_UPSTREAM_BRANCH=main npm run psi-gate -- quick

Fetches write FETCH_HEAD and needed objects, with no tags or tracking-ref updates.
Shallow checkouts deepen in bounded steps until the common ancestor is proven;
remaining incomplete/unrelated history fails with an explicit-base remedy.
Offline or network/configuration failure also suggests --base REV.

Check a local base revision without fetching upstream:

    npm run psi-gate -- quick --base origin/main

Check any local Git checkout's tracked Kotlin sources with automatic grammar builds:

    npm run psi-gate -- repo /path/to/Exposed

The command uses the same upstream merge-base and accepts --base/--upstream,
--strict, --home and worker/time budgets. Input repositories must have a commit,
no tracked changes and no untracked Kotlin files. Clone a Git URL first, check out
the desired commit, then supply its folder. No input-repository file is modified.

The existing IDE-markup filter selects .kt/.kts inputs. Exact source bytes are
snapshotted into the owned cache; the report and meta.json record the checked
repository commit, input content SHA-256 and filter counts. Ordinary repository
cases.json files are not treated as grammar assertions. Detailed run reports
support psi-diff:minimize even after the original checkout moves or changes.
Successful summaries use local/psi-gate/repo.md; failed runs preserve the last
success and use repo.failed.md. Source and --home must be separate directories.

Run all four reproducible corpora, including base-relative corpus expectations:

    npm run psi-gate -- full

Full adds Kotlin at its pinned revision, single-site mutations, and test/corpus
expectations. :error and expected ERROR/MISSING nodes describe tree-sitter's
expected CST. Generated JetBrains inputs remain PSI-positive even when the grammar
rejects them. Existing exact-base discrepancies are listed separately; new or
changed discrepancies fail. --strict audits all differences, including old ones.

The gate installs a separate locked runtime in tools/psi-gate/node_modules. It
never replaces project dependencies. Maven jars use HTTPS-only proxy-aware
bounded downloads and a digest-verified cache (~/.cache/kotlin-psi-oracle or
PSI_ORACLE_CACHE). Every oracle launch rechecks its pinned jar hashes.

Successful reports are local/psi-gate/CORPUS.md. Complete failed runs go to
CORPUS.failed.md, preserving the successful report. Detailed/checksummed results
are under local/psi-gate/runs/CORPUS/CONTENT_HASH. New input, tool, runtime or
parser bytes select new results; --fresh reruns the current content. --home DIR
selects another marked cache. Source and unowned directories are never replaced.

An exclusive home lock rejects concurrent work. A dead owner's lock is reclaimed
after checking its PID; a live or uninspectable owner remains protected. Workers
default to two (maximum four). Oracle heap/stack, downloads, builds, workers and
native parsing have bounded budgets. Native per-file parsing defaults to 10s
(--parse-timeout-ms up to 60s); interrupted parsers are reset. --timeout-ms sets
the oracle deadline (default 120000ms).

### Result meaning

The headline is mismatching file counts by production/tests/testData/support
partition: base→head, fixed, newly worse, changed, and excluded files (target 0).
PASS in regression mode means no new/changed discrepancy against base; --strict
requires every selected file to match PSI cleanly. FAIL reports new differences,
failed corpus expectations, or incomplete/invalid execution. Inspect the printed
paths, case names, report and gate.json; fix the source/expectation and rerun.

A full match is `ok` with no native or original-file PSI errors. `both-error` and
script-only acceptance remain mismatches, so deliberately negative testData never
counts as clean conformance. Execution failures are shown separately and earn no
fixed/worse credit. Changed existing mismatches retain the conservative ratchet
and require inspection; they are not automatically labeled improvements.

`conformance.json` records partition counts/verdicts/deltas, grammar commits/content
hashes, tool hash and exact input digest for comparison across runs. Partitions are path/source-set
rules, including generated/mutant views; review them when choosing a strict
corpus. No blended percentage is presented.

Comparison preserves named PSI structure, comments, declaration starts and native
leaf text/ranges. Lexer-hidden delimiters have explicit ownership rules; nullable
question tokens remain strictly checked. Unknown native node types require an
explicit mapping. Each input's compact identity covers the complete normalized
named trees and every structural, comment, declaration-start and token-span
discrepancy, on clean and recovery paths. Native leaf/comment ranges and recovery
ERROR/MISSING topology remain checked. The first bucket key is a report label;
an unchanged first discrepancy cannot hide a later changed comparison.
Composite text and fields are not serialized. This is syntax/range checking,
not type checking or public CST compatibility verification.

## Optional reviewed snapshots

The old 385-entry regex/count ledger is removed. Normal checks measure base on
exactly the same inputs, so no project-wide open-gap registry needs upkeep.

For an offline/reference workflow, explicitly record base's observations:

    npm run psi-gate -- update-expected --corpora snippets --expected local/snippets.expected.json

Snapshots contain the input-membership/content digest, generator provenance,
comparison/oracle code identity, runtime source/binary and Java feature-version identity plus locale/options digest, reference grammar identity, and
one compact path/source/verdict/key/fingerprint observation per input (schema 2).
Difference allowances are derived from those observations; schema 1 snapshots
require an explicit reviewed update. A fixed old input cannot
cancel a new bad input under the same bucket. Changing the corpus or tools makes
an old snapshot incompatible rather than silently broadening its allowances.

To use a snapshot without remeasuring a base, use the lower-level runner with
one grammar and --expect FILE. The launcher always measures base and rejects --expected on quick/full. Use the
direct runner with --expect and no base for snapshot checking. update-expected is an
explicit data change, not a repair for regressions. Review its diff and reference
revision before sharing it. The workflow owner maintains any snapshot they elect
to version; maintainers must review a pin/input-policy update. Snapshots stay out
of the grammar repository by default.

## Individual inputs and minimization

The runner consumes built grammar checkouts. --runtime selects the pinned gate
runtime when comparing newer grammar ABIs. --help lists all options.

    npm run psi-diff -- --corpus sample --root /path/to/inputs --grammar head=/path/to/built-head --grammar base=/path/to/built-base --runtime tools/psi-gate --out local/sample-run
    npm run psi-diff:minimize -- --run local/sample-run --label head --limit 1

The minimizer selects exact per-label failing witnesses from complete shard
records and gate.json, not the five-example report sample. --failing restricts it
to those witnesses, and --limit bounds reductions. It respects --label; it does not reduce a base-only bucket when head
was requested. Use the exact printed run directory (default direct-run output:
local/psi-diff/NAME). Explicit --out reuse requires unchanged content, complete
shards and valid checksums; --fresh safely replaces only marked generated output.
The launcher chooses content directories automatically. Minimization checks live
input inventory, grammar source/binary, runtime and tool identity against the run
before loading any cached minimum. It rechecks both the original witness and
cached snippet; after changing inputs or rebuilding a grammar, rerun the gate.

An optional IntelliJ corpus requires an exact clean revision, not an ambient,
unpinned checkout:

    IDEA_ROOT=/path/to/idea IDEA_REV=FULL_40_CHARACTER_COMMIT npm run psi-gate -- full --corpora idea

The textual markup filter excludes IDE/diagnostics markup and foreign-language
FILE sections; it is conservative and can exclude otherwise legitimate literals.

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

## Tests

    npm run cross-validate:test

The tools tests cover count swaps, stale input reuse, incomplete/corrupt shards,
worker/oracle failures and timeouts, corpus claims, digest mismatch, path escapes,
cleanup refusal and unknown nodes. Actual oracle integration tests require the
fetched jars and built native binding; unavailable integration tests are skipped
explicitly. Variant builds resolve node-addon-api and node-gyp-build from the
project's installed dependencies; a previous psi-gate run is not required. Their
shared prerequisite resolver supplies both the availability guard and builder.
For the complete failure-mode suite, use Node, a JDK 17+ and native build tools,
then prepare the native binding and oracle:

    npm install
    npm run psi-oracle:fetch
    npm run cross-validate:test

For golden-sample integration as well, run npm run psi-oracle:verify before the
suite. Without this setup, oracle/native integration tests skip and print the
missing prerequisite. The test count therefore depends on whether those inputs
are present; a skipped failure-mode suite is not verification of the fixes.
No Java or PSI tools are needed for the ordinary grammar tests.

## Continuous PSI-valid differential fuzzing

Prepare the pinned runtime and the proven upstream merge-base grammar, then run
deterministic generated inputs (single-branch clones work without origin/main):

    npm run psi-fuzz -- --seed example --max-inputs 1000

The default uses the same configurable upstream resolver as psi-gate. `--base REV`
is an explicit local/offline pin; `--base HEAD` checks the current committed
grammar. Missing explicit refs are named in the error.

Add a pinned real-code checkout and an exact production-file list, or a research
seed manifest. Every original and single-site mutant is checked by the live PSI
oracle; inputs with PSI errors are discarded before comparison.

    npm run psi-fuzz -- --corpus /path/to/okio --list /path/to/production.list --seed example --max-inputs 2000
    npm run psi-fuzz -- --sources /path/to/fuzzer-seeds.json --fixtures /path/to/kotlin/compiler/psi/psi-impl/testData/psi --seed example --max-inputs 2000

The generator combines classes, constructors, delegation, enum/sealed/value
classes, generics/function types, context/suspend functions, annotations,
accessors, references, strings/interpolation, operators, labels, loops,
destructuring and contracts with recursive expressions and unusual trivia.
Acceptance is syntactic PSI acceptance; it does not assert type checking.

    npm run psi-fuzz -- --continuous --seed example --depth 6 --jobs 2 --stable-window 5000 --max-seconds 3600

Continuous runs checkpoint counts and verified representatives as they go.
Stopping by stability requires 5,000 consecutive PSI-valid inputs with no
unresolved normalized mismatch and only already-recorded grammar counterexamples.
An explicit --max-inputs is honored in continuous mode; otherwise its input count
is unlimited. One sampling deadline includes ledger validation, oracle/native
inspection and all reductions. Runtime download/grammar preparation precedes that
budget. No new inspection or reduction starts after expiry. Input/time budgets stop bounded experiments; budget exhaustion is not normalizer
completion. Time expiry or pending/bounded reductions produce exit 2 and a partial result,
including expiry before any input is accepted. Oracle,
harness, corrupt-ledger and changed-comparison failures produce exit 1.

`local/psi-fuzz/report.md` ranks per-file diagnostic families and shows one
PSI-valid, reverified reduced example per family. `buckets.json` also records the
complete expected/actual normalized shapes and native CST; `progress.json` is the
partial checkpoint. Child-count families use direction rather than incidental
absolute counts, and comparison paths identify the structural position.
Reductions are bounded, preserving comments/literals as lexical units.

Clean named mismatches are labeled **normalization-or-AST** for the fix loop;
they are not assumed to be grammar bugs. Confirmed PSI-clean native syntax
rejections and empty QUEST spans are saved by default in the untracked
`local/psi-fuzz-bugs` ledger. Inspect the run and rerun with `--promote` to save
completed, verified reductions of at most 1000 bytes in the tracked corpus.
`--bugs DIR` selects another local ledger; writing the tracked directory requires
explicit promotion. `timeBoundReached` records unfinished reductions (null means
unknown for inherited cases). A completed bounded reduction is not a claim of a
global minimum. Control-character inputs are JSON strings with a recorded Kotlin
extension, decoded before parsing; no literal NUL bytes are shipped.

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

Existing ledger expectations are reverified on later runs against that ledger;
confirmed cases remain evidence after a grammar fix. Rerun the same seed after a
normalizer/mapping change; comparison identities prevent stale reuse.

Use `--help` for budgets and alternate owned output/ledger directories. Run output
and input roots must be separate. No grammar rule is changed by the fuzz harness.


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


### Upstream history timeouts

Both `psi-gate` and `psi-fuzz` accept `--git-timeout-ms N` (1..3600000), or
`PSI_GATE_GIT_TIMEOUT_MS`; the flag takes precedence and the default is 180000ms
per Git call. This budget is separate from the oracle and fuzz sampling budgets.

When a shallow fork has the upstream tip object, base resolution first tries a
date-bounded fork fetch just before that tip's commit date. It accepts the result
only after the same ancestor/frontier proof; backdated histories or unsupported
server date queries fall back to the depth progression.

When ancestry is missing, base resolution starts with small history windows
(depth 1,8,32,128,512,2048,4096). It reuses complete local ancestry and does not
shorten a complete upstream chain. A timed-out fetch step is reported and the
bounded progression continues; a successful later step still must prove the
merge-base and shallow-frontier conditions. FETCH_HEAD-only fetches leave
tracking refs and tags unchanged. Exhausted timeouts identify the upstream,
history role, depth and elapsed time, rather than describing a timeout as a
connectivity error.

For a slow server, raise the per-call budget or select another upstream; an
explicit local revision avoids the fetch:

    npm run psi-gate -- quick --git-timeout-ms 600000
    PSI_GATE_GIT_TIMEOUT_MS=600000 npm run psi-fuzz -- --seed example --max-inputs 1000
    npm run psi-gate -- quick --base EXISTING_LOCAL_REV
