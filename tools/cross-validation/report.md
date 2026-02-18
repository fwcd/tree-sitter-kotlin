# Tree-Sitter Kotlin vs JetBrains PSI: Cross-Validation Report

Structural comparison of tree-sitter-kotlin parse trees against
JetBrains PSI reference trees for all 228 JetBrains fixture files.

## Summary

| Metric | Count |
|--------|-------|
| Total fixture files | 228 |
| Tree-sitter clean parses | 121 |
| Tree-sitter parse errors | 107 |
| **Structural matches** | **74** |
| Structural mismatches | 47 |
| PSI parse errors | 0 |

**Match rate (among clean parses): 74/121 (61.2%)**

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

## Per-File Results

| # | File | Status | Details |
|---|------|--------|---------|
| 1 | AbsentInnerType | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 2 | AnnotatedIntersections | TS_PARSE_ERROR | tree-sitter parse error |
| 3 | AnonymousInitializer | MATCH | Structurally identical |
| 4 | AssertNotNull | TS_PARSE_ERROR | tree-sitter parse error |
| 5 | BabySteps | MATCH | Structurally identical |
| 6 | BabySteps_ERR | TS_PARSE_ERROR | tree-sitter parse error |
| 7 | BackslashInString | TS_PARSE_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 8 | BlockCommentAtBeginningOfFile1 | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 9 | BlockCommentAtBeginningOfFile2 | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 10 | BlockCommentAtBeginningOfFile3 | MISMATCH | 2 difference(s) |
| 11 | BlockCommentAtBeginningOfFile4 | MISMATCH | 2 difference(s) |
| 12 | BlockCommentUnmatchedClosing_ERR | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 13 | ByClauses | MISMATCH | 4 difference(s) |
| 14 | CallWithManyClosures | MATCH | Structurally identical |
| 15 | CallsInWhen | TS_PARSE_ERROR | tree-sitter parse error |
| 16 | CollectionLiterals | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 17 | CollectionLiterals_ERR | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 18 | CommentsBinding | TS_PARSE_ERROR | tree-sitter parse error |
| 19 | CommentsBindingInLambda | MISMATCH | 7 difference(s) |
| 20 | CommentsBindingInStatementBlock | MISMATCH | 6 difference(s) |
| 21 | Constructors | TS_PARSE_ERROR | tree-sitter parse error |
| 22 | ControlStructures | TS_PARSE_ERROR | tree-sitter parse error |
| 23 | DefaultKeyword | TS_PARSE_ERROR | tree-sitter parse error |
| 24 | DefinitelyNotNullType | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 25 | DocCommentAfterFileAnnotations | MISMATCH | 3 difference(s) |
| 26 | DocCommentForFirstDeclaration | MATCH | Structurally identical |
| 27 | DocCommentOnPackageDirectiveLine | MATCH | Structurally identical |
| 28 | DocCommentsBinding | MATCH | Structurally identical |
| 29 | DoubleColon | TS_PARSE_ERROR | tree-sitter parse error |
| 30 | DoubleColonWhitespaces | TS_PARSE_ERROR | tree-sitter parse error |
| 31 | DoubleColon_ERR | TS_PARSE_ERROR | tree-sitter parse error |
| 32 | DuplicateAccessor | MISMATCH | 2 difference(s) |
| 33 | DynamicReceiver | MATCH | Structurally identical |
| 34 | DynamicSoftKeyword | TS_PARSE_ERROR | tree-sitter parse error |
| 35 | DynamicTypes | TS_PARSE_ERROR | tree-sitter parse error |
| 36 | EOLsInComments | MISMATCH | 3 difference(s) |
| 37 | EOLsOnRollback | MATCH | Structurally identical |
| 38 | EmptyFile | MATCH | Structurally identical |
| 39 | EmptyName | TS_PARSE_ERROR | 5 ERROR/MISSING node(s) in tree-sitter output |
| 40 | EnumCommas | MATCH | Structurally identical |
| 41 | EnumEntryCommaAnnotatedMember | TS_PARSE_ERROR | tree-sitter parse error |
| 42 | EnumEntryCommaInlineMember | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 43 | EnumEntryCommaMember | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 44 | EnumEntryCommaPublicMember | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 45 | EnumEntrySemicolonInlineMember | MATCH | Structurally identical |
| 46 | EnumEntrySemicolonMember | MATCH | Structurally identical |
| 47 | EnumEntrySpaceInlineMember | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 48 | EnumEntrySpaceMember | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 49 | EnumEntryTwoCommas | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 50 | EnumIn | MATCH | Structurally identical |
| 51 | EnumInline | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 52 | EnumInlinePublic | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 53 | EnumMissingName | MISMATCH | 9 difference(s) |
| 54 | EnumOldConstructorSyntax | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 55 | EnumShortCommas | MISMATCH | 9 difference(s) |
| 56 | EnumShortWithOverload | MISMATCH | 12 difference(s) |
| 57 | EnumWithAnnotationKeyword | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 58 | Enums | MISMATCH | 9 difference(s) |
| 59 | Expressions_ERR | TS_PARSE_ERROR | tree-sitter parse error |
| 60 | ExtensionsWithQNReceiver | MISMATCH | 6 difference(s) |
| 61 | FileStart_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 62 | FloatingPointLiteral | MATCH | Structurally identical |
| 63 | ForWithMultiDecl | TS_PARSE_ERROR | tree-sitter parse error |
| 64 | FunctionCalls | TS_PARSE_ERROR | tree-sitter parse error |
| 65 | FunctionExpressions | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 66 | FunctionExpressions_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 67 | FunctionLiterals | MISMATCH | 9 difference(s) |
| 68 | FunctionLiterals_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 69 | FunctionNoParameterList | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 70 | FunctionTypes | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 71 | Functions | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 72 | FunctionsWithoutName | TS_PARSE_ERROR | tree-sitter parse error |
| 73 | FunctionsWithoutName_ERR | TS_PARSE_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 74 | Functions_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 75 | HangOnLonelyModifier | MATCH | Structurally identical |
| 76 | IfWithPropery | MATCH | Structurally identical |
| 77 | ImportSoftKW | MATCH | Structurally identical |
| 78 | Imports | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 79 | Imports_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 80 | IncompleteFunctionLiteral | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 81 | Inner | MATCH | Structurally identical |
| 82 | IntegerLiteral | TS_PARSE_ERROR | tree-sitter parse error |
| 83 | Interface | MATCH | Structurally identical |
| 84 | InterfaceWithEnumKeyword | TS_PARSE_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 85 | Labels | TS_PARSE_ERROR | tree-sitter parse error |
| 86 | LineCommentAfterFileAnnotations | MISMATCH | 3 difference(s) |
| 87 | LineCommentForFirstDeclaration | MATCH | Structurally identical |
| 88 | LineCommentsInBlock | MATCH | Structurally identical |
| 89 | LocalDeclarations | TS_PARSE_ERROR | tree-sitter parse error |
| 90 | LongPackageName | MATCH | Structurally identical |
| 91 | ModifierAsSelector | MATCH | Structurally identical |
| 92 | MultiVariableDeclarations | TS_PARSE_ERROR | tree-sitter parse error |
| 93 | NamedClassObject | MATCH | Structurally identical |
| 94 | NestedComments | MATCH | Structurally identical |
| 95 | NewLinesValidOperations | MISMATCH | 7 difference(s) |
| 96 | NewlinesInParentheses | MISMATCH | 12 difference(s) |
| 97 | NonTypeBeforeDotInBaseClass | MISMATCH | 6 difference(s) |
| 98 | NotIsAndNotIn | MATCH | Structurally identical |
| 99 | ObjectLiteralAsStatement | MISMATCH | 2 difference(s) |
| 100 | ParameterNameMising | TS_PARSE_ERROR | 3 ERROR/MISSING node(s) in tree-sitter output |
| 101 | ParameterType | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 102 | ParameterType_ERR | TS_PARSE_ERROR | tree-sitter parse error |
| 103 | Precedence | TS_PARSE_ERROR | tree-sitter parse error |
| 104 | PrimaryConstructorModifiers_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 105 | Properties | TS_PARSE_ERROR | tree-sitter parse error |
| 106 | PropertiesFollowedByInitializers | TS_PARSE_ERROR | tree-sitter parse error |
| 107 | Properties_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 108 | PropertyInvokes | MATCH | Structurally identical |
| 109 | QuotedIdentifiers | MATCH | Structurally identical |
| 110 | Reserved | MATCH | Structurally identical |
| 111 | SemicolonAfterIf | MATCH | Structurally identical |
| 112 | SimpleClassMembers | MATCH | Structurally identical |
| 113 | SimpleClassMembers_ERR | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 114 | SimpleExpressions | MISMATCH | 83 difference(s) |
| 115 | SimpleIntersections | TS_PARSE_ERROR | tree-sitter parse error |
| 116 | SimpleModifiers | TS_PARSE_ERROR | tree-sitter parse error |
| 117 | SoftKeywords | TS_PARSE_ERROR | tree-sitter parse error |
| 118 | SoftKeywordsInTypeArguments | TS_PARSE_ERROR | tree-sitter parse error |
| 119 | StringTemplates | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 120 | Super | MISMATCH | 4 difference(s) |
| 121 | TraitConstructor | MATCH | Structurally identical |
| 122 | TripleDot | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 123 | TryRecovery | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 124 | TypeAlias | MATCH | Structurally identical |
| 125 | TypeAlias_ERR | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 126 | TypeConstraints | MATCH | Structurally identical |
| 127 | TypeExpressionAmbiguities_ERR | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 128 | TypeModifiers | MISMATCH | 30 difference(s) |
| 129 | TypeModifiersParenthesized | TS_PARSE_ERROR | tree-sitter parse error |
| 130 | TypeModifiers_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 131 | TypeParametersBeforeName | MISMATCH | 6 difference(s) |
| 132 | TypealiasIsKeyword | MISMATCH | 4 difference(s) |
| 133 | UnderscoredTypeArgumentsOfCall | MATCH | Structurally identical |
| 134 | UnderscoredTypeArgumentsOfCallIllegal | MATCH | Structurally identical |
| 135 | UnderscoredTypeArgumentsOfType | MATCH | Structurally identical |
| 136 | UnderscoredTypeParameters | MATCH | Structurally identical |
| 137 | UnsignedLiteral | TS_PARSE_ERROR | tree-sitter parse error |
| 138 | When | TS_PARSE_ERROR | tree-sitter parse error |
| 139 | WhenWithSubjectVariable | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 140 | WhenWithSubjectVariable_ERR | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 141 | WhenWithSubjectVariable_SoftModifierName | MATCH | Structurally identical |
| 142 | When_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 143 | annotatedFlexibleTypes | TS_PARSE_ERROR | tree-sitter parse error |
| 144 | annotatedParameterInEnumConstructor | MISMATCH | 3 difference(s) |
| 145 | annotatedParameterInInnerClassConstructor | MATCH | Structurally identical |
| 146 | annotationClass | MATCH | Structurally identical |
| 147 | annotationValues | MISMATCH | 5 difference(s) |
| 148 | annotations | MISMATCH | 20 difference(s) |
| 149 | annotationsOnNullableTypes | TS_PARSE_ERROR | tree-sitter parse error |
| 150 | annotationsOnParenthesizedTypes | MISMATCH | 36 difference(s) |
| 151 | anonymousReturnWithGenericType | MISMATCH | 12 difference(s) |
| 152 | classMembers | MATCH | Structurally identical |
| 153 | classObject | MATCH | Structurally identical |
| 154 | complicateLTGT | MISMATCH | 5 difference(s) |
| 155 | complicateLTGTE | MISMATCH | 2 difference(s) |
| 156 | const | MATCH | Structurally identical |
| 157 | contextParametersAndAnnotations | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 158 | dataClass | MATCH | Structurally identical |
| 159 | dataObject | MATCH | Structurally identical |
| 160 | defaultImplsInInterface | MATCH | Structurally identical |
| 161 | definitelyNotNullTypes | MISMATCH | 5 difference(s) |
| 162 | delegatedWithInitializer | MATCH | Structurally identical |
| 163 | delegation | MATCH | Structurally identical |
| 164 | dependencyOnNestedClasses | MISMATCH | 14 difference(s) |
| 165 | destructuringInLambdas | MISMATCH | 7 difference(s) |
| 166 | destructuringInLambdas_ERR | TS_PARSE_ERROR | tree-sitter parse error |
| 167 | diagnosticTags_ERR | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 168 | emptyArguments | TS_PARSE_ERROR | tree-sitter parse error |
| 169 | emptyArgumentsInAnnotations | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 170 | emptyArgumentsInArrayAccesses | TS_PARSE_ERROR | 4 ERROR/MISSING node(s) in tree-sitter output |
| 171 | emptyContextParameters | TS_PARSE_ERROR | tree-sitter parse error |
| 172 | emptyEnum | MATCH | Structurally identical |
| 173 | emptyParameters | TS_PARSE_ERROR | tree-sitter parse error |
| 174 | emptyParametersInFunctionalTypes | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 175 | enum | MATCH | Structurally identical |
| 176 | enumEntryContent | MISMATCH | 1 difference(s) |
| 177 | escapedNames | TS_PARSE_ERROR | tree-sitter parse error |
| 178 | flexibleDnnType | TS_PARSE_ERROR | tree-sitter parse error |
| 179 | funInterfaceDeclaration | MATCH | Structurally identical |
| 180 | incorrectLTGTFallback | MISMATCH | 16 difference(s) |
| 181 | inheritingClasses | MATCH | Structurally identical |
| 182 | innerClassEnumEntry | MATCH | Structurally identical |
| 183 | innerTypes | MISMATCH | 7 difference(s) |
| 184 | internalConst | MATCH | Structurally identical |
| 185 | kotlinFunInterface_ERR | TS_PARSE_ERROR | 2 ERROR/MISSING node(s) in tree-sitter output |
| 186 | localClass | MISMATCH | 7 difference(s) |
| 187 | modifiers | MISMATCH | 1 difference(s) |
| 188 | multifileClass | TS_PARSE_ERROR | tree-sitter parse error |
| 189 | multifileClass2 | TS_PARSE_ERROR | tree-sitter parse error |
| 190 | mustUseReturnValueAndOverrides | MATCH | Structurally identical |
| 191 | mustUseReturnValueFullEnabled | TS_PARSE_ERROR | tree-sitter parse error |
| 192 | mustUseReturnValueHalfEnabled | TS_PARSE_ERROR | tree-sitter parse error |
| 193 | namedCompanionObject | MATCH | Structurally identical |
| 194 | namelessObjectAsEnumMember | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 195 | nestedClasses | MATCH | Structurally identical |
| 196 | noCommaBetweenArguments | TS_PARSE_ERROR | tree-sitter parse error |
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
| 208 | semicolonBetweenDeclarations | TS_PARSE_ERROR | tree-sitter parse error |
| 209 | specialNames | MATCH | Structurally identical |
| 210 | suggestGuardSyntax | TS_PARSE_ERROR | tree-sitter parse error |
| 211 | suspendLambda | MISMATCH | 17 difference(s) |
| 212 | topJvmPackageName | MISMATCH | 8 difference(s) |
| 213 | topJvmPackageNameMultifile | MISMATCH | 10 difference(s) |
| 214 | topLevelMembers | MISMATCH | 6 difference(s) |
| 215 | topLevelMembersAnnotated | TS_PARSE_ERROR | tree-sitter parse error |
| 216 | trailingCommaAllowed | TS_PARSE_ERROR | tree-sitter parse error |
| 217 | trailingCommaForbidden | TS_PARSE_ERROR | tree-sitter parse error |
| 218 | typeAliasExpansion | MISMATCH | 10 difference(s) |
| 219 | typeAliasWithConstraints | TS_PARSE_ERROR | tree-sitter parse error |
| 220 | typeAliases | TS_PARSE_ERROR | tree-sitter parse error |
| 221 | typeBoundsAndDelegationSpecifiers | MATCH | Structurally identical |
| 222 | typeModifiers2 | MISMATCH | 1 difference(s) |
| 223 | typeParams | MISMATCH | 1 difference(s) |
| 224 | types | MISMATCH | 2 difference(s) |
| 225 | underscoreParameterName | MATCH | Structurally identical |
| 226 | validKotlinFunInterface | MATCH | Structurally identical |
| 227 | valueClass | TS_PARSE_ERROR | 1 ERROR/MISSING node(s) in tree-sitter output |
| 228 | varargArgumentWithFunctionalType | MATCH | Structurally identical |

## Detailed Mismatches

### BlockCommentAtBeginningOfFile3

- **child_count_mismatch** at `KtFile`
  - Expected: `0`
  - Actual: `1`
- **extra_child** at `KtFile`
  - Expected: `(none)`
  - Actual: `BINARY_EXPRESSION`

### BlockCommentAtBeginningOfFile4

- **child_count_mismatch** at `KtFile`
  - Expected: `0`
  - Actual: `1`
- **extra_child** at `KtFile`
  - Expected: `(none)`
  - Actual: `BINARY_EXPRESSION`

### ByClauses

- **child_count_mismatch** at `KtFile > CLASS`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS`
  - Expected: `CLASS_BODY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > BINARY_EXPRESSION > BINARY_EXPRESSION > CALL_EXPRESSION`
  - Expected: `INTEGER_CONSTANT`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > CLASS > DELEGATED_SUPER_TYPE_ENTRY > OBJECT_LITERAL > OBJECT_DECLARATION > CLASS_BODY`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `CLASS_BODY`

### CommentsBindingInLambda

- **child_count_mismatch** at `KtFile > PROPERTY > FUNCTION_LITERAL`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > PROPERTY > FUNCTION_LITERAL`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > PROPERTY > FUNCTION_LITERAL > CALL_EXPRESSION`
  - Expected: `BLOCK`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > PROPERTY > FUNCTION_LITERAL > PROPERTY`
  - Expected: `BLOCK`
  - Actual: `PROPERTY`
- **child_count_mismatch** at `KtFile > PROPERTY > FUNCTION_LITERAL`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > PROPERTY > FUNCTION_LITERAL`
  - Expected: `BLOCK`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > PROPERTY > FUNCTION_LITERAL > BLOCK`
  - Expected: `VALUE_PARAMETER_LIST`
  - Actual: `BLOCK`

### CommentsBindingInStatementBlock

- **child_count_mismatch** at `KtFile > FUN > BLOCK > IF`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > BLOCK > IF`
  - Expected: `BLOCK`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > FUN > BLOCK > IF`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > BLOCK > IF`
  - Expected: `BLOCK`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > FUN > BLOCK > IF`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > BLOCK > IF`
  - Expected: `BLOCK`
  - Actual: `(none)`

### DocCommentAfterFileAnnotations

- **child_count_mismatch** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST > USER_TYPE`
  - Expected: `ANNOTATION_TARGET`
  - Actual: `USER_TYPE`

### DuplicateAccessor

- **child_count_mismatch** at `KtFile > PROPERTY`
  - Expected: `2`
  - Actual: `3`
- **extra_child** at `KtFile > PROPERTY`
  - Expected: `(none)`
  - Actual: `PROPERTY_ACCESSOR`

### EOLsInComments

- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `PREFIX_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `PREFIX_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `PREFIX_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`

### EnumMissingName

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`

### EnumShortCommas

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`

### EnumShortWithOverload

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `CLASS_BODY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > CLASS_BODY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `CLASS_BODY`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `CLASS_BODY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > CLASS_BODY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `CLASS_BODY`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `CLASS_BODY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > CLASS_BODY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `CLASS_BODY`

### Enums

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`

### ExtensionsWithQNReceiver

- **child_count_mismatch** at `KtFile > PROPERTY > USER_TYPE`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > PROPERTY > USER_TYPE`
  - Expected: `TYPE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `TYPE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > FUN > USER_TYPE`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > USER_TYPE`
  - Expected: `TYPE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `TYPE_ARGUMENT_LIST`

### FunctionLiterals

- **child_count_mismatch** at `KtFile > FUN > BLOCK`
  - Expected: `8`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `CALL_EXPRESSION`

### LineCommentAfterFileAnnotations

- **child_count_mismatch** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST > USER_TYPE`
  - Expected: `ANNOTATION_TARGET`
  - Actual: `USER_TYPE`

### NewLinesValidOperations

- **child_count_mismatch** at `KtFile > FUN > BLOCK`
  - Expected: `7`
  - Actual: `6`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `BINARY_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_WITH_TYPE`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `BINARY_WITH_TYPE`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `BINARY_WITH_TYPE`
  - Actual: `BINARY_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `0`
  - Actual: `2`
- **extra_child** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `(none)`
  - Actual: `BOOLEAN_CONSTANT`
- **extra_child** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `(none)`
  - Actual: `BOOLEAN_CONSTANT`

### NewlinesInParentheses

- **child_count_mismatch** at `KtFile > FUN > BLOCK`
  - Expected: `12`
  - Actual: `11`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `PROPERTY`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > FUN > BLOCK > PROPERTY`
  - Expected: `0`
  - Actual: `1`
- **extra_child** at `KtFile > FUN > BLOCK > PROPERTY`
  - Expected: `(none)`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > PROPERTY`
  - Expected: `PREFIX_EXPRESSION`
  - Actual: `PROPERTY`
- **name_mismatch** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > FUNCTION_LITERAL`
  - Expected: `BINARY_EXPRESSION`
  - Actual: `FUNCTION_LITERAL`
- **name_mismatch** at `KtFile > FUN > BLOCK > PROPERTY > PARENTHESIZED > BINARY_EXPRESSION`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > PROPERTY > ARRAY_ACCESS_EXPRESSION`
  - Expected: `PARENTHESIZED`
  - Actual: `ARRAY_ACCESS_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > PROPERTY > ARRAY_ACCESS_EXPRESSION > INDICES > FUNCTION_LITERAL`
  - Expected: `BINARY_EXPRESSION`
  - Actual: `FUNCTION_LITERAL`
- **name_mismatch** at `KtFile > FUN > BLOCK > PROPERTY > ARRAY_ACCESS_EXPRESSION > INDICES > BINARY_EXPRESSION`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > WHEN`
  - Expected: `PROPERTY`
  - Actual: `WHEN`
- **name_mismatch** at `KtFile > FUN > BLOCK > PROPERTY`
  - Expected: `WHEN`
  - Actual: `PROPERTY`

### NonTypeBeforeDotInBaseClass

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY`
  - Expected: `FUN`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS`
  - Expected: `0`
  - Actual: `3`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > CLASS`
  - Expected: `(none)`
  - Actual: `USER_TYPE`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > CLASS`
  - Expected: `(none)`
  - Actual: `VALUE_ARGUMENT_LIST`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > CLASS`
  - Expected: `(none)`
  - Actual: `CLASS_BODY`

### ObjectLiteralAsStatement

- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > OBJECT_LITERAL > OBJECT_DECLARATION > CLASS_BODY`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `CLASS_BODY`

### SimpleExpressions

- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `34`
  - Actual: `65`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `OBJECT_LITERAL`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `INTEGER_CONSTANT`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `LABEL`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `LABEL`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `INTEGER_CONSTANT`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `INTEGER_CONSTANT`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `INTEGER_CONSTANT`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `INTEGER_CONSTANT`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `DOT_QUALIFIED_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `INTEGER_CONSTANT`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > INTEGER_CONSTANT`
  - Expected: `VALUE_PARAMETER`
  - Actual: `INTEGER_CONSTANT`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `CHARACTER_CONSTANT`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > INTEGER_CONSTANT`
  - Expected: `VALUE_PARAMETER`
  - Actual: `INTEGER_CONSTANT`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `STRING_TEMPLATE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > CHARACTER_CONSTANT`
  - Expected: `VALUE_PARAMETER`
  - Actual: `CHARACTER_CONSTANT`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > STRING_TEMPLATE`
  - Expected: `VALUE_PARAMETER`
  - Actual: `STRING_TEMPLATE`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > STRING_TEMPLATE`
  - Expected: `VALUE_PARAMETER`
  - Actual: `STRING_TEMPLATE`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `BOOLEAN_CONSTANT`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > FLOAT_CONSTANT`
  - Expected: `VALUE_PARAMETER`
  - Actual: `FLOAT_CONSTANT`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `NULL`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > DOT_QUALIFIED_EXPRESSION`
  - Expected: `VALUE_PARAMETER`
  - Actual: `DOT_QUALIFIED_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `SUPER_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > DOT_QUALIFIED_EXPRESSION`
  - Expected: `VALUE_PARAMETER`
  - Actual: `DOT_QUALIFIED_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `CALL_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > DOT_QUALIFIED_EXPRESSION`
  - Expected: `VALUE_PARAMETER`
  - Actual: `DOT_QUALIFIED_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `CALL_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > DOT_QUALIFIED_EXPRESSION`
  - Expected: `VALUE_PARAMETER`
  - Actual: `DOT_QUALIFIED_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `CALL_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > BOOLEAN_CONSTANT`
  - Expected: `VALUE_PARAMETER`
  - Actual: `BOOLEAN_CONSTANT`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `CALL_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > BOOLEAN_CONSTANT`
  - Expected: `VALUE_PARAMETER`
  - Actual: `BOOLEAN_CONSTANT`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > NULL`
  - Expected: `VALUE_PARAMETER`
  - Actual: `NULL`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > THIS_EXPRESSION`
  - Expected: `VALUE_PARAMETER`
  - Actual: `THIS_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `INTEGER_CONSTANT`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > SUPER_EXPRESSION`
  - Expected: `VALUE_PARAMETER`
  - Actual: `SUPER_EXPRESSION`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `INTEGER_CONSTANT`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > PARENTHESIZED`
  - Expected: `VALUE_PARAMETER`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > FUN > BLOCK`
  - Expected: `6`
  - Actual: `4`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `LABEL`
  - Actual: `(none)`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `LABEL`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - Expected: `LABEL`
  - Actual: `PREFIX_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > PREFIX_EXPRESSION`
  - Expected: `LABEL`
  - Actual: `PREFIX_EXPRESSION`

### Super

- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`

### TypeModifiers

- **name_mismatch** at `KtFile > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > PARENTHESIZED`
  - Expected: `USER_TYPE`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `2`
  - Actual: `3`
- **extra_child** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `(none)`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > ANNOTATION_ENTRY`
  - Expected: `USER_TYPE`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `2`
  - Actual: `3`
- **extra_child** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `(none)`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > ANNOTATION_ENTRY`
  - Expected: `USER_TYPE`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > PROPERTY`
  - Expected: `2`
  - Actual: `3`
- **extra_child** at `KtFile > PROPERTY`
  - Expected: `(none)`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `USER_TYPE`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > PROPERTY`
  - Expected: `2`
  - Actual: `3`
- **extra_child** at `KtFile > PROPERTY`
  - Expected: `(none)`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `USER_TYPE`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > PROPERTY > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > FUN > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > FUN`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > FUN`
  - Expected: `BLOCK`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_TYPE`
  - Actual: `BLOCK`

### TypeParametersBeforeName

- **child_count_mismatch** at `KtFile > FUN`
  - Expected: `1`
  - Actual: `3`
- **extra_child** at `KtFile > FUN`
  - Expected: `(none)`
  - Actual: `ANNOTATION_ENTRY`
- **extra_child** at `KtFile > FUN`
  - Expected: `(none)`
  - Actual: `USER_TYPE`
- **child_count_mismatch** at `KtFile > FUN > TYPE_PARAMETER_LIST`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > FUN > TYPE_PARAMETER_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`

### TypealiasIsKeyword

- **child_count_mismatch** at `KtFile`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile`
  - Expected: `TYPEALIAS`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > PROPERTY`
  - Expected: `0`
  - Actual: `1`
- **extra_child** at `KtFile > PROPERTY`
  - Expected: `(none)`
  - Actual: `INTEGER_CONSTANT`

### annotatedParameterInEnumConstructor

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY`
  - Expected: `VALUE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > VALUE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `VALUE_ARGUMENT_LIST`

### annotationValues

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - Expected: `0`
  - Actual: `1`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - Expected: `(none)`
  - Actual: `CALLABLE_REFERENCE_EXPRESSION`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - Expected: `0`
  - Actual: `1`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > CLASS > MODIFIER_LIST > ANNOTATION_ENTRY > VALUE_ARGUMENT_LIST > VALUE_ARGUMENT`
  - Expected: `(none)`
  - Actual: `CALLABLE_REFERENCE_EXPRESSION`

### annotations

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > TYPE_PARAMETER_LIST > TYPE_PARAMETER > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > ANNOTATION_ENTRY`
  - Expected: `VALUE_PARAMETER`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > ANNOTATION_ENTRY`
  - Expected: `VALUE_PARAMETER`
  - Actual: `ANNOTATION_ENTRY`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `4`
  - Actual: `5`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `(none)`
  - Actual: `BLOCK`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `3`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `(none)`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > ANNOTATION_ENTRY`
  - Expected: `USER_TYPE`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > ANNOTATION_ENTRY`
  - Expected: `USER_TYPE`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE`
  - Expected: `BLOCK`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > PROPERTY_DELEGATE > CALL_EXPRESSION > FUNCTION_LITERAL > INTEGER_CONSTANT`
  - Expected: `BLOCK`
  - Actual: `INTEGER_CONSTANT`

### annotationsOnParenthesizedTypes

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `POSTFIX_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > POSTFIX_EXPRESSION`
  - Expected: `USER_TYPE`
  - Actual: `POSTFIX_EXPRESSION`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `4`
  - Actual: `3`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `POSTFIX_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > POSTFIX_EXPRESSION`
  - Expected: `USER_TYPE`
  - Actual: `POSTFIX_EXPRESSION`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY`
  - Expected: `POSTFIX_EXPRESSION`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > POSTFIX_EXPRESSION`
  - Expected: `FUNCTION_TYPE`
  - Actual: `POSTFIX_EXPRESSION`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > NULLABLE_TYPE`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > NULLABLE_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > NULLABLE_TYPE > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`

### anonymousReturnWithGenericType

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `(none)`
  - Actual: `CLASS_BODY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `USER_TYPE`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `(none)`
  - Actual: `CLASS_BODY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `USER_TYPE`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `(none)`
  - Actual: `CLASS_BODY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `USER_TYPE`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `(none)`
  - Actual: `CLASS_BODY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `USER_TYPE`

### complicateLTGT

- **child_count_mismatch** at `KtFile > FUN > BLOCK`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > BLOCK`
  - Expected: `FUNCTION_LITERAL`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > FUN > BLOCK > IF`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > BLOCK > IF`
  - Expected: `INTEGER_CONSTANT`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FUN > BLOCK > IF > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`

### complicateLTGTE

- **child_count_mismatch** at `KtFile > FUN > BLOCK > IF`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > BLOCK > IF`
  - Expected: `BLOCK`
  - Actual: `(none)`

### definitelyNotNullTypes

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > IF > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `VALUE_PARAMETER`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `USER_TYPE`
  - Actual: `(none)`

### dependencyOnNestedClasses

- **child_count_mismatch** at `KtFile > CLASS > USER_TYPE`
  - Expected: `1`
  - Actual: `0`
- **missing_child** at `KtFile > CLASS > USER_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `1`
  - Actual: `0`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `1`
  - Actual: `0`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `1`
  - Actual: `0`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `1`
  - Actual: `0`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE`
  - Expected: `1`
  - Actual: `0`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN > USER_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > BINARY_EXPRESSION`
  - Expected: `CLASS`
  - Actual: `BINARY_EXPRESSION`

### destructuringInLambdas

- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`

### enumEntryContent

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > ENUM_ENTRY > CLASS_BODY > CLASS_INITIALIZER > BLOCK > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION > CLASS_BODY`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `CLASS_BODY`

### incorrectLTGTFallback

- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`
- **name_mismatch** at `KtFile > FUN > BLOCK > BINARY_EXPRESSION`
  - Expected: `CALL_EXPRESSION`
  - Actual: `BINARY_EXPRESSION`

### innerTypes

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `TYPE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `2`
  - Actual: `3`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE`
  - Expected: `(none)`
  - Actual: `TYPE_ARGUMENT_LIST`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `TYPE_ARGUMENT_LIST`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > CLASS > CLASS_BODY > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `(none)`
  - Actual: `TYPE_PROJECTION`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `TYPE_ARGUMENT_LIST`

### localClass

- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL`
  - Expected: `(none)`
  - Actual: `CALL_EXPRESSION`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > CALL_EXPRESSION > FUNCTION_LITERAL > CLASS`
  - Expected: `BLOCK`
  - Actual: `CLASS`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION > CLASS_BODY`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `CLASS_BODY`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION`
  - Expected: `(none)`
  - Actual: `CLASS_BODY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > OBJECT_LITERAL > OBJECT_DECLARATION > USER_TYPE`
  - Expected: `OBJECT_DECLARATION`
  - Actual: `USER_TYPE`

### modifiers

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK > IF > BINARY_EXPRESSION > CALL_EXPRESSION`
  - Expected: `DOT_QUALIFIED_EXPRESSION`
  - Actual: `CALL_EXPRESSION`

### suspendLambda

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `4`
  - Actual: `3`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > FUN`
  - Expected: `BLOCK`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > BLOCK`
  - Expected: `FUNCTION_TYPE`
  - Actual: `BLOCK`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > NULLABLE_TYPE > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > NULLABLE_TYPE > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > NULLABLE_TYPE > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > NULLABLE_TYPE > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > NULLABLE_TYPE`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > NULLABLE_TYPE`
  - Expected: `FUNCTION_TYPE`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > NULLABLE_TYPE > PARENTHESIZED`
  - Expected: `MODIFIER_LIST`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`

### topJvmPackageName

- **child_count_mismatch** at `KtFile`
  - Expected: `2`
  - Actual: `4`
- **extra_child** at `KtFile`
  - Expected: `(none)`
  - Actual: `FILE_ANNOTATION_LIST`
- **extra_child** at `KtFile`
  - Expected: `(none)`
  - Actual: `FUN`
- **child_count_mismatch** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `3`
  - Actual: `2`
- **missing_child** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST > USER_TYPE`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST > VALUE_ARGUMENT_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `VALUE_ARGUMENT_LIST`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `FUN`
  - Actual: `FILE_ANNOTATION_LIST`

### topJvmPackageNameMultifile

- **child_count_mismatch** at `KtFile`
  - Expected: `2`
  - Actual: `5`
- **extra_child** at `KtFile`
  - Expected: `(none)`
  - Actual: `FILE_ANNOTATION_LIST`
- **extra_child** at `KtFile`
  - Expected: `(none)`
  - Actual: `FILE_ANNOTATION_LIST`
- **extra_child** at `KtFile`
  - Expected: `(none)`
  - Actual: `FUN`
- **child_count_mismatch** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `4`
  - Actual: `2`
- **missing_child** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `(none)`
- **missing_child** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST > USER_TYPE`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `USER_TYPE`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST > VALUE_ARGUMENT_LIST`
  - Expected: `ANNOTATION_ENTRY`
  - Actual: `VALUE_ARGUMENT_LIST`
- **name_mismatch** at `KtFile > FILE_ANNOTATION_LIST`
  - Expected: `FUN`
  - Actual: `FILE_ANNOTATION_LIST`

### topLevelMembers

- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `1`
  - Actual: `2`
- **extra_child** at `KtFile > FUN > VALUE_PARAMETER_LIST`
  - Expected: `(none)`
  - Actual: `INTEGER_CONSTANT`
- **child_count_mismatch** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER`
  - Expected: `INTEGER_CONSTANT`
  - Actual: `(none)`
- **child_count_mismatch** at `KtFile > PROPERTY > USER_TYPE`
  - Expected: `1`
  - Actual: `0`
- **missing_child** at `KtFile > PROPERTY > USER_TYPE`
  - Expected: `USER_TYPE`
  - Actual: `(none)`

### typeAliasExpansion

- **child_count_mismatch** at `KtFile > TYPEALIAS > USER_TYPE`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > TYPEALIAS > USER_TYPE`
  - Expected: `TYPE_ARGUMENT_LIST`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > TYPEALIAS > USER_TYPE > TYPE_ARGUMENT_LIST`
  - Expected: `USER_TYPE`
  - Actual: `TYPE_ARGUMENT_LIST`
- **name_mismatch** at `KtFile > TYPEALIAS > NULLABLE_TYPE > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL`
  - Expected: `BLOCK`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL > BLOCK`
  - Expected: `VALUE_PARAMETER_LIST`
  - Actual: `BLOCK`
- **child_count_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL`
  - Expected: `2`
  - Actual: `1`
- **missing_child** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL`
  - Expected: `BLOCK`
  - Actual: `(none)`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_LITERAL > BLOCK`
  - Expected: `VALUE_PARAMETER_LIST`
  - Actual: `BLOCK`

### typeModifiers2

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > PARENTHESIZED`
  - Expected: `FUNCTION_TYPE`
  - Actual: `PARENTHESIZED`

### typeParams

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > FUN > VALUE_PARAMETER_LIST > VALUE_PARAMETER > FUNCTION_TYPE > FUNCTION_TYPE_RECEIVER > PARENTHESIZED`
  - Expected: `USER_TYPE`
  - Actual: `PARENTHESIZED`

### types

- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`
- **name_mismatch** at `KtFile > CLASS > CLASS_BODY > PROPERTY > USER_TYPE > TYPE_ARGUMENT_LIST > TYPE_PROJECTION > ANNOTATION_ENTRY`
  - Expected: `MODIFIER_LIST`
  - Actual: `ANNOTATION_ENTRY`

## Common Mismatch Patterns

| Diff Kind | Count |
|-----------|-------|
| name_mismatch | 175 |
| child_count_mismatch | 108 |
| missing_child | 84 |
| extra_child | 69 |

### Most Common Name Mismatches

| Actual (TS) → Expected (PSI) | Count |
|------------------------------|-------|
| ANNOTATION_ENTRY → MODIFIER_LIST | 20 |
| BINARY_EXPRESSION → CALL_EXPRESSION | 17 |
| CALL_EXPRESSION → DOT_QUALIFIED_EXPRESSION | 16 |
| PARENTHESIZED → MODIFIER_LIST | 15 |
| VALUE_ARGUMENT_LIST → USER_TYPE | 13 |
| PARENTHESIZED → FUNCTION_TYPE | 11 |
| TYPE_ARGUMENT_LIST → USER_TYPE | 6 |
| ANNOTATION_ENTRY → USER_TYPE | 6 |
| USER_TYPE → OBJECT_DECLARATION | 5 |
| CLASS_BODY → OBJECT_DECLARATION | 4 |
| DOT_QUALIFIED_EXPRESSION → VALUE_PARAMETER | 4 |
| BLOCK → VALUE_PARAMETER_LIST | 3 |
| BINARY_EXPRESSION → PREFIX_EXPRESSION | 3 |
| CLASS_BODY → VALUE_ARGUMENT_LIST | 3 |
| USER_TYPE → ANNOTATION_TARGET | 2 |
| FUNCTION_LITERAL → BINARY_EXPRESSION | 2 |
| BINARY_EXPRESSION → FUNCTION_LITERAL | 2 |
| INTEGER_CONSTANT → VALUE_PARAMETER | 2 |
| STRING_TEMPLATE → VALUE_PARAMETER | 2 |
| BOOLEAN_CONSTANT → VALUE_PARAMETER | 2 |
| PREFIX_EXPRESSION → LABEL | 2 |
| PARENTHESIZED → USER_TYPE | 2 |
| BLOCK → FUNCTION_TYPE | 2 |
| ANNOTATION_ENTRY → VALUE_PARAMETER | 2 |
| POSTFIX_EXPRESSION → USER_TYPE | 2 |
| USER_TYPE → ANNOTATION_ENTRY | 2 |
| VALUE_ARGUMENT_LIST → ANNOTATION_ENTRY | 2 |
| FILE_ANNOTATION_LIST → FUN | 2 |
| CALL_EXPRESSION → INTEGER_CONSTANT | 1 |
| CALL_EXPRESSION → BLOCK | 1 |
| PROPERTY → BLOCK | 1 |
| CALL_EXPRESSION → FUNCTION_LITERAL | 1 |
| BINARY_WITH_TYPE → DOT_QUALIFIED_EXPRESSION | 1 |
| BINARY_EXPRESSION → BINARY_WITH_TYPE | 1 |
| PROPERTY → PREFIX_EXPRESSION | 1 |
| ARRAY_ACCESS_EXPRESSION → PARENTHESIZED | 1 |
| WHEN → PROPERTY | 1 |
| PROPERTY → WHEN | 1 |
| CHARACTER_CONSTANT → VALUE_PARAMETER | 1 |
| FLOAT_CONSTANT → VALUE_PARAMETER | 1 |
| NULL → VALUE_PARAMETER | 1 |
| THIS_EXPRESSION → VALUE_PARAMETER | 1 |
| SUPER_EXPRESSION → VALUE_PARAMETER | 1 |
| PARENTHESIZED → VALUE_PARAMETER | 1 |
| USER_TYPE → BLOCK | 1 |
| INTEGER_CONSTANT → BLOCK | 1 |
| POSTFIX_EXPRESSION → FUNCTION_TYPE | 1 |
| BINARY_EXPRESSION → CLASS | 1 |
| CLASS → BLOCK | 1 |

## Tree-Sitter Parse Errors

107 file(s) failed to parse cleanly with tree-sitter.

- **AbsentInnerType**
- **AnnotatedIntersections**
- **AssertNotNull**
- **BabySteps_ERR**
- **BackslashInString**
- **BlockCommentAtBeginningOfFile1**
- **BlockCommentAtBeginningOfFile2**
- **BlockCommentUnmatchedClosing_ERR**
- **CallsInWhen**
- **CollectionLiterals**
- **CollectionLiterals_ERR**
- **CommentsBinding**
- **Constructors**
- **ControlStructures**
- **DefaultKeyword**
- **DefinitelyNotNullType**
- **DoubleColon**
- **DoubleColonWhitespaces**
- **DoubleColon_ERR**
- **DynamicSoftKeyword**
- **DynamicTypes**
- **EmptyName**
- **EnumEntryCommaAnnotatedMember**
- **EnumEntryCommaInlineMember**
- **EnumEntryCommaMember**
- **EnumEntryCommaPublicMember**
- **EnumEntrySpaceInlineMember**
- **EnumEntrySpaceMember**
- **EnumEntryTwoCommas**
- **EnumInline**
- **EnumInlinePublic**
- **EnumOldConstructorSyntax**
- **EnumWithAnnotationKeyword**
- **Expressions_ERR**
- **FileStart_ERR**
- **ForWithMultiDecl**
- **FunctionCalls**
- **FunctionExpressions**
- **FunctionExpressions_ERR**
- **FunctionLiterals_ERR**
- **FunctionNoParameterList**
- **FunctionTypes**
- **Functions**
- **FunctionsWithoutName**
- **FunctionsWithoutName_ERR**
- **Functions_ERR**
- **Imports**
- **Imports_ERR**
- **IncompleteFunctionLiteral**
- **IntegerLiteral**
- **InterfaceWithEnumKeyword**
- **Labels**
- **LocalDeclarations**
- **MultiVariableDeclarations**
- **ParameterNameMising**
- **ParameterType**
- **ParameterType_ERR**
- **Precedence**
- **PrimaryConstructorModifiers_ERR**
- **Properties**
- **PropertiesFollowedByInitializers**
- **Properties_ERR**
- **SimpleClassMembers_ERR**
- **SimpleIntersections**
- **SimpleModifiers**
- **SoftKeywords**
- **SoftKeywordsInTypeArguments**
- **StringTemplates**
- **TripleDot**
- **TryRecovery**
- **TypeAlias_ERR**
- **TypeExpressionAmbiguities_ERR**
- **TypeModifiersParenthesized**
- **TypeModifiers_ERR**
- **UnsignedLiteral**
- **When**
- **WhenWithSubjectVariable**
- **WhenWithSubjectVariable_ERR**
- **When_ERR**
- **annotatedFlexibleTypes**
- **annotationsOnNullableTypes**
- **contextParametersAndAnnotations**
- **destructuringInLambdas_ERR**
- **diagnosticTags_ERR**
- **emptyArguments**
- **emptyArgumentsInAnnotations**
- **emptyArgumentsInArrayAccesses**
- **emptyContextParameters**
- **emptyParameters**
- **emptyParametersInFunctionalTypes**
- **escapedNames**
- **flexibleDnnType**
- **kotlinFunInterface_ERR**
- **multifileClass**
- **multifileClass2**
- **mustUseReturnValueFullEnabled**
- **mustUseReturnValueHalfEnabled**
- **namelessObjectAsEnumMember**
- **noCommaBetweenArguments**
- **semicolonBetweenDeclarations**
- **suggestGuardSyntax**
- **topLevelMembersAnnotated**
- **trailingCommaAllowed**
- **trailingCommaForbidden**
- **typeAliasWithConstraints**
- **typeAliases**
- **valueClass**
