# Curated must-match corpus

Every indexed `.kt`/`.kts` source here must match its stored `.psi.json` reference.
Sources are curated from the source-aware catalog, N13–N42 equivalence/role controls and
two formerly failing normalization findings. The expectation `origin` records the test,
case and migration revision. All 68 sources were checked against pinned PSI and the native
grammar before admission; failing cases remain in `../grammar-bugs/`.

Quick reads Git-index membership and current working-tree bytes. A new untracked source is
ignored; stage the source and PSI reference to include it. Stored references contain the
normalized PSI tree and full PSI layout facts, raw-source SHA, oracle/helper pins and the
comparison-code identity. No Tree-sitter output or accepted mismatch is stored.

`regenerate-expectations` uses live pinned PSI for existing indexed sources, then writes
deterministic references only after every oracle result is valid. Review the diff before
staging. Grammar changes do not regenerate PSI truth; an incorrect grammar keeps failing quick.
Changing source, oracle pins or normalization invalidates stale expectations.
