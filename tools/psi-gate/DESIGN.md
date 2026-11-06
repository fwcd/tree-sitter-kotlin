# PSI gate v2 — proposal for owner approval

**Design only; no implementation authorized yet.** Supersedes v1's base/relative workflow.
The current checkout, including uncommitted grammar edits, is the sole parser under test.
Retain reviewed N1–N42, including native IF field/empty-slot ownership at `75dfaa2`, and its
positive/negative controls. Full match remains exact normalized tree/payload plus comment,
declaration and significant-token facts; errors, timeouts and incomplete gate runs fail.
Catalogue changes require semantic witnesses, positive/genuine-negative controls and both-family review;
making a file pass alone never justifies normalization. Keep catalogue identity in results/expectations.

## 1. Backend and prerequisites

**Recommend native initially, subject to owner choice (Q1).** Node 22 plus the native binding's
usual build tools: Python, make on Unix, C++17. These only serve node-gyp/binding.gyp and are
the **same toolchain this repository's `npm install` already requires**, not extra PSI requirements.
Regenerate/build the current parser with the repo's generator; reject stale generated sources or addons.
Accept a prebuilt only when its source digest matches. Every backend must retain fields, named/anonymous
nodes, UTF-16 ranges, ERROR/MISSING and bounded cancellation; rerun all mutation controls before switching.

Full/live-oracle operations need **JRE 17**, normal Java SE modules plus `jdk.unsupported`/`jdk.zipfs`.
Ship a versioned/SHA-verified precompiled `PsiOracle` helper; a JDK is needed to build that helper
in release CI, never to run checks. Kotlin parser jars stay; `jdk.compiler` is unnecessary.
Quick needs **no Java**. Remove required git/curl/tar:
Node HTTPS with bounded/proxy-aware requests and SHA verification; a small audited JS tar/ZIP
reader with confined paths/symlink policy. Git is optional provenance/fetch convenience.

WASM is a documented alternative: 104/104 sample fidelity, faster extraction, released runtime
Node+JRE; **changed grammars need Emscripten or Docker/Podman to rebuild WASM**. The 49k research
pass compared counts, with one PSI-invalid difference; it is not complete-tree fidelity proof.
CLI/CST achieved only 85/104 fidelity and very large output; defer it. Evidence: prerequisite
research dated 2026-11-06, native/WASM runtime 0.25.1.

## 2. Checked-in configuration

Recommend **TOML**, for comments/readability, with one pinned parser dependency; JSON is accepted
through the same schema using `JSON.parse` (Q2). Select one file via `--config`; ambiguous discovery fails.
Unknown keys, missing pins and duplicate names fail.
Illustrative shape; implementation must supply real coordinates/digests, never placeholders:

```toml
[kotlin-psi]
version = "2.4.21"
jars = [{ coordinate = "group:artifact:version", sha256 = "<64 hex>" }]
helper = { version = "<release>", sha256 = "<64 hex>" }
[[repo]]
name = "okio"
url = "https://github.com/square/okio.git"
rev = "1926f022425ccd85ee558c558f0a5b7b24826a57"
includes = ["**/*.kt", "**/*.kts"] # defaults; POSIX globs relative to repo root
excludes = []
known-failures = [] # exact path, raw SHA, reason/class, issue URL, ledger/evidence
content-manifest = "<reviewed source inventory/digest>"
```

Resolve config paths relative to the config file; globs relative to each imported repository.
Includes/excludes declare reviewed scope; **failure-based exclusions belong in known-failures**,
not glob filters. Never auto-filter PSI-invalid files. Verify full-SHA HTTPS archive metadata
and extracted source manifests; provider commit assertions alone are insufficient. Content digests
survive repackaged archives. Report selection/exclusion counts and pins per repository/partition.

## 3. Quick — committed, curated assertions

Corpus defaults to our cases + ledger cases + **deliberately selected findings** (Q3); no automatic
generated corpus. Commit each source, original `.kt`/`.kts` mode, raw SHA, pinned normalized PSI
tree/source facts, oracle/helper/catalogue identity and mode `must-match` or `known-bug` + ledger ID.

**Store PSI expectations, not tree-sitter outputs.** Quick compares the current grammar directly
with these reference assertions; it needs neither JVM nor network. TS snapshots would freeze
old mistakes and create noisy acceptance baselines; use native output only as diagnostic evidence.
`must-match` differences fail. A known-bug row is `KNOWN` only when its complete mismatch is covered
by a narrow reviewed issue assertion covering all differences, never just a filename/signature;
extra/different failures fail, and a match is reported `RESOLVED` without automatic promotion.
Known-bug diagnostic rows never count as full conformance or become repository waivers.

`psi-gate regenerate-expectations` explicitly regenerates **existing selected sources' PSI truth**
with pinned jars/JRE, deterministic ordering and reviewed diffs. It neither generates/adopts sources
nor copies current TS output into expectations. Stale source/oracle/catalogue identities fail quick.

## 4. Full — parallel acquisition, absolute results

`full` starts quick and bounded concurrent repo fetches together; verified warm caches avoid fetches.
Then check configured source snapshots against live PSI while preserving their paths/extensions.
Optional PSI cache keys include file SHA/path/mode, jars/helper and decode policy; normalized cache
also includes catalogue identity. Grammar-only changes can reuse reference PSI, never stale verdicts.
Overall pass requires quick assertions and every included full source to pass; acquisition/oracle errors fail.
`repo DIR` survives for current local folders using the same selection/checking; Git/clean status is optional.

Verdicts are **absolute for current contents**: no merge-base, base build, delta, ratchet or past-commit
acceptance snapshots. Retain strict v1 principles: immutable reviewed repo pins; exact known-failure
records; target ≤5/hard cap10 globally across required repositories, including PSI-invalid originals;
no runtime reclassification. Resolved full waivers must be removed. Report mismatch counts, never
blended percentages. First admission: fix Okio's two grammar defects preferably, or approve two
exact-hash waivers; add whole natural partitions when green. Exact candidate-merge CI protects main.

## 5. Fuzz — suspects only; follow-up decides

Reuse the current generator, mutator, minimizer, inspector and local-ledger machinery as a **seeded,
deterministic, budgeted search**, never quick/full pass/fail or a corpus producer. Its only deliverable
is an owned temp/untracked folder. One completed, minimized, PSI-valid, live-reverified `suspect-ID.kt`
per distinct suspect fingerprint (preserve `.kts` for scripts), plus `suspect-ID.json` containing:

`{schema, sourceSha256, seed, origin, oraclePin, grammarDigest, catalogueDigest, psiErrors:0,
nativeErrors, psiNormalized, nativeNormalized, diff, signature, knownMatch, reduction, reverified}`.

`index.json` contains ordered absolute file/sidecar paths, seed/budgets, completeness and pending/known
counts; stdout prints the suspect file paths only. Output cannot target the committed corpus.
No ranked verdict report or grammar/normalizer
classification. Incomplete reductions are marked pending, not emitted as verified minimized findings.
Replay corpus/ledger for dedupe: suppress verified identical examples/problem evidence; shared
signatures alone are only advisory `knownMatch` candidates, never grounds to hide a different defect.

A separate human/agent follow-up analyzes **each file**, parallelizable: grammar bug / fixed must-match
case / normalizer fix / discard. Only explicit `psi-gate add FILE --kind must-match` or
`--kind known-bug --ledger-id ID` admits one chosen finding. Add rechecks source/pins/live PSI and the
current grammar, validates the chosen assertion, dedupes, then atomically writes source + stored PSI
expectation + manifest/ledger link for review. It cannot trust stale sidecars or classify automatically.

## 6. Migration and owner questions

Delete `base.js`/history-topology tests, merge-base/upstream options and fetches, base grammar/corpus
archives, ratchet/distance and per-file historical acceptance, `update-expected`, relative headlines,
and fuzz `--promote`/automatic corpus writes. Port regression controls to absolute v2 commands.
Keep normalizer/facts, oracle protocol, integrity caches, reports, minimizer, generator/search, ledger,
and `repo`; **regenerate-expectations/add are explicit reference/admission operations**, not past baselines.

Owner approval is required before code, including:
1. **Backend:** native first (recommended, same repository build tools), or WASM with a supported rebuild workflow?
2. **Config:** TOML + JSON compatibility (recommended), or JSON-only to avoid the TOML parser dependency?
3. **Corpus:** one curated corpus (recommended), or a separate “generated” label for manually selected specimens?
   Either choice forbids automatic fuzz/coverage-gain additions.
