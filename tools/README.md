# Kotlin PSI tools

The gate compares the **generated native parser** with Kotlin 2.4.21 syntax PSI.
It checks fresh inputs and parser changes; ordinary corpus tests still check CST
expectations. Regenerate your grammar before checking it.

## Common jobs

Install Node 22+, a JDK 17+, git, curl, tar, Python 3 and native C/C++ build tools
(make on Linux/macOS; MSVC build tools on Windows). Set PSI_JAVA if java on PATH
is older than 17. The launcher checks these before downloading or building.
Linux is verified; the Node entry point supports macOS and Windows build setups,
but those platforms have not been tested here.

From a fresh checkout, one command checks generated snippets against the current
upstream main (fetched read-only):

    npm run psi-gate -- quick

For an existing local base, use:

    npm run psi-gate -- quick --base origin/main

Run the broader inputs and audit corpus assertions:

    npm run psi-gate -- full

Full adds the pinned Kotlin checkout, one-site mutations of its PSI-clean test
inputs, and extracted test/corpus assertions. Kotlin is fetched only for selected
repository/mutation corpora. The repository has existing PSI disagreements,
including corpus assertions: a full/conformance failure can expose an existing
issue. Inspect the named test and report; do not make it green by increasing a
count allowance. Quick is a relative grammar check; it does not audit corpus
assertions.

The launcher installs its own locked tree-sitter 0.25.1/node-gyp dependencies in
tools/psi-gate/node_modules. It never replaces the project's runtime or runs an
unpinned npx package. Jars use pinned SHA-256, HTTPS-only curl downloads, standard
or npm HTTPS proxy settings, bounded retries, and a verified shared cache under
~/.cache/kotlin-psi-oracle (PSI_ORACLE_CACHE overrides it). A fresh checkout can
reuse this cache, but every jar is verified again before launching Java.

Reports are local/psi-gate/snippets.md, corpus.md, mutations.md and kotlin.md.
Detailed, checksummed artifacts live in local/psi-gate/runs/CORPUS/CONTENT_HASH.
The working parser and base are built separately from exact source bytes. A new
input, generated parser, runtime or comparison-tool version gets a new cache;
repeated unchanged checks reuse complete results. --fresh reruns the selected
content; --home DIR selects another owned cache. Existing unmarked directories
and source directories are never recursively replaced.

Workers default to two (maximum four). Each oracle has a 1 GiB heap and a bounded
stack. --timeout-ms controls its wall timeout (default 120000). Builds, downloads
and git operations also have time limits.

### Result meaning

- PASS (per-input regression): no new or changed PSI disagreement relative to
  the same input on base. Existing differences remain visible.
- FAIL: execution did not complete, input/metadata is missing or corrupt, a corpus
  claim contradicts PSI, or a candidate has a new/changed disagreement. The first
  failing paths and corpus test names are printed. Read the report, fix the grammar
  or assertion, regenerate when needed, then rerun.
- --strict requires conformance: every A/B/C difference fails, including an
  unchanged base difference. Script-compatible .kt inputs are separately reported
  as B-script. Both parsers failing at the same offset is reported as both-error;
  earlier errors are A-prefix/B-prefix, including positions on the same line.

No execution failure or bad corpus claim can be registered as an expected result.
The gate detects errors/missing tokens via the native binding, normalized tree
shape, comment spans/declaration starts, and changed native CST signatures. Changed recovery trees also require review when both parsers reject an input. Unknown
node types fail and require an explicit mapping. This is syntax PSI, not type
checking or proof that every accepted program compiles.

## Optional reviewed snapshots

The old 385-entry regex/count ledger is removed. Normal checks measure base on
exactly the same inputs, so no project-wide open-gap registry needs upkeep.

For an offline/reference workflow, explicitly record base's observations:

    npm run psi-gate -- update-expected --corpora snippets --expected local/snippets.expected.json

Snapshots contain the input-membership/content digest, generator provenance,
comparison/oracle code identity, runtime pin, reference grammar identity, and
exact path/source/signature entries for differences. A fixed old input cannot
cancel a new bad input under the same bucket. Changing the corpus or tools makes
an old snapshot incompatible rather than silently broadening its allowances.

To use a snapshot without remeasuring a base, use the lower-level runner with
one grammar and --expect FILE. The launcher always measures base; an expectation
never overrides a regression observed against base. update-expected is an
explicit data change, not a repair for regressions. Review its diff and reference
revision before sharing it. The workflow owner maintains any snapshot they elect
to version; maintainers must review a pin/input-policy update. Snapshots stay out
of the grammar repository by default.

## Individual inputs and minimization

The runner consumes built grammar checkouts. --runtime selects the pinned gate
runtime when comparing newer grammar ABIs. --help lists all options.

    npm run psi-diff -- --corpus sample --root /path/to/inputs --grammar head=/path/to/built-head --grammar base=/path/to/built-base --runtime tools/psi-gate --out local/sample-run
    npm run psi-diff:minimize -- --run local/sample-run --label head --limit 1

The minimizer respects --label; it does not reduce a base-only bucket when head
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
explicitly. No Java or PSI tools are needed for the ordinary grammar tests.
