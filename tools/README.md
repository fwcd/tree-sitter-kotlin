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

## Validation

    npm run cross-validate:test

Native/oracle integration controls require the normal built binding and fetched
pinned jars. Ordinary grammar tests use `npm test`. Git-clean external inputs,
index-only selection, pin/config corruption, incomplete oracle results and native
errors are failures. There is no relative headline or `update-expected` command.
Stored expectations are PSI truth, never snapshots of the current tree-sitter output.
