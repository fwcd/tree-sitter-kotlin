# Curated must-match corpus

Every indexed `.kt`/`.kts` source here must match its stored `.psi.json` reference.
The 107 sources combine source-aware catalog/N13–N42 equivalence and role controls with
40 manually selected language examples. Every source passed live pinned PSI and the native
grammar before admission. Expectation `origin` records the original test/case or manual
feature and reviewed revision. The identical empty-IF/braced-IF source is stored once,
with both test origins retained. Failing cases remain in `../grammar-bugs/`.

## Language coverage

Coverage uses raw native named types and raw PSI elements, before normalization. The
round-2 curation measures:

| Universe | Original 68 sources | Curated 107 sources |
| --- | ---: | ---: |
| Native named types | 80 / 145 | **145 / 145** |
| Applicable PSI composites | 76 / 124 | **121 / 124** |
| Applicable PSI lexer types | 59 / 150 | **149 / 150** |
| Native parent/child contexts | 181 | 361 |
| PSI parent/child contexts | 312 | 626 |

These four types are explicitly reported as blocked:

| Type | Universe | Coverage status |
| --- | --- | --- |
| `COMPANION_BLOCK` | PSI composite | not yet coverable — blocked by grammar defects `coverage-companion-block` |
| `CONTRACT_EFFECT` | PSI composite | not yet coverable — blocked by grammar defects `coverage-contract-v2` |
| `CONTRACT_EFFECT_LIST` | PSI composite | not yet coverable — blocked by grammar defects `coverage-contract-v2` |
| `contract` | PSI lexer | not yet coverable — blocked by grammar defects `coverage-contract-v2` |

Both defects have minimized PSI-clean cases in the [grammar-bug ledger](../grammar-bugs/catalog-ledger.json):
[companion block](../grammar-bugs/coverage-companion-block.kt) and
[contract-v2](../grammar-bugs/coverage-contract-v2.kt). They currently fail native parsing
and remain outside this must-match corpus. The denominators retain them; this is complete
native-type coverage, with those explicit PSI gaps. Type presence does not prove every
possible syntax combination or context.

The `syntax-*` examples cover:

- Five `.kts` files cover shebangs, script declarations/imports, annotations and
  delegation, top-level loops/comment boundaries, and Gradle-style
  plugins/dependencies/task blocks; package/import aliases and file/use-site annotations.
- Objects, companions, enums and enum initializers, inheritance/super, type aliases,
  accessors, delegates, backing fields, named/positional destructuring and modifier families.
- Generic variance/reification/constraints, nullable and parenthesized intersection types,
  named function-type parameters and function-type receivers.
- Type checks/casts, jumps/labels, ranges, indexing, infix/postfix/spread, collection
  annotations, named arguments, guarded/range/value `when` entries and assignment operators.
- Boolean/null, decimal/long/hex/binary/float spellings, character/string escapes,
  ordinary/raw interpolation, KDoc tags/links/code, nested comments, Unicode and CRLF.

Reproduce the measurement with live PSI (JRE 17 and pinned jars required):

```sh
node tools/psi-gate/quick-coverage.js --out local/psi-gate/quick-coverage
```

The command reads indexed sources/current bytes, verifies stored references against live PSI,
requires every input to match, and writes `coverage.json` with frequencies, missing sets,
parent contexts and per-source witnesses using `fuzz-coverage.js`. The report's
`notYetCoverable` entries and console output list the blocked types with their ledger IDs;
they are reported only while missing. Quick itself needs no Java.

## Stored expectations

Quick reads Git-index membership and current working-tree bytes. A new untracked source is
ignored; stage the source and PSI reference to include it. Stored references contain the
normalized PSI tree and full PSI layout facts, raw-source SHA, oracle/helper pins and the
comparison-code identity. No Tree-sitter output or accepted mismatch is stored.

`regenerate-expectations` uses live pinned PSI for existing indexed sources, then writes
deterministic references only after every oracle result is valid. Review the diff before
staging. Grammar changes do not regenerate PSI truth; an incorrect grammar keeps failing quick.
Changing source, oracle pins or normalization invalidates stale expectations.
