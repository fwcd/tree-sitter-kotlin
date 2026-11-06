# Strict PSI conformance gate

**Decision proposed for review; no implementation.** Make a fixed corpus's full PSI match the required
grammar check. Reviewed foundation: N1–N42 at `0e319e2`, 72 catalog/93 native witnesses, and genuine
full-coverage stability windows of 5,014 and 5,003 PSI-valid inputs. These are evidence, not exemptions.

## Contract and normalization

For each selected original `.kt`/`.kts` file, compare HEAD's grammar with pinned Kotlin PSI **2.4.21**.
Pin the existing runtime **tree-sitter 0.25.1**, build environment and corpus manifest; reproduce the
initial counts under those exact CI pins before enabling the job. Decode both sides identically;
record raw-byte hashes and any explicit BOM/newline decoding policy. Never reinterpret `.kt` as `.kts`.

`N.tree = {type, children: N.tree[], payload?: {value, start, end}}`, ordered, with literal values/ranges
and `CONDITION/THEN/ELSE/LOOP_RANGE/BODY` roles retained. Ordinary reference wrappers are transparent.
Full match means exact tree/payload equality **and** agreement of comments, declaration starts and
significant-token ownership/spans under the reviewed aliases in `native-facts.js`/`native-layout.js`.
Both sides normalize independently from their own emitted structure/source facts; no guessed names,
precedence repair, dropped substantive children or diagnostic-signature waiver.

Errors must agree. Every selected file in any required tier requires **neither parser to report errors**;
one-sided and both-error files are failures. PSI-invalid originals **inside a selected core partition consume the same capped exclusion budget**;
never drop/reclassify them at runtime. Deliberately negative testData stays outside core in a separately
enumerated job. Neither parser's error boolean alone establishes conformance.
Missing files, corrupt pins, oracle failures, timeouts and incomplete runs fail the job.

The closed **N1–N42 catalogue** is incorporated from [normalizer.js](../cross-validation/normalizer.js),
its metadata/literal helpers and catalog/loop tests. Per-rule reason → example:

- **N1** owned import DOT → `a.*`; **N2** owned constructor keyword → `constructor()`;
  **N3** atomic suffix → `1u`; **N4** handler blocks → `try{}catch(e:T){}`;
  **N5** lvalue suffix aliases → `a[i].b=c`; **N6** actual braces → `{}`;
  **N7** equivalent literal runs → `"a\nb"`.
- **N8** qualification retains calls → `foo().bar.baz`; **N9** implicit delegation → `constructor()`;
  **N10** short this → `"$this"`; **N11** prefix count/range → `$$"x"`; **N12** initializer block → `init{}`;
  **N13** subject declaration → `when(val x=f())`; **N14** layer per quest → `T??`.
- **N15** parsed postfix order → `a!!.b=c`; **N16** access alias/operator facts → `a?.b`;
  **N17** generic receiver alias → `Foo<T>::class`; **N18** flat statement prefix → `@A f()`;
  **N19** iterator/absent body → `for(x in y);`; **N20** delegated generic call → `I by f<T>()`;
  **N21** assignment annotation scope → `@A x.y=1`.
- **N22** argument annotation scope → `g(x,@A f())`; **N23** grouped entries → `@[A B]`;
  **N24** invalid escape fragments → `"\q"`; **N25** header comment is no body → `constructor()/*c*/`;
  **N26** initializer header → `@A init{}`; **N27** delegated annotation → `I by @A f()`;
  **N28** result invocation → `a.b()()`.
- **N29** target per entry → `@field:[A B]`; **N30** dynamic parameter slot → `(dynamic)->T`;
  **N31** receiver alias → `fun T.(){}`; **N32** arbitrary invocation depth → `a.b()()()`;
  **N33** lambda arguments → `a.b{}{1}`; **N34** expression-body pieces → `fun f()=l@f()`;
  **N35** parsed generic qualifier → `Foo<T>.Bar<U>::f`.
- **N36** type-owned context → `context(A)()->T`; **N37** selector target → `a.(f)(1)`;
  **N38** argument first operand → `g(x,@A a+b)`; **N39** annotated declaration start → `@A fun(){}`;
  **N40** final newline controls scope → `@A(1)\n(a)+b`; **N41** consecutive list → `(@A @B x)`;
  **N42** actual fields/header roles → `if(c)f()else g()`.

Standing premise for N18/N21/N22/N38–N41: `_statement_annotations` remains hidden. Revisit regrouping
if formerly flat tuples acquire explicit binding. Catalogue changes require a minimized witness proving PSI semantic equivalence, positive/genuine negative
controls and both-family review; passing a corpus file alone never justifies a rule. Report catalogue
version/count. Keep rebuilt hidden-body/role-swap controls and minimized witnesses.

## First corpus and ladder

**Recommend fixing the two grammar bugs, then enabling Okio production with zero exclusions.** Pin
`square/okio@1926f022425ccd85ee558c558f0a5b7b24826a57`: all **205** inventoried production files,
including shipped `okio-testing-support` main sources. Fix **the grammar/scanner**, never corpus bytes.
The manifest publishes disjoint directory/source-set predicates: main/platform sources are production
regardless of `Test` names; test source sets are tests; build/example/script sources are support. The
95 tests/27 support exclude production main sources; **205+95+27=327**, with no residual, overlaps,
filename/content/markup/pass-result filter. Publish sorted paths/raw hashes and partition rule version.

| Choice | Grammar/scanner defects | Coverage trade-off |
|---|---|---|
| Fix both (recommended) | `loop-data-index-assignment` in `okio/internal/Buffer.kt`; `loop-escaped-dollar-interpolation` in `AbstractFileSystemTest.kt` | All 205 checked, zero waivers |
| Bootstrap with two reviewed exclusions | Candidates below, owner-approved issues/removal plan | Green sooner on 203; omits 135,237 bytes, about 13% of source, including core Buffer |

Proposed bootstrap candidates (not active until owner review and real issue URLs), with immutable raw hashes:

| Path | SHA-256 | Reason / ledger ID |
|---|---|---|
| `okio/src/commonMain/kotlin/okio/internal/Buffer.kt` | `8c729e9d9372f9cec92d48dbe44be6d2c95344460d5b738501fde79e402d688a` | soft-data indexed assignment / `loop-data-index-assignment` |
| `okio-testing-support/src/commonMain/kotlin/okio/AbstractFileSystemTest.kt` | `e9c836021d77265ec2ada98e745695ae6d74eab90506684b5c1959d542472ed6` | escaped-dollar interpolation / `loop-escaped-dollar-interpolation` |

These PSI-valid waivers are a new choice beyond prior PSI-invalid proposals. Fixes retain positive
witnesses/ledger history and remove related exclusions in the same PR; corpus bytes/pins stay fixed.

Grow by reviewed, **whole natural partitions**, never a selection of passing files:

| Next required tier | Current mismatching FILES | Admission |
|---|---:|---|
| Okio tests (95) + support (27), same pin | 0 + 0 | Add immediately after first tier is green |
| Kotlin stdlib (901), `9180ce6a7a7d3627f88b424717583f28ddca052d` | 31 | Fix shared grammar classes; 31 cannot fit the exception budget |
| Other libraries, then compiler production (5,343), then remaining Kotlin production | Compiler 84; all Kotlin production 213 | Remeasure libraries; fix before admission; compiler/stdlib are subsets |

These are mismatching **file** counts, including errors: Okio production has 2 PSI-valid grammar
mismatches/0 PSI-invalid; Kotlin production 213 = 211 PSI-valid mismatches + 2 PSI-invalid originals;
stdlib/compiler 31/84 have no PSI-invalid originals. Kotlin tests 65 have none; support 34 = 33 + 1.
Fix grammar mismatch classes before admission; any reviewed waivers, including PSI-invalid originals,
share the global cap. Kotlin tests/support follow production when ready. TestData's 4,019 failures
stay in a non-required diagnostic/fuzz job; it cannot absorb relocated core files or become uncapped exclusions.

## Exclusions, result and migration

Proposed `strict-exclusions.json`: versioned entries `{corpus, path, sha256, reasonClass, reason, issue,
ledgerId?, oracleEvidence?}`. `issue` is a reviewed tracker URL for either a grammar defect or input/reference
validity problem; placeholders never activate waivers. Hash raw bytes; reject unknown/duplicate paths.
`grammar-defect` becomes stale on full match. `psi-invalid-original` also requires pinned oracle-error
evidence and becomes stale when PSI is error-free, even if native still fails. Both classes share the cap.
**Target ≤5, hard cap 10 across all required corpora.** Additions/pin changes require review. Compute
and report excluded files' actual results too; a whole-file waiver can hide further bugs in that file.

Recommended headline: `okio/production: 0 files mismatching (target 0, 0 excluded; 205 selected, 205 included)`.
Bootstrap instead reports **205 selected, 203 included, 2 excluded, 0 included mismatches**, plus the
excluded files' actual results. All selected files are evaluated; report catalogue N42/42 rules.
Pass iff every non-excluded selected file fully matches and the manifest/exclusions/run are valid.
Never report a blended percentage. Pins and integrity hashes identify inputs; they are not match evidence.

Implement a HEAD-only strict path: remove base resolution/builds, ratchet/distance rules, allowed
per-file mismatch baselines and `treeHash`/signature acceptance from its predicate. Keep the existing
relative commands/headlines as clearly labelled, optional diagnostics for broader ungated corpora;
their PASS does not mean PSI conformance. Replace their required CI role when strict becomes green.
Delete no shared builders, integrity/cache checks, minimizers, coverage tools, bug ledger or controls;
physically remove obsolete relative-only modules only after their callers are retired.

Keep the existing required check until strict activation lands green. Thereafter require strict CI
on **the exact candidate merge SHA**, via merge queue/equivalent protection, for every change affecting
parser/scanner, normalizer, runner, pins, manifests, exclusions or CI. HEAD may be the combined merge
candidate; it is never compared with a base. Skipped/stale checks cannot satisfy protection. **Both Codex and Claude reviewer families
review this spec before implementation; record approvals or concrete objections.**
