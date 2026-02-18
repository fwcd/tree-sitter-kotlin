# Tree-Sitter Kotlin vs JetBrains PSI: Cross-Validation Report

Structural comparison of tree-sitter-kotlin parse trees against
JetBrains PSI reference trees for all 228 JetBrains fixture files.

## Summary

| Metric | Count |
|--------|-------|
| Total fixture files | 228 |
| Tree-sitter clean parses | 118 |
| Tree-sitter parse errors | 110 |
| **Structural matches** | **75** |
| Structural mismatches | 43 |
| PSI parse errors | 0 |

**Match rate (among clean parses): 75/118 (63.6%)**

## Mapping Methodology

### Overall Approach

This cross-validation compares parse trees produced by two independent Kotlin
parsers: **tree-sitter-kotlin** (incremental, error-recovering) and the
**JetBrains PSI** parser (the reference parser used by IntelliJ IDEA). The
trees differ in node naming, nesting depth, and structural conventions.

The comparison pipeline works as follows:

1. **Parse** each Kotlin fixture with both parsers to produce raw trees.
2. **Normalize** each tree by applying parser-specific rules (skip noise nodes,
   rename node types, collapse wrappers, inject missing structural wrappers).
3. **Compare** the two normalized trees recursively, recording structural
   differences (name mismatches, extra children, missing children).

### Key Mapping Decisions

**Identifier handling** -- PSI wraps every identifier in a `REFERENCE_EXPRESSION`
node that has no children after normalization, while tree-sitter uses
`simple_identifier`, `type_identifier`, and `identifier` as leaf nodes. Both
sides skip these nodes entirely so that comparison operates on the semantic
structure above the identifier level.

**BLOCK / function_body / control_structure_body** -- Tree-sitter emits
`function_body` for function bodies and `control_structure_body` for
`if`/`when`/`for`/`while` bodies. PSI uses `BLOCK` for brace-delimited bodies
and has no wrapper for expression bodies (`= expr`). The normalizer detects
expression bodies (single child that is not a `statements` node) and makes
the wrapper transparent, while block bodies map to `BLOCK`.

**DOT_QUALIFIED_EXPRESSION chains** -- After removing `REFERENCE_EXPRESSION`,
package/import name chains like `a.b.c` leave behind nested
`DOT_QUALIFIED_EXPRESSION` nodes with no non-DQE children. Both normalizers
collapse these empty chain links to avoid phantom depth mismatches.

**VALUE_PARAMETER_LIST injection** -- PSI wraps constructor and accessor
parameters in `VALUE_PARAMETER_LIST`, but tree-sitter places `VALUE_PARAMETER`
nodes directly under `PRIMARY_CONSTRUCTOR` or `PROPERTY_ACCESSOR`. The
tree-sitter normalizer injects a synthetic `VALUE_PARAMETER_LIST` wrapper when
these parameter nodes appear as direct children.

**PROPERTY_ACCESSOR nesting** -- Tree-sitter places getter/setter nodes as
siblings of `PROPERTY`, while PSI nests them inside `PROPERTY`. A post-processing
step in the tree-sitter normalizer moves `PROPERTY_ACCESSOR` nodes into the
preceding `PROPERTY` node's children.

**FUNCTION_TYPE_RECEIVER unwrapping** -- Tree-sitter maps `receiver_type` to
`FUNCTION_TYPE_RECEIVER` everywhere, but PSI only uses `FUNCTION_TYPE_RECEIVER`
inside function type declarations. For extension functions and properties, PSI
places the receiver type (e.g., `USER_TYPE`) directly under `FUN`/`PROPERTY`.
The normalizer unwraps `FUNCTION_TYPE_RECEIVER` when it appears under `FUN` or
`PROPERTY`, promoting its children to the parent level.

**CALL_EXPRESSION flattening** -- Tree-sitter nests trailing lambda calls as
cascading `CALL_EXPRESSION` wrappers (e.g., `f() {} {} {}` becomes three nested
`CALL_EXPRESSION` nodes), while PSI flattens all trailing lambda arguments as
siblings under a single `CALL_EXPRESSION`. The normalizer recursively flattens
these chains.

**FUNCTION_LITERAL > BLOCK injection** -- PSI always emits a `BLOCK` child inside
`FUNCTION_LITERAL` even for empty lambdas `{}`, but tree-sitter's `lambda_literal`
produces no children when the body is empty. The normalizer injects an empty
`BLOCK` node to match PSI structure.

**CLASS_INITIALIZER > BLOCK wrapping** -- PSI has `CLASS_INITIALIZER > BLOCK >
[children]`, but tree-sitter's `anonymous_initializer` promotes `statements`
children directly. The normalizer wraps these children in a `BLOCK` node.

**OBJECT_LITERAL > OBJECT_DECLARATION injection** -- PSI wraps `OBJECT_LITERAL`
contents in an `OBJECT_DECLARATION` node, but tree-sitter places children
directly under `OBJECT_LITERAL`. The normalizer injects this wrapper.

**VALUE_PARAMETER wrapping in function types** -- In function type parameter
lists (`function_type_parameters`), tree-sitter places type nodes directly as
children, but PSI wraps each in `VALUE_PARAMETER`. The normalizer wraps bare
type children in `VALUE_PARAMETER` when they appear in `VALUE_PARAMETER_LIST`
without existing `VALUE_PARAMETER` nodes.

**Empty structural nodes** -- PSI always emits `PACKAGE_DIRECTIVE`, `IMPORT_LIST`,
and `MODIFIER_LIST` even when they are empty. The PSI normalizer strips these
when they contain no children after normalization.

**RETURN / THROW / BREAK / CONTINUE** -- Tree-sitter wraps these in a generic
`jump_expression` node that loses the keyword distinction. Both sides skip these
nodes so that the comparison focuses on the expression's payload rather than
the keyword wrapper.

### What Was Not Fixable

Some structural differences are inherent to how the two parsers model Kotlin
syntax and cannot be reconciled with simple node-level transformations:

- **Method call nesting order** -- PSI nests as
  `CALL_EXPRESSION > DOT_QUALIFIED_EXPRESSION`, while tree-sitter nests as
  `call_expression > navigation_expression`. The child ordering is inverted.
- **`!is` / `!in` expressions** -- PSI uses `BINARY_WITH_TYPE > OPERATION_REFERENCE(NOT_IS)`,
  while tree-sitter produces a different nesting with prefix negation.
- **Delegation specifiers** -- PSI uses `SUPER_TYPE_LIST > SUPER_TYPE_CALL_ENTRY`
  with constructor arguments; tree-sitter uses `delegation_specifier` with a
  different child structure.
- **Annotation use-site targets** -- PSI wraps these in `ANNOTATION_ENTRY` with
  a `TARGET` child; tree-sitter produces a flat structure.

### Progression

| Round | Match Rate | Key Fix |
|-------|-----------|---------|
| Baseline | 1/118 (0.8%) | Only `const.kt` matched |
| Round 1 | 8/118 (6.8%) | Empty PACKAGE_DIRECTIVE / IMPORT_LIST removal |
| Round 2 | 14/118 (11.9%) | REFERENCE_EXPRESSION skip, identifier skip |
| Round 3 | 21/118 (17.8%) | DOT_QUALIFIED_EXPRESSION chain collapsing |
| Round 4 | 29/118 (24.6%) | MODIFIER_LIST handling, function_body mapping |
| Round 5 | 38/118 (32.2%) | control_structure_body, statements transparency |
| Round 6 | 48/118 (40.7%) | VALUE_PARAMETER_LIST injection |
| Round 7 | 57/118 (48.3%) | PROPERTY_ACCESSOR nesting |
| Round 8 | 66/118 (55.9%) | RETURN/THROW/BREAK/CONTINUE skip, edge cases |
| Round 9 | 68/118 (57.6%) | FUNCTION_TYPE_RECEIVER unwrap for extension fns/properties |
| Round 10 | 73/118 (61.9%) | CALL_EXPRESSION flattening, FUNCTION_LITERAL > BLOCK, CLASS_INITIALIZER > BLOCK, OBJECT_LITERAL > OBJECT_DECLARATION |
| Round 11 | 75/118 (63.6%) | VALUE_PARAMETER wrapping in function_type_parameters |

## Per-File Results

| # | File | Status | Details |
|---|------|--------|---------|
| 1 | AbsentInnerType | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 2 | AnnotatedIntersections | TS_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 3 | AnonymousInitializer | MATCH | Structurally identical |
| 4 | AssertNotNull | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 5 | BabySteps | MATCH | Structurally identical |
| 6 | BabySteps_ERR | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 7 | BackslashInString | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 8 | BlockCommentAtBeginningOfFile1 | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 9 | BlockCommentAtBeginningOfFile2 | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 10 | BlockCommentAtBeginningOfFile3 | MISMATCH | 2 difference(s) |
| 11 | BlockCommentAtBeginningOfFile4 | MISMATCH | 2 difference(s) |
| 12 | BlockCommentUnmatchedClosing_ERR | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 13 | ByClauses | MISMATCH | 54 difference(s) |
| 14 | CallWithManyClosures | MATCH | Structurally identical |
| 15 | CallsInWhen | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 16 | CollectionLiterals | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 17 | CollectionLiterals_ERR | TS_ERROR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 18 | CommentsBinding | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 19 | CommentsBindingInLambda | MISMATCH | 17 difference(s) |
| 20 | CommentsBindingInStatementBlock | MATCH | Structurally identical |
| 21 | Constructors | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 22 | ControlStructures | TS_ERROR | 8 ERROR/MISSING node(s) in tree-sitter output |
| 23 | DefaultKeyword | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 24 | DefinitelyNotNullType | TS_ERROR | 14 ERROR/MISSING node(s) in tree-sitter output |
| 25 | DocCommentAfterFileAnnotations | MISMATCH | 3 difference(s) |
| 26 | DocCommentForFirstDeclaration | MATCH | Structurally identical |
| 27 | DocCommentOnPackageDirectiveLine | MATCH | Structurally identical |
| 28 | DocCommentsBinding | MATCH | Structurally identical |
| 29 | DoubleColon | TS_ERROR | 11 ERROR/MISSING node(s) in tree-sitter output |
| 30 | DoubleColonWhitespaces | TS_ERROR | 8 ERROR/MISSING node(s) in tree-sitter output |
| 31 | DoubleColon_ERR | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 32 | DuplicateAccessor | MISMATCH | 2 difference(s) |
| 33 | DynamicReceiver | MATCH | Structurally identical |
| 34 | DynamicSoftKeyword | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 35 | DynamicTypes | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 36 | EOLsInComments | MISMATCH | 6 difference(s) |
| 37 | EOLsOnRollback | MATCH | Structurally identical |
| 38 | EmptyFile | MATCH | Structurally identical |
| 39 | EmptyName | TS_ERROR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 40 | EnumCommas | MATCH | Structurally identical |
| 41 | EnumEntryCommaAnnotatedMember | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 42 | EnumEntryCommaInlineMember | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 43 | EnumEntryCommaMember | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 44 | EnumEntryCommaPublicMember | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 45 | EnumEntrySemicolonInlineMember | MATCH | Structurally identical |
| 46 | EnumEntrySemicolonMember | MATCH | Structurally identical |
| 47 | EnumEntrySpaceInlineMember | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 48 | EnumEntrySpaceMember | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 49 | EnumEntryTwoCommas | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 50 | EnumIn | MATCH | Structurally identical |
| 51 | EnumInline | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 52 | EnumInlinePublic | MATCH | Structurally identical |
| 53 | EnumMissingName | MISMATCH | 15 difference(s) |
| 54 | EnumOldConstructorSyntax | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 55 | EnumShortCommas | MISMATCH | 15 difference(s) |
| 56 | EnumShortWithOverload | MISMATCH | 30 difference(s) |
| 57 | EnumWithAnnotationKeyword | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 58 | Enums | MISMATCH | 15 difference(s) |
| 59 | Expressions_ERR | TS_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 60 | ExtensionsWithQNReceiver | MISMATCH | 12 difference(s) |
| 61 | FileStart_ERR | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 62 | FloatingPointLiteral | MATCH | Structurally identical |
| 63 | ForWithMultiDecl | TS_ERROR | 18 ERROR/MISSING node(s) in tree-sitter output |
| 64 | FunctionCalls | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 65 | FunctionExpressions | TS_ERROR | 60 ERROR/MISSING node(s) in tree-sitter output |
| 66 | FunctionExpressions_ERR | TS_ERROR | 29 ERROR/MISSING node(s) in tree-sitter output |
| 67 | FunctionLiterals | MISMATCH | 20 difference(s) |
| 68 | FunctionLiterals_ERR | TS_ERROR | 50 ERROR/MISSING node(s) in tree-sitter output |
| 69 | FunctionNoParameterList | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 70 | FunctionTypes | TS_ERROR | 31 ERROR/MISSING node(s) in tree-sitter output |
| 71 | Functions | TS_ERROR | 8 ERROR/MISSING node(s) in tree-sitter output |
| 72 | FunctionsWithoutName | TS_ERROR | 18 ERROR/MISSING node(s) in tree-sitter output |
| 73 | FunctionsWithoutName_ERR | TS_ERROR | 18 ERROR/MISSING node(s) in tree-sitter output |
| 74 | Functions_ERR | TS_ERROR | 12 ERROR/MISSING node(s) in tree-sitter output |
| 75 | HangOnLonelyModifier | MATCH | Structurally identical |
| 76 | IfWithPropery | MATCH | Structurally identical |
| 77 | ImportSoftKW | MATCH | Structurally identical |
| 78 | Imports | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 79 | Imports_ERR | TS_ERROR | 22 ERROR/MISSING node(s) in tree-sitter output |
| 80 | IncompleteFunctionLiteral | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 81 | Inner | MATCH | Structurally identical |
| 82 | IntegerLiteral | TS_ERROR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 83 | Interface | MATCH | Structurally identical |
| 84 | InterfaceWithEnumKeyword | TS_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 85 | Labels | TS_ERROR | 12 ERROR/MISSING node(s) in tree-sitter output |
| 86 | LineCommentAfterFileAnnotations | MISMATCH | 3 difference(s) |
| 87 | LineCommentForFirstDeclaration | MATCH | Structurally identical |
| 88 | LineCommentsInBlock | MATCH | Structurally identical |
| 89 | LocalDeclarations | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 90 | LongPackageName | MATCH | Structurally identical |
| 91 | ModifierAsSelector | MATCH | Structurally identical |
| 92 | MultiVariableDeclarations | TS_ERROR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 93 | NamedClassObject | MATCH | Structurally identical |
| 94 | NestedComments | MATCH | Structurally identical |
| 95 | NewLinesValidOperations | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 96 | NewlinesInParentheses | MISMATCH | 51 difference(s) |
| 97 | NonTypeBeforeDotInBaseClass | MISMATCH | 6 difference(s) |
| 98 | NotIsAndNotIn | MISMATCH | 1 difference(s) |
| 99 | ObjectLiteralAsStatement | MISMATCH | 14 difference(s) |
| 100 | ParameterNameMising | TS_ERROR | 9 ERROR/MISSING node(s) in tree-sitter output |
| 101 | ParameterType | TS_ERROR | 7 ERROR/MISSING node(s) in tree-sitter output |
| 102 | ParameterType_ERR | TS_ERROR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 103 | Precedence | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 104 | PrimaryConstructorModifiers_ERR | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 105 | Properties | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 106 | PropertiesFollowedByInitializers | TS_ERROR | 13 ERROR/MISSING node(s) in tree-sitter output |
| 107 | Properties_ERR | TS_ERROR | 9 ERROR/MISSING node(s) in tree-sitter output |
| 108 | PropertyInvokes | MATCH | Structurally identical |
| 109 | QuotedIdentifiers | MATCH | Structurally identical |
| 110 | Reserved | MATCH | Structurally identical |
| 111 | SemicolonAfterIf | MATCH | Structurally identical |
| 112 | SimpleClassMembers | MISMATCH | 8 difference(s) |
| 113 | SimpleClassMembers_ERR | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 114 | SimpleExpressions | MISMATCH | 136 difference(s) |
| 115 | SimpleIntersections | TS_ERROR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 116 | SimpleModifiers | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 117 | SoftKeywords | TS_ERROR | 7 ERROR/MISSING node(s) in tree-sitter output |
| 118 | SoftKeywordsInTypeArguments | TS_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 119 | StringTemplates | TS_ERROR | 18 ERROR/MISSING node(s) in tree-sitter output |
| 120 | Super | MISMATCH | 32 difference(s) |
| 121 | TraitConstructor | MATCH | Structurally identical |
| 122 | TripleDot | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 123 | TryRecovery | TS_ERROR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 124 | TypeAlias | MATCH | Structurally identical |
| 125 | TypeAlias_ERR | TS_ERROR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 126 | TypeConstraints | MATCH | Structurally identical |
| 127 | TypeExpressionAmbiguities_ERR | TS_ERROR | 7 ERROR/MISSING node(s) in tree-sitter output |
| 128 | TypeModifiers | MISMATCH | 86 difference(s) |
| 129 | TypeModifiersParenthesized | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 130 | TypeModifiers_ERR | TS_ERROR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 131 | TypeParametersBeforeName | MISMATCH | 9 difference(s) |
| 132 | TypealiasIsKeyword | MISMATCH | 4 difference(s) |
| 133 | UnderscoredTypeArgumentsOfCall | MATCH | Structurally identical |
| 134 | UnderscoredTypeArgumentsOfCallIllegal | MATCH | Structurally identical |
| 135 | UnderscoredTypeArgumentsOfType | MATCH | Structurally identical |
| 136 | UnderscoredTypeParameters | MATCH | Structurally identical |
| 137 | UnsignedLiteral | TS_ERROR | 12 ERROR/MISSING node(s) in tree-sitter output |
| 138 | When | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 139 | WhenWithSubjectVariable | TS_ERROR | 26 ERROR/MISSING node(s) in tree-sitter output |
| 140 | WhenWithSubjectVariable_ERR | TS_ERROR | 11 ERROR/MISSING node(s) in tree-sitter output |
| 141 | WhenWithSubjectVariable_SoftModifierName | MATCH | Structurally identical |
| 142 | When_ERR | TS_ERROR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 143 | annotatedFlexibleTypes | TS_ERROR | 8 ERROR/MISSING node(s) in tree-sitter output |
| 144 | annotatedParameterInEnumConstructor | MISMATCH | 6 difference(s) |
| 145 | annotatedParameterInInnerClassConstructor | MATCH | Structurally identical |
| 146 | annotationClass | MATCH | Structurally identical |
| 147 | annotationValues | MISMATCH | 11 difference(s) |
| 148 | annotations | MISMATCH | 66 difference(s) |
| 149 | annotationsOnNullableTypes | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 150 | annotationsOnParenthesizedTypes | MISMATCH | 63 difference(s) |
| 151 | anonymousReturnWithGenericType | MATCH | Structurally identical |
| 152 | classMembers | MATCH | Structurally identical |
| 153 | classObject | MATCH | Structurally identical |
| 154 | complicateLTGT | MISMATCH | 15 difference(s) |
| 155 | complicateLTGTE | MATCH | Structurally identical |
| 156 | const | MATCH | Structurally identical |
| 157 | contextParametersAndAnnotations | TS_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 158 | dataClass | MATCH | Structurally identical |
| 159 | dataObject | MATCH | Structurally identical |
| 160 | defaultImplsInInterface | MATCH | Structurally identical |
| 161 | definitelyNotNullTypes | MISMATCH | 8 difference(s) |
| 162 | delegatedWithInitializer | MATCH | Structurally identical |
| 163 | delegation | MISMATCH | 4 difference(s) |
| 164 | dependencyOnNestedClasses | MISMATCH | 24 difference(s) |
| 165 | destructuringInLambdas | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 166 | destructuringInLambdas_ERR | TS_ERROR | 7 ERROR/MISSING node(s) in tree-sitter output |
| 167 | diagnosticTags_ERR | TS_ERROR | 41 ERROR/MISSING node(s) in tree-sitter output |
| 168 | emptyArguments | TS_ERROR | 18 ERROR/MISSING node(s) in tree-sitter output |
| 169 | emptyArgumentsInAnnotations | TS_ERROR | 25 ERROR/MISSING node(s) in tree-sitter output |
| 170 | emptyArgumentsInArrayAccesses | TS_ERROR | 8 ERROR/MISSING node(s) in tree-sitter output |
| 171 | emptyContextParameters | TS_ERROR | 64 ERROR/MISSING node(s) in tree-sitter output |
| 172 | emptyEnum | MATCH | Structurally identical |
| 173 | emptyParameters | TS_ERROR | 51 ERROR/MISSING node(s) in tree-sitter output |
| 174 | emptyParametersInFunctionalTypes | TS_ERROR | 87 ERROR/MISSING node(s) in tree-sitter output |
| 175 | enum | MATCH | Structurally identical |
| 176 | enumEntryContent | MATCH | Structurally identical |
| 177 | escapedNames | TS_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 178 | flexibleDnnType | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 179 | funInterfaceDeclaration | MATCH | Structurally identical |
| 180 | incorrectLTGTFallback | MISMATCH | 80 difference(s) |
| 181 | inheritingClasses | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 182 | innerClassEnumEntry | MATCH | Structurally identical |
| 183 | innerTypes | MISMATCH | 34 difference(s) |
| 184 | internalConst | MATCH | Structurally identical |
| 185 | kotlinFunInterface_ERR | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 186 | localClass | MISMATCH | 6 difference(s) |
| 187 | modifiers | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 188 | multifileClass | TS_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 189 | multifileClass2 | TS_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 190 | mustUseReturnValueAndOverrides | MATCH | Structurally identical |
| 191 | mustUseReturnValueFullEnabled | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 192 | mustUseReturnValueHalfEnabled | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 193 | namedCompanionObject | MATCH | Structurally identical |
| 194 | namelessObjectAsEnumMember | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 195 | nestedClasses | MATCH | Structurally identical |
| 196 | noCommaBetweenArguments | TS_ERROR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 197 | objects | MATCH | Structurally identical |
| 198 | parameterizedSuspendFunctionType | MATCH | Structurally identical |
| 199 | parameterizedSuspendFunctionTypeComplex | MATCH | Structurally identical |
| 200 | privateConstField | MATCH | Structurally identical |
| 201 | privateToThis | MATCH | Structurally identical |
| 202 | propertyAccessors | MATCH | Structurally identical |
| 203 | propertyWithConstraints | MATCH | Structurally identical |
| 204 | repeatableAnnotation | MATCH | Structurally identical |
| 205 | repeatableAnnotationClass | MATCH | Structurally identical |
| 206 | sealed | MATCH | Structurally identical |
| 207 | sealedInterface | MATCH | Structurally identical |
| 208 | semicolonBetweenDeclarations | TS_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 209 | specialNames | MATCH | Structurally identical |
| 210 | suggestGuardSyntax | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 211 | suspendLambda | MISMATCH | 102 difference(s) |
| 212 | topJvmPackageName | MISMATCH | 35 difference(s) |
| 213 | topJvmPackageNameMultifile | MISMATCH | 36 difference(s) |
| 214 | topLevelMembers | MISMATCH | 6 difference(s) |
| 215 | topLevelMembersAnnotated | TS_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 216 | trailingCommaAllowed | TS_ERROR | 12 ERROR/MISSING node(s) in tree-sitter output |
| 217 | trailingCommaForbidden | TS_ERROR | 31 ERROR/MISSING node(s) in tree-sitter output |
| 218 | typeAliasExpansion | MISMATCH | 26 difference(s) |
| 219 | typeAliasWithConstraints | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 220 | typeAliases | TS_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 221 | typeBoundsAndDelegationSpecifiers | MATCH | Structurally identical |
| 222 | typeModifiers2 | MISMATCH | 4 difference(s) |
| 223 | typeParams | MISMATCH | 3 difference(s) |
| 224 | types | MISMATCH | 8 difference(s) |
| 225 | underscoreParameterName | MATCH | Structurally identical |
| 226 | validKotlinFunInterface | MATCH | Structurally identical |
| 227 | valueClass | TS_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 228 | varargArgumentWithFunctionalType | MATCH | Structurally identical |

## Detailed Mismatches

Showing structural differences for 43 mismatching file(s).

### BlockCommentAtBeginningOfFile3

- **[child_count_mismatch]** at `KtFile`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > [child 0]`
  - expected: `(absent)`
  - actual: `BINARY_EXPRESSION`

### BlockCommentAtBeginningOfFile4

- **[child_count_mismatch]** at `KtFile`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > [child 0]`
  - expected: `(absent)`
  - actual: `BINARY_EXPRESSION`

### ByClauses

- **[child_count_mismatch]** at `KtFile > CLASS`
  - expected: `2`
  - actual: `1`
- **[child_count_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > [child 1]`
  - expected: `(absent)`
  - actual: `CALL_EXPRESSION`
- **[missing_child]** at `KtFile > CLASS > [child 1]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > BINARY_EXPRESSION > BINARY_EXPRESSION > INTEGER_CONSTANT`
  - expected: `INTEGER_CONSTANT`
  - actual: `CALL_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > BINARY_EXPRESSION > BINARY_EXPRESSION > INTEGER_CONSTANT`
  - expected: `0`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > BINARY_EXPRESSION > BINARY_EXPRESSION > INTEGER_CONSTANT > [child 0]`
  - expected: `(absent)`
  - actual: `INTEGER_CONSTANT`
- **[extra_child]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > BINARY_EXPRESSION > BINARY_EXPRESSION > INTEGER_CONSTANT > [child 1]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[missing_child]** at `KtFile > CLASS > [child 1]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > PARENTHESIZED`
  - expected: `PARENTHESIZED`
  - actual: `CALL_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > PARENTHESIZED`
  - expected: `0`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > PARENTHESIZED > [child 0]`
  - expected: `(absent)`
  - actual: `PARENTHESIZED`
- **[extra_child]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > PARENTHESIZED > [child 1]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[missing_child]** at `KtFile > CLASS > [child 1]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > PARENTHESIZED`
  - expected: `PARENTHESIZED`
  - actual: `CALL_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > PARENTHESIZED`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > PARENTHESIZED > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `PARENTHESIZED`

*... and 34 more difference(s)*

### CommentsBindingInLambda

- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK`
  - expected: `BLOCK`
  - actual: `CALL_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK > CALL_EXPRESSION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK > CALL_EXPRESSION > [child 0]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK > [child 1]`
  - expected: `CALL_EXPRESSION`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > PROPERTY > FUNCTION_LITERAL > [child 1]`
  - expected: `(absent)`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK`
  - expected: `BLOCK`
  - actual: `PROPERTY`
- **[name_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK > PROPERTY`
  - expected: `PROPERTY`
  - actual: `INTEGER_CONSTANT`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK > PROPERTY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK > PROPERTY > [child 0]`
  - expected: `INTEGER_CONSTANT`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `BLOCK`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > PROPERTY > FUNCTION_LITERAL > VALUE_PARAMETER_LIST > [child 0]`
  - expected: `VALUE_PARAMETER`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > PROPERTY > FUNCTION_LITERAL > [child 1]`
  - expected: `BLOCK`
  - actual: `(absent)`

### DocCommentAfterFileAnnotations

- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_TARGET`
  - expected: `ANNOTATION_TARGET`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > [child 1]`
  - expected: `ANNOTATION_ENTRY`
  - actual: `(absent)`

### DuplicateAccessor

- **[child_count_mismatch]** at `KtFile > PROPERTY`
  - expected: `2`
  - actual: `3`
- **[extra_child]** at `KtFile > PROPERTY > [child 2]`
  - expected: `(absent)`
  - actual: `PROPERTY_ACCESSOR`

### EOLsInComments

- **[name_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `BINARY_EXPRESSION`

### EnumMissingName

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`

### EnumShortCommas

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`

### EnumShortWithOverload

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `3`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `CLASS_BODY`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `VALUE_ARGUMENT`
  - actual: `FUN`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > INTEGER_CONSTANT`
  - expected: `INTEGER_CONSTANT`
  - actual: `USER_TYPE`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > [child 1]`
  - expected: `(absent)`
  - actual: `BLOCK`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 2]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `3`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `CLASS_BODY`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `VALUE_ARGUMENT`
  - actual: `FUN`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > INTEGER_CONSTANT`
  - expected: `INTEGER_CONSTANT`
  - actual: `USER_TYPE`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > [child 1]`
  - expected: `(absent)`
  - actual: `BLOCK`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 2]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`

*... and 10 more difference(s)*

### Enums

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`

### ExtensionsWithQNReceiver

- **[child_count_mismatch]** at `KtFile > PROPERTY > USER_TYPE`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > PROPERTY > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > PROPERTY > USER_TYPE > USER_TYPE`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > PROPERTY > USER_TYPE > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_PROJECTION`
- **[extra_child]** at `KtFile > PROPERTY > USER_TYPE > USER_TYPE > [child 1]`
  - expected: `(absent)`
  - actual: `TYPE_PROJECTION`
- **[missing_child]** at `KtFile > PROPERTY > USER_TYPE > [child 1]`
  - expected: `TYPE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > FUN > USER_TYPE`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > FUN > USER_TYPE > USER_TYPE`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > FUN > USER_TYPE > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_PROJECTION`
- **[extra_child]** at `KtFile > FUN > USER_TYPE > USER_TYPE > [child 1]`
  - expected: `(absent)`
  - actual: `TYPE_PROJECTION`
- **[missing_child]** at `KtFile > FUN > USER_TYPE > [child 1]`
  - expected: `TYPE_ARGUMENT_LIST`
  - actual: `(absent)`

### FunctionLiterals

- **[child_count_mismatch]** at `KtFile > FUN > BLOCK`
  - expected: `8`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL`
  - expected: `FUNCTION_LITERAL`
  - actual: `CALL_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL`
  - expected: `1`
  - actual: `8`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > BLOCK`
  - expected: `BLOCK`
  - actual: `FUNCTION_LITERAL`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > BLOCK`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > BLOCK > [child 0]`
  - expected: `(absent)`
  - actual: `BLOCK`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > [child 1]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > [child 2]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > [child 3]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > [child 4]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > [child 5]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > [child 6]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[extra_child]** at `KtFile > FUN > BLOCK > FUNCTION_LITERAL > [child 7]`
  - expected: `(absent)`
  - actual: `FUNCTION_LITERAL`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 1]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 2]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 3]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 4]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 5]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 6]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 7]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`

### LineCommentAfterFileAnnotations

- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_TARGET`
  - expected: `ANNOTATION_TARGET`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > [child 1]`
  - expected: `ANNOTATION_ENTRY`
  - actual: `(absent)`

### NewlinesInParentheses

- **[child_count_mismatch]** at `KtFile > FUN > BLOCK`
  - expected: `12`
  - actual: `11`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > PROPERTY > [child 0]`
  - expected: `(absent)`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `PROPERTY`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION > [child 0]`
  - expected: `(absent)`
  - actual: `PARENTHESIZED`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION`
  - expected: `BINARY_EXPRESSION`
  - actual: `FUNCTION_LITERAL`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION > [child 0]`
  - expected: `(absent)`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > FUNCTION_LITERAL`
  - expected: `FUNCTION_LITERAL`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > FUNCTION_LITERAL > BLOCK`
  - expected: `BLOCK`
  - actual: `FUNCTION_LITERAL`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > FUNCTION_LITERAL > BLOCK > PREFIX_EXPRESSION`
  - expected: `PREFIX_EXPRESSION`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED`
  - expected: `PARENTHESIZED`
  - actual: `ARRAY_ACCESS_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION`
  - expected: `BINARY_EXPRESSION`
  - actual: `INDICES`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION > FUNCTION_LITERAL`
  - expected: `FUNCTION_LITERAL`
  - actual: `BINARY_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION > FUNCTION_LITERAL`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION > FUNCTION_LITERAL > [child 0]`
  - expected: `BLOCK`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > ARRAY_ACCESS_EXPRESSION > INDICES > BINARY_EXPRESSION`
  - expected: `BINARY_EXPRESSION`
  - actual: `FUNCTION_LITERAL`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > PROPERTY > ARRAY_ACCESS_EXPRESSION > INDICES > BINARY_EXPRESSION`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > PROPERTY > ARRAY_ACCESS_EXPRESSION > INDICES > BINARY_EXPRESSION > [child 0]`
  - expected: `(absent)`
  - actual: `BINARY_EXPRESSION`

*... and 31 more difference(s)*

### NonTypeBeforeDotInBaseClass

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY`
  - expected: `2`
  - actual: `1`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS`
  - expected: `0`
  - actual: `3`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > [child 1]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT_LIST`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > [child 2]`
  - expected: `(absent)`
  - actual: `CLASS_BODY`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > [child 1]`
  - expected: `FUN`
  - actual: `(absent)`

### NotIsAndNotIn

- **[name_mismatch]** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - expected: `BINARY_EXPRESSION`
  - actual: `IS_EXPRESSION`

### ObjectLiteralAsStatement

- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION`
  - expected: `DOT_QUALIFIED_EXPRESSION`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL`
  - expected: `OBJECT_LITERAL`
  - actual: `DOT_QUALIFIED_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION`
  - expected: `OBJECT_DECLARATION`
  - actual: `OBJECT_LITERAL`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION`
  - expected: `3`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `OBJECT_DECLARATION`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE`
  - expected: `0`
  - actual: `3`
- **[extra_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[extra_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE > [child 1]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT_LIST`
- **[extra_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE > [child 2]`
  - expected: `(absent)`
  - actual: `CLASS_BODY`
- **[missing_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > OBJECT_LITERAL > OBJECT_DECLARATION > [child 2]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION > [child 0]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`

### SimpleClassMembers

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > OBJECT_DECLARATION > CLASS_BODY > OBJECT_DECLARATION`
  - expected: `3`
  - actual: `2`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > OBJECT_DECLARATION > CLASS_BODY > OBJECT_DECLARATION > DELEGATED_SUPER_TYPE_ENTRY`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > OBJECT_DECLARATION > CLASS_BODY > OBJECT_DECLARATION > DELEGATED_SUPER_TYPE_ENTRY > [child 1]`
  - expected: `(absent)`
  - actual: `CALL_EXPRESSION`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > OBJECT_DECLARATION > CLASS_BODY > OBJECT_DECLARATION > [child 2]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > OBJECT_DECLARATION`
  - expected: `3`
  - actual: `2`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > OBJECT_DECLARATION > DELEGATED_SUPER_TYPE_ENTRY`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > OBJECT_DECLARATION > DELEGATED_SUPER_TYPE_ENTRY > [child 1]`
  - expected: `(absent)`
  - actual: `CALL_EXPRESSION`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > OBJECT_DECLARATION > [child 2]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`

### SimpleExpressions

- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - expected: `34`
  - actual: `65`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `INTEGER_CONSTANT`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `VALUE_PARAMETER`
  - actual: `INTEGER_CONSTANT`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `INTEGER_CONSTANT`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `CHARACTER_CONSTANT`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `VALUE_PARAMETER`
  - actual: `INTEGER_CONSTANT`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `STRING_TEMPLATE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `STRING_TEMPLATE`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `VALUE_PARAMETER`
  - actual: `CHARACTER_CONSTANT`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `FLOAT_CONSTANT`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`

*... and 116 more difference(s)*

### Super

- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION`
  - expected: `DOT_QUALIFIED_EXPRESSION`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION`
  - expected: `SUPER_EXPRESSION`
  - actual: `DOT_QUALIFIED_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION > [child 0]`
  - expected: `(absent)`
  - actual: `SUPER_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION > [child 0]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION`
  - expected: `DOT_QUALIFIED_EXPRESSION`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION`
  - expected: `SUPER_EXPRESSION`
  - actual: `DOT_QUALIFIED_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `SUPER_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION > [child 0]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION`
  - expected: `DOT_QUALIFIED_EXPRESSION`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION`
  - expected: `SUPER_EXPRESSION`
  - actual: `DOT_QUALIFIED_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > SUPER_EXPRESSION > [child 0]`
  - expected: `(absent)`
  - actual: `SUPER_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`

*... and 12 more difference(s)*

### TypeModifiers

- **[name_mismatch]** at `KtFile > PROPERTY > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[name_mismatch]** at `KtFile > PROPERTY > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > PROPERTY > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > PROPERTY > MODIFIER_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > MODIFIER_LIST`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > MODIFIER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[name_mismatch]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `2`
  - actual: `3`
- **[name_mismatch]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[child_count_mismatch]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`

*... and 66 more difference(s)*

### TypeParametersBeforeName

- **[child_count_mismatch]** at `KtFile > FUN`
  - expected: `1`
  - actual: `3`
- **[child_count_mismatch]** at `KtFile > FUN > TYPE_PARAMETER_LIST`
  - expected: `3`
  - actual: `2`
- **[missing_child]** at `KtFile > FUN > TYPE_PARAMETER_LIST > [child 2]`
  - expected: `ANNOTATION_ENTRY`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > FUN > [child 1]`
  - expected: `(absent)`
  - actual: `ANNOTATION_ENTRY`
- **[extra_child]** at `KtFile > FUN > [child 2]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[name_mismatch]** at `KtFile > FUN > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[name_mismatch]** at `KtFile > FUN > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > FUN > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > MODIFIER_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`

### TypealiasIsKeyword

- **[child_count_mismatch]** at `KtFile`
  - expected: `2`
  - actual: `1`
- **[child_count_mismatch]** at `KtFile > PROPERTY`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > PROPERTY > [child 0]`
  - expected: `(absent)`
  - actual: `INTEGER_CONSTANT`
- **[missing_child]** at `KtFile > [child 1]`
  - expected: `TYPEALIAS`
  - actual: `(absent)`

### annotatedParameterInEnumConstructor

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > USER_TYPE > [child 1]`
  - expected: `(absent)`
  - actual: `VALUE_ARGUMENT`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > [child 1]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`

### annotationValues

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > DOT_QUALIFIED_EXPRESSION`
  - expected: `DOT_QUALIFIED_EXPRESSION`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > DOT_QUALIFIED_EXPRESSION > INTEGER_CONSTANT`
  - expected: `INTEGER_CONSTANT`
  - actual: `DOT_QUALIFIED_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > DOT_QUALIFIED_EXPRESSION > INTEGER_CONSTANT`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > DOT_QUALIFIED_EXPRESSION > INTEGER_CONSTANT > [child 0]`
  - expected: `(absent)`
  - actual: `INTEGER_CONSTANT`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION > [child 0]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > [child 0]`
  - expected: `(absent)`
  - actual: `CALLABLE_REFERENCE_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > [child 0]`
  - expected: `(absent)`
  - actual: `CALLABLE_REFERENCE_EXPRESSION`

### annotations

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > MODIFIER_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `VALUE_PARAMETER`
  - actual: `ANNOTATION_ENTRY`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > MODIFIER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > MODIFIER_LIST > [child 0]`
  - expected: `ANNOTATION_ENTRY`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `VALUE_PARAMETER`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `VALUE_PARAMETER`
  - actual: `ANNOTATION_ENTRY`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `USER_TYPE`

*... and 46 more difference(s)*

### annotationsOnParenthesizedTypes

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > MODIFIER_LIST`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > MODIFIER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN`
  - expected: `3`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `POSTFIX_EXPRESSION`

*... and 43 more difference(s)*

### complicateLTGT

- **[child_count_mismatch]** at `KtFile > FUN > BLOCK`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `BINARY_EXPRESSION`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST`
  - expected: `TYPE_ARGUMENT_LIST`
  - actual: `PARENTHESIZED`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `TYPE_PROJECTION`
  - actual: `IF`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `1`
  - actual: `3`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > FUNCTION_TYPE`
  - expected: `FUNCTION_TYPE`
  - actual: `BINARY_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > FUNCTION_TYPE`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > FUNCTION_TYPE > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `INTEGER_CONSTANT`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > FUNCTION_TYPE > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > FUNCTION_TYPE > VALUE_PARAMETER_LIST > [child 0]`
  - expected: `VALUE_PARAMETER`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > FUNCTION_TYPE > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > [child 1]`
  - expected: `(absent)`
  - actual: `INTEGER_CONSTANT`
- **[extra_child]** at `KtFile > FUN > BLOCK > IF > CALL_EXPRESSION > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > [child 2]`
  - expected: `(absent)`
  - actual: `INTEGER_CONSTANT`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > IF > INTEGER_CONSTANT`
  - expected: `INTEGER_CONSTANT`
  - actual: `BLOCK`
- **[missing_child]** at `KtFile > FUN > BLOCK > [child 1]`
  - expected: `FUNCTION_LITERAL`
  - actual: `(absent)`

### definitelyNotNullTypes

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > IF > DOT_QUALIFIED_EXPRESSION`
  - expected: `DOT_QUALIFIED_EXPRESSION`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > IF > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > IF > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > IF > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION > [child 0]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `2`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `VALUE_PARAMETER`

### delegation

- **[child_count_mismatch]** at `KtFile > CLASS`
  - expected: `3`
  - actual: `2`
- **[child_count_mismatch]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY`
  - expected: `1`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > [child 1]`
  - expected: `(absent)`
  - actual: `CALL_EXPRESSION`
- **[missing_child]** at `KtFile > CLASS > [child 2]`
  - expected: `CLASS_BODY`
  - actual: `(absent)`

### dependencyOnNestedClasses

- **[child_count_mismatch]** at `KtFile > CLASS > USER_TYPE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > USER_TYPE > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION`
  - expected: `DOT_QUALIFIED_EXPRESSION`
  - actual: `CALL_EXPRESSION`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `CALL_EXPRESSION`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > DOT_QUALIFIED_EXPRESSION > CALL_EXPRESSION > [child 0]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > CLASS`
  - expected: `CLASS`
  - actual: `BINARY_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > CLASS`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY`
  - expected: `CLASS_BODY`
  - actual: `BINARY_EXPRESSION`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY`
  - expected: `3`
  - actual: `0`

*... and 4 more difference(s)*

### incorrectLTGTFallback

- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `BLOCK`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST > [child 0]`
  - expected: `VALUE_PARAMETER`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > [child 1]`
  - expected: `BLOCK`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `BLOCK`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST > [child 0]`
  - expected: `VALUE_PARAMETER`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > [child 1]`
  - expected: `BLOCK`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `BLOCK`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST > [child 0]`
  - expected: `VALUE_PARAMETER`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > [child 1]`
  - expected: `BLOCK`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `BLOCK`
- **[child_count_mismatch]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > VALUE_PARAMETER_LIST > [child 0]`
  - expected: `VALUE_PARAMETER`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FUN > BLOCK > CALL_EXPRESSION > FUNCTION_LITERAL > [child 1]`
  - expected: `BLOCK`
  - actual: `(absent)`

*... and 60 more difference(s)*

### innerTypes

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST`
  - expected: `TYPE_ARGUMENT_LIST`
  - actual: `TYPE_PROJECTION`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `TYPE_PROJECTION`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > [child 1]`
  - expected: `TYPE_PROJECTION`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > [child 1]`
  - expected: `(absent)`
  - actual: `TYPE_PROJECTION`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - expected: `2`
  - actual: `3`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_ARGUMENT_LIST`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_PROJECTION`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST`
  - expected: `TYPE_ARGUMENT_LIST`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST`
  - expected: `2`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > [child 0]`
  - expected: `TYPE_PROJECTION`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > [child 1]`
  - expected: `TYPE_PROJECTION`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST`
  - expected: `TYPE_ARGUMENT_LIST`
  - actual: `TYPE_PROJECTION`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `TYPE_PROJECTION`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - expected: `1`
  - actual: `0`

*... and 14 more difference(s)*

### localClass

- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL > BLOCK`
  - expected: `BLOCK`
  - actual: `CLASS`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL > BLOCK`
  - expected: `2`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL > BLOCK > [child 0]`
  - expected: `CLASS`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL > BLOCK > [child 1]`
  - expected: `CALL_EXPRESSION`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL > [child 1]`
  - expected: `(absent)`
  - actual: `CALL_EXPRESSION`

### suspendLambda

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE`
  - expected: `FUNCTION_TYPE`
  - actual: `PARENTHESIZED`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `FUNCTION_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE`
  - expected: `FUNCTION_TYPE`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER`
  - expected: `FUNCTION_TYPE_RECEIVER`
  - actual: `FUNCTION_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `FUNCTION_TYPE_RECEIVER`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > FUN > FUNCTION_TYPE > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN`
  - expected: `4`
  - actual: `3`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `PARENTHESIZED`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `FUNCTION_TYPE`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET`
  - expected: `ANNOTATION_TARGET`
  - actual: `FUNCTION_TYPE_RECEIVER`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET`
  - expected: `0`
  - actual: `2`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET > [child 0]`
  - expected: `(absent)`
  - actual: `ANNOTATION_ENTRY`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > MODIFIER_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`

*... and 82 more difference(s)*

### topJvmPackageName

- **[child_count_mismatch]** at `KtFile`
  - expected: `3`
  - actual: `5`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST`
  - expected: `3`
  - actual: `2`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `3`
  - actual: `0`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `ANNOTATION_TARGET`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > [child 2]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `3`
  - actual: `4`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET`
  - expected: `ANNOTATION_TARGET`
  - actual: `VALUE_ARGUMENT`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET > [child 0]`
  - expected: `(absent)`
  - actual: `STRING_TEMPLATE`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `STRING_TEMPLATE`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `VALUE_ARGUMENT`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `VALUE_ARGUMENT`
  - actual: `STRING_TEMPLATE`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > STRING_TEMPLATE`
  - expected: `STRING_TEMPLATE`
  - actual: `LITERAL_STRING_TEMPLATE_ENTRY`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > STRING_TEMPLATE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > STRING_TEMPLATE > [child 0]`
  - expected: `LITERAL_STRING_TEMPLATE_ENTRY`
  - actual: `(absent)`

*... and 15 more difference(s)*

### topJvmPackageNameMultifile

- **[child_count_mismatch]** at `KtFile`
  - expected: `3`
  - actual: `6`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST`
  - expected: `4`
  - actual: `2`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `3`
  - actual: `0`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `ANNOTATION_TARGET`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > [child 2]`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `VALUE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY`
  - expected: `3`
  - actual: `4`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET`
  - expected: `ANNOTATION_TARGET`
  - actual: `VALUE_ARGUMENT`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > ANNOTATION_TARGET > [child 0]`
  - expected: `(absent)`
  - actual: `STRING_TEMPLATE`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_ARGUMENT`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `STRING_TEMPLATE`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST`
  - expected: `VALUE_ARGUMENT_LIST`
  - actual: `VALUE_ARGUMENT`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - expected: `VALUE_ARGUMENT`
  - actual: `STRING_TEMPLATE`
- **[name_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > STRING_TEMPLATE`
  - expected: `STRING_TEMPLATE`
  - actual: `LITERAL_STRING_TEMPLATE_ENTRY`
- **[child_count_mismatch]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > STRING_TEMPLATE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > FILE_ANNOTATION_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > STRING_TEMPLATE > [child 0]`
  - expected: `LITERAL_STRING_TEMPLATE_ENTRY`
  - actual: `(absent)`

*... and 16 more difference(s)*

### topLevelMembers

- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `2`
- **[child_count_mismatch]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `2`
  - actual: `1`
- **[missing_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > [child 1]`
  - expected: `INTEGER_CONSTANT`
  - actual: `(absent)`
- **[extra_child]** at `KtFile > FUN > VALUE_PARAMETER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `INTEGER_CONSTANT`
- **[child_count_mismatch]** at `KtFile > PROPERTY > USER_TYPE`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > PROPERTY > USER_TYPE > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`

### typeAliasExpansion

- **[child_count_mismatch]** at `KtFile > TYPEALIAS > USER_TYPE`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > TYPEALIAS > USER_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `TYPE_ARGUMENT_LIST`
- **[child_count_mismatch]** at `KtFile > TYPEALIAS > USER_TYPE > USER_TYPE`
  - expected: `0`
  - actual: `2`
- **[extra_child]** at `KtFile > TYPEALIAS > USER_TYPE > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `TYPE_PROJECTION`
- **[extra_child]** at `KtFile > TYPEALIAS > USER_TYPE > USER_TYPE > [child 1]`
  - expected: `(absent)`
  - actual: `TYPE_PROJECTION`
- **[missing_child]** at `KtFile > TYPEALIAS > USER_TYPE > [child 1]`
  - expected: `TYPE_ARGUMENT_LIST`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE`
  - expected: `FUNCTION_TYPE`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `FUNCTION_TYPE`
- **[child_count_mismatch]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `2`
- **[name_mismatch]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - expected: `VALUE_PARAMETER`
  - actual: `VALUE_PARAMETER_LIST`
- **[name_mismatch]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `VALUE_PARAMETER`
- **[child_count_mismatch]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[extra_child]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > VALUE_PARAMETER_LIST > [child 1]`
  - expected: `(absent)`
  - actual: `USER_TYPE`
- **[missing_child]** at `KtFile > TYPEALIAS > NULLABLE_TYPE > FUNCTION_TYPE > [child 1]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL`
  - expected: `2`
  - actual: `1`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `VALUE_PARAMETER_LIST`
  - actual: `BLOCK`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL > VALUE_PARAMETER_LIST`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL > VALUE_PARAMETER_LIST > [child 0]`
  - expected: `VALUE_PARAMETER`
  - actual: `(absent)`

*... and 6 more difference(s)*

### typeModifiers2

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > FUNCTION_TYPE`
  - expected: `FUNCTION_TYPE`
  - actual: `PARENTHESIZED`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > FUNCTION_TYPE > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `FUNCTION_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > FUNCTION_TYPE > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > FUNCTION_TYPE > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`

### typeParams

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE`
  - expected: `USER_TYPE`
  - actual: `PARENTHESIZED`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE`
  - expected: `0`
  - actual: `1`
- **[extra_child]** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > USER_TYPE > [child 0]`
  - expected: `(absent)`
  - actual: `USER_TYPE`

### types

- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > MODIFIER_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST`
  - expected: `MODIFIER_LIST`
  - actual: `ANNOTATION_ENTRY`
- **[name_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `ANNOTATION_ENTRY`
  - actual: `USER_TYPE`
- **[child_count_mismatch]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > ANNOTATION_ENTRY`
  - expected: `1`
  - actual: `0`
- **[missing_child]** at `KtFile > CLASS > CLASS_BODY > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > MODIFIER_LIST > ANNOTATION_ENTRY > [child 0]`
  - expected: `USER_TYPE`
  - actual: `(absent)`

## Common Mismatch Patterns

### By Difference Kind

| Kind | Total occurrences |
|------|-------------------|
| child_count_mismatch | 337 |
| name_mismatch | 310 |
| missing_child | 240 |
| extra_child | 193 |

### Most Common Specific Patterns

Patterns that appear in multiple files, grouped by (kind, expected, actual):

| Pattern | Files affected | Example files |
|---------|---------------|---------------|
| [child_count_mismatch] expected=`2` actual=`1` | 24 | ByClauses, CommentsBindingInLambda, DocCommentAfterFileAnnotations (+21 more) |
| [child_count_mismatch] expected=`0` actual=`1` | 20 | BlockCommentAtBeginningOfFile3, BlockCommentAtBeginningOfFile4, ByClauses (+17 more) |
| [child_count_mismatch] expected=`1` actual=`0` | 19 | CommentsBindingInLambda, NewlinesInParentheses, ObjectLiteralAsStatement (+16 more) |
| [child_count_mismatch] expected=`1` actual=`2` | 17 | ByClauses, CommentsBindingInLambda, EnumShortWithOverload (+14 more) |
| [missing_child] expected=`USER_TYPE` actual=`(absent)` | 16 | NewlinesInParentheses, SimpleExpressions, TypeModifiers (+13 more) |
| [extra_child] expected=`(absent)` actual=`USER_TYPE` | 13 | NonTypeBeforeDotInBaseClass, ObjectLiteralAsStatement, Super (+10 more) |
| [missing_child] expected=`VALUE_ARGUMENT_LIST` actual=`(absent)` | 12 | CommentsBindingInLambda, EnumMissingName, EnumShortCommas (+9 more) |
| [child_count_mismatch] expected=`0` actual=`2` | 8 | ByClauses, SimpleExpressions, annotatedParameterInEnumConstructor (+5 more) |
| [missing_child] expected=`BLOCK` actual=`(absent)` | 7 | CommentsBindingInLambda, NewlinesInParentheses, TypeModifiers (+4 more) |
| [missing_child] expected=`ANNOTATION_ENTRY` actual=`(absent)` | 7 | DocCommentAfterFileAnnotations, LineCommentAfterFileAnnotations, TypeModifiers (+4 more) |
| [extra_child] expected=`(absent)` actual=`VALUE_ARGUMENT` | 7 | EnumMissingName, EnumShortCommas, EnumShortWithOverload (+4 more) |
| [child_count_mismatch] expected=`3` actual=`2` | 7 | EnumShortWithOverload, SimpleClassMembers, TypeModifiers (+4 more) |
| [name_mismatch] expected=`ANNOTATION_ENTRY` actual=`USER_TYPE` | 7 | TypeModifiers, TypeParametersBeforeName, annotations (+4 more) |
| [extra_child] expected=`(absent)` actual=`CALL_EXPRESSION` | 6 | ByClauses, CommentsBindingInLambda, SimpleClassMembers (+3 more) |
| [extra_child] expected=`(absent)` actual=`INTEGER_CONSTANT` | 6 | ByClauses, SimpleExpressions, TypealiasIsKeyword (+3 more) |
| [name_mismatch] expected=`CALL_EXPRESSION` actual=`VALUE_ARGUMENT_LIST` | 6 | CommentsBindingInLambda, ObjectLiteralAsStatement, Super (+3 more) |
| [missing_child] expected=`CLASS_BODY` actual=`(absent)` | 5 | ByClauses, EnumShortWithOverload, ObjectLiteralAsStatement (+2 more) |
| [name_mismatch] expected=`USER_TYPE` actual=`VALUE_ARGUMENT_LIST` | 5 | EnumMissingName, EnumShortCommas, EnumShortWithOverload (+2 more) |
| [extra_child] expected=`(absent)` actual=`VALUE_ARGUMENT_LIST` | 5 | NonTypeBeforeDotInBaseClass, ObjectLiteralAsStatement, annotations (+2 more) |
| [name_mismatch] expected=`DOT_QUALIFIED_EXPRESSION` actual=`CALL_EXPRESSION` | 5 | ObjectLiteralAsStatement, Super, annotationValues (+2 more) |
| [child_count_mismatch] expected=`2` actual=`0` | 5 | SimpleExpressions, annotations, innerTypes (+2 more) |
| [name_mismatch] expected=`MODIFIER_LIST` actual=`ANNOTATION_ENTRY` | 5 | TypeModifiers, TypeParametersBeforeName, annotations (+2 more) |
| [extra_child] expected=`(absent)` actual=`BLOCK` | 4 | ByClauses, EnumShortWithOverload, FunctionLiterals (+1 more) |
| [missing_child] expected=`INTEGER_CONSTANT` actual=`(absent)` | 4 | CommentsBindingInLambda, SimpleExpressions, annotations (+1 more) |
| [missing_child] expected=`VALUE_PARAMETER` actual=`(absent)` | 4 | CommentsBindingInLambda, complicateLTGT, incorrectLTGTFallback (+1 more) |
| [child_count_mismatch] expected=`2` actual=`3` | 4 | DuplicateAccessor, TypeModifiers, annotations (+1 more) |
| [name_mismatch] expected=`USER_TYPE` actual=`TYPE_ARGUMENT_LIST` | 4 | ExtensionsWithQNReceiver, NewlinesInParentheses, innerTypes (+1 more) |
| [name_mismatch] expected=`FUNCTION_TYPE` actual=`PARENTHESIZED` | 4 | TypeModifiers, suspendLambda, typeAliasExpansion (+1 more) |
| [child_count_mismatch] expected=`3` actual=`0` | 4 | TypeModifiers, dependencyOnNestedClasses, topJvmPackageName (+1 more) |
| [extra_child] expected=`(absent)` actual=`BINARY_EXPRESSION` | 3 | BlockCommentAtBeginningOfFile3, BlockCommentAtBeginningOfFile4, NewlinesInParentheses |

## Tree-Sitter Parse Errors

110 file(s) had ERROR/MISSING nodes in tree-sitter output:

| # | File | Detail |
|---|------|--------|
| 1 | AbsentInnerType | 2 ERROR/MISSING node(s) in tree-sitter output |
| 2 | AnnotatedIntersections | 5 ERROR/MISSING node(s) in tree-sitter output |
| 3 | AssertNotNull | 2 ERROR/MISSING node(s) in tree-sitter output |
| 4 | BabySteps_ERR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 5 | BackslashInString | 3 ERROR/MISSING node(s) in tree-sitter output |
| 6 | BlockCommentAtBeginningOfFile1 | 2 ERROR/MISSING node(s) in tree-sitter output |
| 7 | BlockCommentAtBeginningOfFile2 | 2 ERROR/MISSING node(s) in tree-sitter output |
| 8 | BlockCommentUnmatchedClosing_ERR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 9 | CallsInWhen | 3 ERROR/MISSING node(s) in tree-sitter output |
| 10 | CollectionLiterals | 3 ERROR/MISSING node(s) in tree-sitter output |
| 11 | CollectionLiterals_ERR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 12 | CommentsBinding | 2 ERROR/MISSING node(s) in tree-sitter output |
| 13 | Constructors | 3 ERROR/MISSING node(s) in tree-sitter output |
| 14 | ControlStructures | 8 ERROR/MISSING node(s) in tree-sitter output |
| 15 | DefaultKeyword | 3 ERROR/MISSING node(s) in tree-sitter output |
| 16 | DefinitelyNotNullType | 14 ERROR/MISSING node(s) in tree-sitter output |
| 17 | DoubleColon | 11 ERROR/MISSING node(s) in tree-sitter output |
| 18 | DoubleColonWhitespaces | 8 ERROR/MISSING node(s) in tree-sitter output |
| 19 | DoubleColon_ERR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 20 | DynamicSoftKeyword | 4 ERROR/MISSING node(s) in tree-sitter output |
| 21 | DynamicTypes | 3 ERROR/MISSING node(s) in tree-sitter output |
| 22 | EmptyName | 10 ERROR/MISSING node(s) in tree-sitter output |
| 23 | EnumEntryCommaAnnotatedMember | 2 ERROR/MISSING node(s) in tree-sitter output |
| 24 | EnumEntryCommaInlineMember | 2 ERROR/MISSING node(s) in tree-sitter output |
| 25 | EnumEntryCommaMember | 2 ERROR/MISSING node(s) in tree-sitter output |
| 26 | EnumEntryCommaPublicMember | 2 ERROR/MISSING node(s) in tree-sitter output |
| 27 | EnumEntrySpaceInlineMember | 3 ERROR/MISSING node(s) in tree-sitter output |
| 28 | EnumEntrySpaceMember | 2 ERROR/MISSING node(s) in tree-sitter output |
| 29 | EnumEntryTwoCommas | 2 ERROR/MISSING node(s) in tree-sitter output |
| 30 | EnumInline | 2 ERROR/MISSING node(s) in tree-sitter output |
| 31 | EnumOldConstructorSyntax | 3 ERROR/MISSING node(s) in tree-sitter output |
| 32 | EnumWithAnnotationKeyword | 2 ERROR/MISSING node(s) in tree-sitter output |
| 33 | Expressions_ERR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 34 | FileStart_ERR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 35 | ForWithMultiDecl | 18 ERROR/MISSING node(s) in tree-sitter output |
| 36 | FunctionCalls | 2 ERROR/MISSING node(s) in tree-sitter output |
| 37 | FunctionExpressions | 60 ERROR/MISSING node(s) in tree-sitter output |
| 38 | FunctionExpressions_ERR | 29 ERROR/MISSING node(s) in tree-sitter output |
| 39 | FunctionLiterals_ERR | 50 ERROR/MISSING node(s) in tree-sitter output |
| 40 | FunctionNoParameterList | 2 ERROR/MISSING node(s) in tree-sitter output |
| 41 | FunctionTypes | 31 ERROR/MISSING node(s) in tree-sitter output |
| 42 | Functions | 8 ERROR/MISSING node(s) in tree-sitter output |
| 43 | FunctionsWithoutName | 18 ERROR/MISSING node(s) in tree-sitter output |
| 44 | FunctionsWithoutName_ERR | 18 ERROR/MISSING node(s) in tree-sitter output |
| 45 | Functions_ERR | 12 ERROR/MISSING node(s) in tree-sitter output |
| 46 | Imports | 2 ERROR/MISSING node(s) in tree-sitter output |
| 47 | Imports_ERR | 22 ERROR/MISSING node(s) in tree-sitter output |
| 48 | IncompleteFunctionLiteral | 2 ERROR/MISSING node(s) in tree-sitter output |
| 49 | IntegerLiteral | 10 ERROR/MISSING node(s) in tree-sitter output |
| 50 | InterfaceWithEnumKeyword | 5 ERROR/MISSING node(s) in tree-sitter output |
| 51 | Labels | 12 ERROR/MISSING node(s) in tree-sitter output |
| 52 | LocalDeclarations | 2 ERROR/MISSING node(s) in tree-sitter output |
| 53 | MultiVariableDeclarations | 10 ERROR/MISSING node(s) in tree-sitter output |
| 54 | NewLinesValidOperations | 2 ERROR/MISSING node(s) in tree-sitter output |
| 55 | ParameterNameMising | 9 ERROR/MISSING node(s) in tree-sitter output |
| 56 | ParameterType | 7 ERROR/MISSING node(s) in tree-sitter output |
| 57 | ParameterType_ERR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 58 | Precedence | 4 ERROR/MISSING node(s) in tree-sitter output |
| 59 | PrimaryConstructorModifiers_ERR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 60 | Properties | 4 ERROR/MISSING node(s) in tree-sitter output |
| 61 | PropertiesFollowedByInitializers | 13 ERROR/MISSING node(s) in tree-sitter output |
| 62 | Properties_ERR | 9 ERROR/MISSING node(s) in tree-sitter output |
| 63 | SimpleClassMembers_ERR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 64 | SimpleIntersections | 6 ERROR/MISSING node(s) in tree-sitter output |
| 65 | SimpleModifiers | 2 ERROR/MISSING node(s) in tree-sitter output |
| 66 | SoftKeywords | 7 ERROR/MISSING node(s) in tree-sitter output |
| 67 | SoftKeywordsInTypeArguments | 1 ERROR/MISSING node(s) in tree-sitter output |
| 68 | StringTemplates | 18 ERROR/MISSING node(s) in tree-sitter output |
| 69 | TripleDot | 2 ERROR/MISSING node(s) in tree-sitter output |
| 70 | TryRecovery | 10 ERROR/MISSING node(s) in tree-sitter output |
| 71 | TypeAlias_ERR | 6 ERROR/MISSING node(s) in tree-sitter output |
| 72 | TypeExpressionAmbiguities_ERR | 7 ERROR/MISSING node(s) in tree-sitter output |
| 73 | TypeModifiersParenthesized | 2 ERROR/MISSING node(s) in tree-sitter output |
| 74 | TypeModifiers_ERR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 75 | UnsignedLiteral | 12 ERROR/MISSING node(s) in tree-sitter output |
| 76 | When | 4 ERROR/MISSING node(s) in tree-sitter output |
| 77 | WhenWithSubjectVariable | 26 ERROR/MISSING node(s) in tree-sitter output |
| 78 | WhenWithSubjectVariable_ERR | 11 ERROR/MISSING node(s) in tree-sitter output |
| 79 | When_ERR | 10 ERROR/MISSING node(s) in tree-sitter output |
| 80 | annotatedFlexibleTypes | 8 ERROR/MISSING node(s) in tree-sitter output |
| 81 | annotationsOnNullableTypes | 2 ERROR/MISSING node(s) in tree-sitter output |
| 82 | contextParametersAndAnnotations | 5 ERROR/MISSING node(s) in tree-sitter output |
| 83 | destructuringInLambdas | 3 ERROR/MISSING node(s) in tree-sitter output |
| 84 | destructuringInLambdas_ERR | 7 ERROR/MISSING node(s) in tree-sitter output |
| 85 | diagnosticTags_ERR | 41 ERROR/MISSING node(s) in tree-sitter output |
| 86 | emptyArguments | 18 ERROR/MISSING node(s) in tree-sitter output |
| 87 | emptyArgumentsInAnnotations | 25 ERROR/MISSING node(s) in tree-sitter output |
| 88 | emptyArgumentsInArrayAccesses | 8 ERROR/MISSING node(s) in tree-sitter output |
| 89 | emptyContextParameters | 64 ERROR/MISSING node(s) in tree-sitter output |
| 90 | emptyParameters | 51 ERROR/MISSING node(s) in tree-sitter output |
| 91 | emptyParametersInFunctionalTypes | 87 ERROR/MISSING node(s) in tree-sitter output |
| 92 | escapedNames | 1 ERROR/MISSING node(s) in tree-sitter output |
| 93 | flexibleDnnType | 4 ERROR/MISSING node(s) in tree-sitter output |
| 94 | inheritingClasses | 2 ERROR/MISSING node(s) in tree-sitter output |
| 95 | kotlinFunInterface_ERR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 96 | modifiers | 3 ERROR/MISSING node(s) in tree-sitter output |
| 97 | multifileClass | 3 ERROR/MISSING node(s) in tree-sitter output |
| 98 | multifileClass2 | 5 ERROR/MISSING node(s) in tree-sitter output |
| 99 | mustUseReturnValueFullEnabled | 2 ERROR/MISSING node(s) in tree-sitter output |
| 100 | mustUseReturnValueHalfEnabled | 2 ERROR/MISSING node(s) in tree-sitter output |
| 101 | namelessObjectAsEnumMember | 2 ERROR/MISSING node(s) in tree-sitter output |
| 102 | noCommaBetweenArguments | 6 ERROR/MISSING node(s) in tree-sitter output |
| 103 | semicolonBetweenDeclarations | 5 ERROR/MISSING node(s) in tree-sitter output |
| 104 | suggestGuardSyntax | 4 ERROR/MISSING node(s) in tree-sitter output |
| 105 | topLevelMembersAnnotated | 4 ERROR/MISSING node(s) in tree-sitter output |
| 106 | trailingCommaAllowed | 12 ERROR/MISSING node(s) in tree-sitter output |
| 107 | trailingCommaForbidden | 31 ERROR/MISSING node(s) in tree-sitter output |
| 108 | typeAliasWithConstraints | 2 ERROR/MISSING node(s) in tree-sitter output |
| 109 | typeAliases | 5 ERROR/MISSING node(s) in tree-sitter output |
| 110 | valueClass | 2 ERROR/MISSING node(s) in tree-sitter output |
