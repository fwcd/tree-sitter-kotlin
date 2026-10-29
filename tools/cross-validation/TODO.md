# PSI comparison follow-up

The pinned fixture inventory is recorded in `fixtures.manifest.json`.
`../../test/jetbrains-fixtures.json` lists generated structural expectations,
remaining parser failures and explicit fixture-policy exclusions.

Parser failures stay in the corpus as `:error` cases. After a grammar fix,
regenerate the suite and promote newly clean cases to CST expectations. Do not
maintain an exclusion list for grammar bugs or remove supported-policy inputs.

The separate PSI comparison can still report structural mismatches on clean
parses. Inspect the original fixture, PSI golden and normalized trees before
changing grammar rules or mappings. A clean CST expectation is a regression
test for current parsing, not proof of exact agreement with PSI.

The two multi-file cases and seven experimental-syntax cases have hash-scoped
policy records. Changing their support or source pin requires explicit review
of those records. Block/expression fragment factories require separate context
adapters before their fixtures can join the whole-file import.
