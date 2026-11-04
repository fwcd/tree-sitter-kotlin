# Kotlin PSI tools

The gate compares the **generated native parser** with Kotlin 2.4.21 syntax PSI.
It checks fresh inputs and parser changes; ordinary corpus tests still check CST
expectations. Regenerate your grammar before checking it.

## Common jobs

Requires Node 22+, JDK 17+, git, curl, tar, Python 3.8+ and a C++17 compiler
(GCC/Clang 8+, or MSVC 19.20+). Linux/macOS also need make. Prerequisites and
cache ownership are checked before downloading/building. Linux is verified;
macOS/Windows native builds have not been tested here.

One command from a bare checkout compares snippets against current upstream main:

    npm run psi-gate -- quick

Check a local base revision without fetching upstream:

    npm run psi-gate -- quick --base origin/main

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

PASS (per-input regression) means no new/changed discrepancy against the same
input on base. It does not claim conformance. FAIL reports new differences,
failed corpus expectations, or incomplete/invalid execution. Inspect the printed
paths, case names, report and gate.json; fix the source/expectation and rerun.

Comparison preserves named PSI structure, comments, declaration starts and native
leaf text/ranges. Lexer-hidden delimiters have explicit ownership rules; nullable
question tokens remain strictly checked. Unknown native node types require an
explicit mapping. Compact lexical fingerprints guard range changes without
serializing/hashing every CST composite and field. This is syntax/range checking,
not type checking or public CST compatibility verification.

## Optional reviewed snapshots

The old 385-entry regex/count ledger is removed. Normal checks measure base on
exactly the same inputs, so no project-wide open-gap registry needs upkeep.

For an offline/reference workflow, explicitly record base's observations:

    npm run psi-gate -- update-expected --corpora snippets --expected local/snippets.expected.json

Snapshots contain the input-membership/content digest, generator provenance,
comparison/oracle code identity, runtime source/binary and Java feature-version identity plus locale/options digest, reference grammar identity, and
exact path/source/signature entries for differences. A fixed old input cannot
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
The launcher chooses content directories automatically.

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
explicitly. For the complete failure-mode suite, prepare the native binding and oracle first:

    npm install
    npm run psi-oracle:fetch
    npm run cross-validate:test

For golden-sample integration as well, run npm run psi-oracle:verify before the
suite. Without this setup, oracle/native integration tests skip and print the
missing prerequisite. The test count therefore depends on whether those inputs
are present; a skipped failure-mode suite is not verification of the fixes.
No Java or PSI tools are needed for the ordinary grammar tests.
