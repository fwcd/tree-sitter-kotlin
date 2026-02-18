# Tree-Sitter Kotlin Grammar Issues

Structural mismatches between tree-sitter-kotlin and JetBrains PSI reference parser,
categorized by root cause and difficulty. Each issue represents a grammar.js fix needed
to match JetBrains' expected AST structure.

**Current state:** 75/118 clean parses match structurally (63.6%)

Fix these issues iteratively — after each grammar fix, re-run the cross-validation
and move fixed files from `excluded.txt` to the vendored corpus.

## How to Use

1. Pick an issue category below (start with EASY)
2. Fix the grammar in `grammar.js`
3. Run `npm run build && npm test` to verify existing tests still pass
4. Run `python3 tools/cross-validation/main.py` to check if affected files now match
5. Remove fixed files from `excluded.txt`
6. Re-run `./tools/vendor-jetbrains-tests.sh tools/cross-validation/fixtures/` to update corpus
7. Commit

---

## EASY (5 files, 4 issues)

### block_comment_file_start (2 files)

**Problem:** Block comments containing operators (e.g. `/* 1 + 2 */`) at file start
are parsed as `BINARY_EXPRESSION` instead of being treated as comments.

**Files:**
- `BlockCommentAtBeginningOfFile3`
- `BlockCommentAtBeginningOfFile4`

**Likely fix:** Comment tokenization in `extras` or scanner — block comments with
arithmetic content aren't being consumed as comments in certain positions.

---

### duplicate_accessor (1 file)

**Problem:** Property with duplicate get/set accessor produces 3 `PROPERTY_ACCESSOR`
children where PSI expects only 2.

**Files:**
- `DuplicateAccessor`

**Likely fix:** Grammar allows more than 2 accessor declarations per property.
Add constraint or let the grammar accept it (PSI may handle this as an error).

---

### object_literal (1 file)

**Problem:** `OBJECT_LITERAL` used as a statement has wrong internal nesting structure.

**Files:**
- `ObjectLiteralAsStatement`

**Likely fix:** Check `object_literal` rule — may need to adjust how `object`
expression wraps its delegation specifiers and class body.

---

### typealias_keyword (1 file)

**Problem:** `typealias` not recognized as a separate declaration in some contexts;
parsed as a property instead.

**Files:**
- `TypealiasIsKeyword`

**Likely fix:** `typealias` may not be in the keyword list or may conflict with
soft keyword handling.

---

## MEDIUM (17 files, 6 issues)

### enum_entry_constructor (4 files)

**Problem:** `ENUM_ENTRY` with constructor arguments: tree-sitter nests
`VALUE_ARGUMENT_LIST` inside the entry where PSI expects `USER_TYPE` +
`VALUE_ARGUMENT_LIST` as siblings under `ENUM_ENTRY`.

**Files:**
- `EnumMissingName`
- `EnumShortCommas`
- `EnumShortWithOverload`
- `Enums`

**Likely fix:** `enum_entry` rule needs to produce a `USER_TYPE` child for the
supertype constructor call, with `VALUE_ARGUMENT_LIST` as a sibling, not nested
inside it.

---

### file_annotations (4 files)

**Problem:** Multiple `@file:` annotations not grouped correctly in
`FILE_ANNOTATION_LIST`. `ANNOTATION_TARGET` and `ANNOTATION_ENTRY` structure
doesn't match PSI — PSI wraps each annotation in `ANNOTATION_ENTRY` with an
`ANNOTATION_TARGET` child.

**Files:**
- `DocCommentAfterFileAnnotations`
- `LineCommentAfterFileAnnotations`
- `topJvmPackageName`
- `topJvmPackageNameMultifile`

**Likely fix:** `file_annotation` rule needs to emit proper `ANNOTATION_ENTRY` >
`ANNOTATION_TARGET` nesting for each `@file:` annotation.

---

### by_delegation (3 files)

**Problem:** `DELEGATED_SUPER_TYPE_ENTRY` with `by` clause produces extra
`CALL_EXPRESSION` child and missing `CLASS_BODY`. The `by` expression is
being absorbed into the delegation entry instead of being a separate construct.

**Files:**
- `ByClauses`
- `delegation`
- `SimpleClassMembers`

**Likely fix:** `delegation_specifier` rule — the `by` clause needs to be
structured so the delegated expression is properly separated from the class body.

---

### class_body_nesting (3 files)

**Problem:** `CLASS_BODY` missing or inner class nesting structure differs from PSI.

**Files:**
- `NonTypeBeforeDotInBaseClass`
- `dependencyOnNestedClasses`
- `innerTypes`

**Likely fix:** Check how nested class declarations interact with the parent
class body structure.

---

### super_expression (1 file)

**Problem:** `super` expression with type qualifier (`super<Foo>`) has wrong
structural nesting compared to PSI.

**Files:**
- `Super`

**Likely fix:** `super_expression` rule — type argument in angle brackets needs
correct nesting.

---

### value_parameter_defaults (2 files)

**Problem:** Default parameter values (`fun f(x: Int = 5)`) are not nested inside
`VALUE_PARAMETER`. The default value expression appears as a sibling instead of
a child of the parameter.

**Files:**
- `SimpleExpressions`
- `topLevelMembers`

**Likely fix:** `value_parameter` rule — default value expression should be a
child of the parameter node, not promoted to the parameter list level.

---

## HARD (20 files, 5 issues)

### prefix_vs_binary (2 files)

**Problem:** Unary minus/plus after line breaks parsed as `BINARY_EXPRESSION`
instead of `PREFIX_EXPRESSION`. This is a newline-sensitivity issue — Kotlin
treats newlines as statement separators in some contexts.

**Files:**
- `EOLsInComments`
- `NewlinesInParentheses`

**Likely fix:** Requires newline-aware precedence handling in the grammar or
scanner. Tree-sitter's `extras` treats newlines as whitespace by default,
losing the statement-termination semantics.

---

### lambda_nesting (3 files)

**Problem:** Lambda bodies have wrong `CALL_EXPRESSION` vs `BLOCK` nesting.
`FUNCTION_LITERAL` children are in the wrong order or at the wrong depth.

**Files:**
- `CommentsBindingInLambda`
- `FunctionLiterals`
- `localClass`

**Likely fix:** `lambda_literal` and `function_literal` rules need restructuring.
The interaction between trailing lambdas and call expressions creates cascading
nesting differences.

---

### type_argument_placement (7 files)

**Problem:** `TYPE_ARGUMENT_LIST` placed at wrong nesting level in `USER_TYPE`.
Affects generics like `Foo<A>.Bar<B>` — tree-sitter attaches type arguments
to the wrong part of the qualified type chain.

**Files:**
- `ExtensionsWithQNReceiver`
- `complicateLTGT`
- `incorrectLTGTFallback`
- `definitelyNotNullTypes`
- `types`
- `typeParams`
- `typeAliasExpansion`

**Likely fix:** `user_type` rule — type arguments need to be attached per-segment
in dot-qualified types, not hoisted to the outermost type.

---

### type_modifiers (3 files)

**Problem:** `suspend` and other type modifiers not mapped to correct PSI structure.
`MODIFIER_LIST` placement differs from JetBrains expectations.

**Files:**
- `TypeModifiers`
- `typeModifiers2`
- `suspendLambda`

**Likely fix:** Type modifier handling in function types and lambda types needs
restructuring to match PSI's `MODIFIER_LIST` placement.

---

### annotation_structure (5 files)

**Problem:** `ANNOTATION_ENTRY` / `ANNOTATION_TARGET` / `CONSTRUCTOR_CALLEE`
nesting differs from PSI. Annotations with arguments, use-site targets, and
annotations on type parameters all have structural differences.

**Files:**
- `annotations`
- `annotationsOnParenthesizedTypes`
- `annotationValues`
- `annotatedParameterInEnumConstructor`
- `TypeParametersBeforeName`

**Likely fix:** Annotation rules need comprehensive restructuring to match PSI's
three-level nesting: `ANNOTATION_ENTRY` > `ANNOTATION_TARGET` + `CONSTRUCTOR_CALLEE`.

---

## NORMALIZER (not grammar — cross-validation tool fix)

### is_in_expression_mapping (1 file)

**Problem:** `IS_EXPRESSION` and `IN_EXPRESSION` mapped as `BINARY_EXPRESSION` in
the normalizer. This is a cross-validation tool issue, not a grammar issue.

**Files:**
- `NotIsAndNotIn`

**Fix:** Update `tools/cross-validation/mapping.py` to map tree-sitter's
`is_expression` / `in_expression` → PSI's `IS_EXPRESSION` / `BINARY_EXPRESSION`
(PSI uses `BINARY_EXPRESSION` for `in` but `IS_EXPRESSION` for `is`).
