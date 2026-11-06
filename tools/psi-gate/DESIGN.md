# PSI gate v2 — owner-approved design

Authoritative decisions: **2026-11-06 17:16 UTC**. Replaces the proposal at `9cdbc62`.
This task updates documentation only; implementation is separate. Verdicts answer whether the
current contents are good against pinned PSI, with no comparison to previous commits.

## 1. Native backend and prerequisites

Use **the repository's own Node binding**: load `bindings/node`, built from `binding.gyp` by the
normal `npm install`/node-gyp workflow, with the repository's installed Tree-sitter dependency.
Do not install a separate gate runtime or create private per-grammar addon builds. Ensure generated
parser sources and the loaded addon represent the current working tree; if a rebuild is necessary,
use the repository's normal generate/build workflow once. That current build is necessary for
testing grammar edits; historical/base grammar builds are not.

Required: **Node, Git, the build toolchain the repository's npm install already needs, and JRE 17**
for live PSI operations. Python/make/C++ serve the existing Node binding, not PSI. Ship the
precompiled/versioned/SHA-verified `PsiOracle` helper; JDK compilation belongs to helper release CI.
Quick needs no Java. Node HTTP/SHA verification handles jars/helper downloads; curl/tar are gone.
Native field/range/ERROR/MISSING/cancellation and N1–N42 controls remain required.

## 2. One configuration: `psigate.toml`

TOML only, with comments for context. The supported shape is:

```toml
[kotlin-psi]
version = "2.4.21"
jars = [{ coordinate = "group:artifact:version", sha256 = "<64 hex>" }]
helper = { version = "<release>", sha256 = "<64 hex>" }
[[repo]]
name = "okio"
url = "https://github.com/square/okio.git"
rev = "1926f022425ccd85ee558c558f0a5b7b24826a57" # full commit SHA
includes = ["**/*.kt", "**/*.kts"] # defaults, relative to repository root
excludes = ["folder1/**", "folder1/file1.kt"] # context in TOML comments
```

Pins/digests must be real; invalid schema/pins fail. **No known-failures, content-manifest, JSON
configuration alternative, exclusion caps, or gate lockfile.** Existing repository npm conventions
remain unchanged. All include/exclude globs use repository-relative POSIX paths.

## 3. Inputs: external Git checkouts versus our working tree

Configured repositories are fetched/cached as Git checkouts at their **exact pinned revision**.
Both config repositories and `repo DIR` must be **clean**: any modified or staged tracked file
fails, with affected paths listed. An unconfigured `repo DIR` records its current HEAD; config
repositories must match their configured full SHA. **Untracked files are ignored, never an error.**
Inventory comes **only from `git ls-files`**, then includes/excludes. No directory-walk fallback,
content/markup/PSI-validity filter, or import of another repository's grammar assertions.

For **our repository**, impose **no clean requirement**. Use its Git index (tracked + newly staged
files) for discovery, but read **current working-tree bytes**, including unstaged edits. A new
snippet participates once `git add`ed; unstaged untracked files do not. Missing included files or
incomplete input runs fail. Preserve `.kt`/`.kts` modes and identical decoding on both parsers.

**Excludes pass always.** They are unconditional exemptions, documented by optional TOML comments;
there is no count/hash/issue/removal-condition policy. Full may optionally note that an excluded
file now matches, but the note/check never fails the gate or requires exclude cleanup.
This exempts file conformance; external checkout cleanliness and revision checks still apply.

## 4. Quick and full: absolute checks

Quick uses **one curated, committed corpus; every snippet is MUST-MATCH**. Store source and pinned
normalized PSI tree/source-fact expectations with reference identities. Store no Tree-sitter output
acceptance snapshots. Stale expectations or any included mismatch fail. **Failing cases remain in
the grammar-bug ledger outside quick**, never known-bug quick assertions or tolerated mismatches.

Explicit, reviewed `regenerate-expectations` refreshes stored PSI for existing selected snippets
using the pinned jars/helper/JRE. It does not generate/adopt snippets or record current native output
as truth. Normal quick runs use stored expectations and need no JVM/network. Quick stays green
through must-match admission and checks on every candidate revision.

`full` starts quick and bounded parallel fetch/cache work for config repositories together, then
checks included index-listed source against live pinned PSI. Overall pass requires quick and every
included full file to match; setup/fetch/dirty-check/parse failures fail. Optional PSI caches use
source/path/mode and oracle/decode identity; normalized caches also include catalogue identity.
Integrity/cache receipts are internal, not a checked-in lockfile/content manifest or past verdict.

Retain exact normalized tree/payload, native role ownership and comment/declaration/token facts.
Included files require both parsers error-free; report absolute mismatching counts per repository/
partition and selected/excluded counts, never base deltas or blended percentages. Required CI
checks the exact candidate merge revision; stale/skipped checks cannot qualify.

## 5. Fuzz search, follow-up and explicit admission

Fuzz is **seeded, deterministic, budgeted search only**, never quick/full pass/fail or an automatic
corpus producer. Reuse the generator, mutator, minimizer, inspector and local finding/ledger tools.
Write an owned temp/untracked folder of completed minimized, PSI-valid, live-reverified suspect
`.kt` files (preserve script mode for script inputs), with one representative per distinct suspect.

Sidecar: `{schema, sourceSha256, seed, provenance, oraclePin, grammarDigest, catalogueDigest,
psiNormalized, nativeNormalized, diff, signature, knownMatch, reduction, reverified}`.
`index.json` gives ordered absolute file/sidecar paths, budgets and complete/pending/known counts;
stdout prints the file paths. Unfinished/unverified reductions remain pending. Suppress verified
identical known corpus/ledger examples; shared signatures alone only annotate possible known matches.
**The fuzzer makes no decisions**, classifies no root cause, and writes no committed corpus files.

A separate human/agent follow-up analyzes each suspect, parallelizable: grammar bug / normalizer
fix / discard / fixed must-match candidate. Record failing cases in the grammar-bug ledger.
Only explicit `psi-gate add FILE` re-verifies a chosen snippet with current grammar/live pinned PSI,
**requires full match**, dedupes, writes source + stored PSI expectation/corpus metadata, and stages
them with Git (no commit). It rejects failing/stale findings; there is no known-bug quick admission.

## 6. Migration boundary

Delete base.js/history tests, merge-base/upstream-history options, base builds/corpus archives,
separate gate runtime/private addon build machinery, ratchet/distance/per-file historical acceptance,
`update-expected`, relative headlines, fuzz `--promote`, known-bug quick modes, known-failure/cap/
content-manifest/lockfile policy, and curl/tar requirements. Port regression controls to v2 commands.
Keep normalizer/facts/N1–N42 review safeguards, oracle protocol, integrity caches, reports, minimizer,
search/generator, bug ledger and `repo`; expectation regeneration/admission remain explicit operations.
No automatic generated corpus. These owner decisions supersede earlier optional base/relative and
waiver proposals; retain their history as design context, not active v2 behavior.
