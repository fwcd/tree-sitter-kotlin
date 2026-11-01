#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <string.h>
#include <wctype.h>

// Mostly a copy paste of tree-sitter-javascript/src/scanner.c

enum TokenType {
  AUTOMATIC_SEMICOLON,
  MULTILINE_COMMENT,
  STRING_START,
  STRING_END,
  STRING_CONTENT,
  PRIMARY_CONSTRUCTOR_KEYWORD,
  IMPORT_DOT,
  INTERPOLATION_EXPRESSION_START,
  INTERPOLATION_IDENTIFIER_START,
  BY_DELEGATION_HINT,
  PRIMARY_CONSTRUCTOR_HINT,
  CALLABLE_REFERENCE_QUEST,
  COMMENT_CONTINUATION_HINT,
  TRY_CLAUSE_HINT,
  BACKING_FIELD_HINT,
  EXPRESSION_END_HINT,
  DELEGATE_START_HINT,
  DELEGATE_END_HINT,
  QUOTED_IDENTIFIER,
  CALL_LAMBDA_HINT,
  BLOCK_END_HINT,
  MODIFIER_HINT,
  RESERVED_WORD_GUARD,
  QUOTED_LABEL,
  COMPANION_OBJECT_HINT,
  FURTHER_SEMICOLON,
  CHARACTER_CONTENT,
  LABEL_IDENTIFIER,
};

/* Pretty much all of this code is taken from the Julia tree-sitter
   parser.

   Julia has similar problems with multiline comments that can be nested,
   line comments, as well as line and multiline strings.

   The most heavily edited section is `scan_string_content`,
   particularly with respect to interpolation.
 */

// Block comments are easy to parse, but strings require extra-attention.

// The main problems that arise when parsing strings are:
// 1. Triple quoted strings allow single quotes inside. e.g. """ "foo" """.
// 2. Non-standard string literals don't allow interpolations or escape
//    sequences, but you can always write \" and \`.

// To efficiently store a delimiter, we take advantage of the fact that:
// (int)'"' == 34 && (34 & 1) == 0
// i.e. " has an even numeric representation, so we can store a triple
// quoted delimiter as (delimiter + 1).

#define DELIMITER_LENGTH 3

typedef char Delimiter;

// A delimiter occupies bits 0..5 of the first byte ('"' is 34, '"'+1 is 35),
// leaving bits 6..7 free. We lend those two bits to the prefix length, which
// gives it ten bits across the entry without making the entry any larger, so
// the maximum interpolation nesting depth is unaffected.
#define DELIMITER_MASK 0x3F
#define PREFIX_HI_SHIFT 6
#define PREFIX_LEN_MAX 1023

// Sentinel for a prefix longer than PREFIX_LEN_MAX. A real prefix is always at
// least 1 (a string with no '$' prefix still uses a single '$' as its trigger),
// so 0 is free to mean "this prefix does not fit in the entry".
//
// Such a string needs a run of more than PREFIX_LEN_MAX '$' to interpolate,
// and we no longer know the exact count, so we cannot decide a run that long.
// Every run we *can* decide — anything up to PREFIX_LEN_MAX — is shorter than
// the prefix and is therefore literal content, which is what we emit. Storing
// the length exactly instead would need a third byte per open string and would
// cut the maximum nesting depth from 512 to 341, a far more reachable limit
// than a 1024-'$' prefix.
#define PREFIX_LEN_UNREPRESENTABLE 0

// We use a stack to keep track of the string delimiters.
// Each entry is two bytes: [delimiter_and_prefix_hi, prefix_lo].
// bits 0..5 of byte 0: '"' for single-quoted, '"'+1 for triple-quoted.
// bits 6..7 of byte 0, then byte 1: number of '$' signs required to trigger
//   interpolation (1 for regular strings and $"...", 2 for $$"...", etc.; max
//   PREFIX_LEN_MAX), or PREFIX_LEN_UNREPRESENTABLE for a longer prefix.
typedef Array(Delimiter) Stack;

// Offsets count UTF-8 bytes from the start of the producing scan. TSLexer
// owns absolute/included-range positions; replay uses the normal comment lexer.
typedef struct {
  bool pending;
  uint32_t start_byte;
  uint32_t end_byte;
  bool semi_owed;
} PendingComment;

typedef struct {
  Stack strings;
  // A comment is an extra token. Preserve a class-header line break while
  // emitting that comment, until the constructor/ASI decision can be made.
  bool constructor_newline;
  PendingComment comment;
  // Set after `by` in a class header, cleared at the next `{` or automatic semicolon.
  bool in_delegate;
} Scanner;

static inline void stack_push(Stack *stack, char chr, bool triple, uint16_t prefix_len) {
  uint8_t delim = (uint8_t)(triple ? (chr + 1) : chr);
  uint8_t hi = (uint8_t)((prefix_len >> 8) & 0x3);
  array_push(stack, (Delimiter)(uint8_t)(delim | (hi << PREFIX_HI_SHIFT)));
  array_push(stack, (Delimiter)(uint8_t)(prefix_len & 0xFF));
}

// Returns false instead of aborting when there is nothing to pop, so that no
// input can terminate the host process through this path.
static inline bool stack_pop(Stack *stack) {
  if (stack->size < 2) return false;
  stack->size -= 2;
  return true;
}

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

static unsigned utf8_width(int32_t c) {
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

static void advance_counted(TSLexer *lexer, uint32_t *bytes, bool whitespace) {
  if (bytes) {
    unsigned width = utf8_width(lexer->lookahead);
    *bytes = *bytes <= UINT32_MAX - width ? *bytes + width : UINT32_MAX;
  }
  lexer->advance(lexer, whitespace);
}

// Scanner functions

static bool scan_string_start(TSLexer *lexer, Stack *stack) {
  // The stack is serialized whole, two bytes per open string, so it holds at
  // most TREE_SITTER_SERIALIZATION_BUFFER_SIZE / 2 of them. When it is full,
  // decline the string start before consuming any input; the parser then
  // recovers with an ERROR node instead of the scanner aborting the host.
  if (stack->size + 2 > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return false;

  // Count leading '$' signs (the interpolation prefix). The counter stops one
  // past PREFIX_LEN_MAX, which is enough to tell "too long" from an exact
  // length and cannot wrap no matter how many '$' the input supplies.
  uint32_t dollars = 0;
  while (lexer->lookahead == '$') {
    advance(lexer);
    if (dollars <= PREFIX_LEN_MAX) dollars++;
  }
  uint16_t prefix_len;
  if (dollars == 0) {
    // Regular strings with no prefix still use a single '$' as the trigger.
    prefix_len = 1;
  } else if (dollars > PREFIX_LEN_MAX) {
    prefix_len = PREFIX_LEN_UNREPRESENTABLE;
  } else {
    prefix_len = (uint16_t)dollars;
  }

  if (lexer->lookahead != '"') return false;
  advance(lexer);
  lexer->mark_end(lexer);
  for (unsigned count = 1; count < DELIMITER_LENGTH; ++count) {
    if (lexer->lookahead != '"') {
      // It's not a triple quoted delimiter.
      stack_push(stack, '"', false, prefix_len);
      return true;
    }
    advance(lexer);
  }
  lexer->mark_end(lexer);
  stack_push(stack, '"', true, prefix_len);
  return true;
}

static bool scan_string_content(TSLexer *lexer, Stack *stack,
                                const bool *valid_symbols) {
  if (stack->size < 2) return false;  // Stack is empty. We're not in a string.
  uint8_t packed = (uint8_t)stack->contents[stack->size - 2];
  uint16_t prefix_len =
      (uint16_t)(((packed >> PREFIX_HI_SHIFT) << 8) |
                 (uint8_t)stack->contents[stack->size - 1]);
  // A prefix we could not record is longer than PREFIX_LEN_MAX, so every run
  // up to PREFIX_LEN_MAX is certainly shorter than it and is literal content.
  // Treating the prefix as PREFIX_LEN_MAX + 1 says exactly that, and leaves
  // longer runs — the only ones we cannot decide — interpolating as before.
  uint32_t trigger_len = (prefix_len == PREFIX_LEN_UNREPRESENTABLE)
                             ? (uint32_t)PREFIX_LEN_MAX + 1
                             : (uint32_t)prefix_len;
  Delimiter raw_delim = (Delimiter)(packed & DELIMITER_MASK);
  bool is_triple = (raw_delim & 1) != 0;
  char end_char = is_triple ? (char)(raw_delim - 1) : (char)raw_delim;
  bool has_content = false;
  while (true) {
    if (lexer->lookahead == '\0') {
      // Stop at real end-of-input, but treat a literal NUL byte (not EOF) as
      // ordinary string content: consume it to guarantee forward progress.
      // Returning here without advancing would leave the lexer stuck at the
      // same offset (mirrors the NUL handling in scan_multiline_comment).
      if (lexer->eof(lexer)) break;
      advance(lexer);
      has_content = true;
      continue;
    }
    if (lexer->lookahead == '$') {
      // If we already have content, stop here so the caller can emit it
      // before we deal with the potential interpolation.
      if (has_content) {
        lexer->result_symbol = STRING_CONTENT;
        return true;
      }
      // Kotlin 2.1 multi-dollar interpolation: in a string with prefix_len N,
      // exactly N consecutive '$' followed by alpha/'{' triggers interpolation.
      // Excess leading '$' signs are literal string content.
      //
      // Strategy: consume the first '$' and mark_end there, then count
      // remaining '$' signs. If total > prefix_len, return STRING_CONTENT
      // for just the first '$' (tree-sitter rewinds to mark_end). On the
      // next scan call, the remaining dollars will be re-examined.
      advance(lexer);
      lexer->mark_end(lexer);
      // Saturate one past PREFIX_LEN_MAX. Only the comparison against
      // trigger_len matters and trigger_len never exceeds PREFIX_LEN_MAX + 1,
      // so capping keeps every decision below correct while making it
      // impossible for a long run of '$' to wrap and read as a short one.
      uint32_t additional_dollars = 0;
      while (lexer->lookahead == '$') {
        advance(lexer);
        if (additional_dollars <= PREFIX_LEN_MAX) additional_dollars++;
      }
      uint32_t total_dollars = 1 + additional_dollars;
      // `"$`if`"`: Kotlin's short template entry also takes an escaped identifier, a backtick
      // pair around at least one character on the line. The token ends after the dollars; the
      // look past the backtick only decides whether the identifier is there.
      if (total_dollars >= trigger_len && lexer->lookahead == '`') {
        if (total_dollars > trigger_len) {
          lexer->result_symbol = STRING_CONTENT;
          return true;
        }
        if (additional_dollars > 0) {
          lexer->mark_end(lexer);
        }
        if (valid_symbols[INTERPOLATION_IDENTIFIER_START]) {
          advance(lexer);
          bool named = false;
          while (lexer->lookahead != '`' && lexer->lookahead != '\n' && lexer->lookahead != '\r' &&
                 !lexer->eof(lexer)) {
            advance(lexer);
            named = true;
          }
          if (named && lexer->lookahead == '`') {
            lexer->result_symbol = INTERPOLATION_IDENTIFIER_START;
            return true;
          }
        }
        lexer->result_symbol = STRING_CONTENT;
        return true;
      }
      // The counter saturates strictly above trigger_len, so a run longer than
      // the cap always reads as "more than the prefix", never as a match.
      if (total_dollars >= trigger_len &&
          (iswalpha(lexer->lookahead) || lexer->lookahead == '_' || lexer->lookahead == '{')) {
        if (total_dollars > trigger_len) {
          // Excess: emit first '$' as literal STRING_CONTENT.
          // mark_end is after the first '$'; tree-sitter rewinds there.
          lexer->result_symbol = STRING_CONTENT;
          return true;
        }
        // Exact match: emit interpolation start token.
        if (additional_dollars > 0) {
          lexer->mark_end(lexer);
        }
        if (valid_symbols[INTERPOLATION_EXPRESSION_START] &&
            lexer->lookahead == '{') {
          advance(lexer);
          // Empty interpolation "${}" is invalid Kotlin (compile error:
          // "Expecting an expression"). Refuse to emit the interpolation
          // token so the parser produces an ERROR node instead of matching
          // a zero-width expression.
          if (lexer->lookahead == '}') {
            return false;
          }
          lexer->mark_end(lexer);
          lexer->result_symbol = INTERPOLATION_EXPRESSION_START;
          return true;
        }
        if (valid_symbols[INTERPOLATION_IDENTIFIER_START] &&
            (iswalpha(lexer->lookahead) || lexer->lookahead == '_')) {
          lexer->result_symbol = INTERPOLATION_IDENTIFIER_START;
          return true;
        }
        return false;
      }
      // Not enough '$' signs or not followed by alpha/'{':
      // all consumed dollars are literal string content.
      if (additional_dollars > 0) {
        lexer->mark_end(lexer);
      }
      lexer->result_symbol = STRING_CONTENT;
      return true;
    }
    if (lexer->lookahead == '\\') {
      advance(lexer);
      has_content = true;
      // In a triple-quoted (raw) string `\` is an ordinary character: the next one is
      // examined as usual, so `"""\$"""` is a backslash and a dollar, and the `"` of `\"`
      // may start the closing `"""`.
      if (is_triple) continue;
      // Otherwise the escaped character is content, whatever it is: `\$` is no
      // interpolation, `\"` no string end, `\\` no new escape.
      if (!lexer->eof(lexer)) advance(lexer);
      continue;
    } else if (lexer->lookahead == end_char) {
      if (is_triple) {
        lexer->mark_end(lexer);
        for (unsigned count = 1; count < DELIMITER_LENGTH; ++count) {
          advance(lexer);
          if (lexer->lookahead != end_char) {
            lexer->mark_end(lexer);
            lexer->result_symbol = STRING_CONTENT;
            return true;
          }
        }

        /* This is so if we lex something like
           """foo"""
              ^
           where we are at the `f`, we should quit after
           reading `foo`, and ascribe it to STRING_CONTENT.

           Then, we restart and try to read the end.
           This is to prevent `foo` from being absorbed into
           the STRING_END token.
         */
        if (has_content && lexer->lookahead == end_char) {
          lexer->result_symbol = STRING_CONTENT;
          return true;
        }

        /* Since the string internals are all hidden in the syntax
           tree anyways, there's no point in going to the effort of
           specifically separating the string end from string contents.
           If we see a bunch of quotes in a row, then we just go until
           they stop appearing, then stop lexing and call it the
           string's end.
         */
        lexer->result_symbol = STRING_END;
        lexer->mark_end(lexer);
        while (lexer->lookahead == end_char) {
          advance(lexer);
          lexer->mark_end(lexer);
        }
        if (!stack_pop(stack)) return false;
        return true;
      }
      if (has_content) {
        lexer->mark_end(lexer);
        lexer->result_symbol = STRING_CONTENT;
        return true;
      }
      if (!stack_pop(stack)) return false;
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = STRING_END;
      return true;
    }
    advance(lexer);
    has_content = true;
  }
  return false;
}


static bool scan_multiline_comment(TSLexer *lexer, bool *newline, uint32_t *bytes) {
  if (lexer->lookahead != '/') return false;
  advance_counted(lexer, bytes, false);
  if (lexer->lookahead != '*') return false;
  advance_counted(lexer, bytes, false);

  bool after_star = false;
  unsigned nesting_depth = 1;
  for (;;) {
    if (newline && (lexer->lookahead == '\n' || lexer->lookahead == '\r'))
      *newline = true;
    switch (lexer->lookahead) {
      case '*':
        advance_counted(lexer, bytes, false);
        after_star = true;
        break;
      case '/':
        advance_counted(lexer, bytes, false);
        if (after_star) {
          after_star = false;
          nesting_depth -= 1;
          if (nesting_depth == 0) {
            lexer->result_symbol = MULTILINE_COMMENT;
            lexer->mark_end(lexer);
            return true;
          }
        } else {
          after_star = false;
          if (lexer->lookahead == '*') {
            nesting_depth += 1;
            advance_counted(lexer, bytes, false);
          }
        }
        break;
      case '\0':
        // Accept unterminated block comments at EOF rather than rejecting them.
        // This matches JetBrains PSI behavior which recognizes unclosed /* as a
        // BLOCK_COMMENT token (plus an error element). Without this, the scanner
        // returns false and tree-sitter tries to parse the comment delimiters
        // as operators/expressions.
        if (lexer->eof(lexer)) {
          lexer->result_symbol = MULTILINE_COMMENT;
          lexer->mark_end(lexer);
          return true;
        }
        // A literal NUL byte inside the comment (lookahead is '\0' but not EOF)
        // must be consumed like any other comment content. Returning here without
        // advancing leaves the lexer at the same offset, so tree-sitter re-invokes
        // the scanner forever on inputs such as "/*\0" -> a parse-time hang (DoS).
        // fallthrough
      default:
        advance_counted(lexer, bytes, false);
        after_star = false;
        break;
    }
  }
}

static bool scan_whitespace_and_comments(TSLexer *lexer, uint32_t *bytes) {
  while (iswspace(lexer->lookahead)) advance_counted(lexer, bytes, true);
  return true;
}

// Test for any identifier character other than the first character.
// This is meant to match the regexp [\p{L}_\p{Nd}]
// as found in '_alpha_identifier' (see grammar.js).
static bool is_word_char(int32_t c) {
  return (iswalnum(c) || c == '_');
}

// Scan for [the end of] a nonempty alphanumeric identifier or
// alphanumeric keyword (including '_').
static bool scan_for_word(TSLexer *lexer, const char* word, unsigned len) {
    skip(lexer);
    for (unsigned i = 0; i < len; ++i) {
      if (lexer->lookahead != word[i]) return false;
      skip(lexer);
    }
    // check that the identifier stops here
    if (is_word_char(lexer->lookahead)) return false;
    return true;
}

// Check if a sequence of characters matches the given word and is followed
// by a non-word character. Uses skip() so characters are not included in
// the current token.
static bool check_word(TSLexer *lexer, const char *word, unsigned len) {
  for (unsigned i = 0; i < len; i++) {
    if (lexer->lookahead != word[i]) return false;
    skip(lexer);
  }
  return !is_word_char(lexer->lookahead);
}

// Skip whitespace (space, tab, newline, CR) and comments (// and nested /* */)
// using skip() so characters are not included in the current token.
// Returns false if a bare '/' is encountered (not a comment), true otherwise.
static bool skip_whitespace_and_comments(TSLexer *lexer) {
  for (;;) {
    while (iswspace(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead != '/') return true;
    skip(lexer);
    if (lexer->lookahead == '/') {
      // Line comment — skip to end of line
      skip(lexer);
      while (lexer->lookahead != '\n' && lexer->lookahead != '\r' &&
             !lexer->eof(lexer)) {
        skip(lexer);
      }
    } else if (lexer->lookahead == '*') {
      // Block comment — skip to */ (with nesting)
      skip(lexer);
      unsigned depth = 1;
      while (depth > 0 && !lexer->eof(lexer)) {
        if (lexer->lookahead == '*') {
          skip(lexer);
          if (lexer->lookahead == '/') { skip(lexer); depth--; }
        } else if (lexer->lookahead == '/') {
          skip(lexer);
          if (lexer->lookahead == '*') { skip(lexer); depth++; }
        } else {
          skip(lexer);
        }
      }
    } else {
      // Bare '/' — not a comment
      return false;
    }
  }
}

// After scan_for_word has matched "else", peek past optional whitespace
// and comments for "->". If found, this is a when-entry's `else ->`,
// not an if-else. Uses skip() so characters are not included in the
// current token.
static bool followed_by_arrow(TSLexer *lexer) {
  if (!skip_whitespace_and_comments(lexer)) return false;
  if (lexer->lookahead != '-') return false;
  skip(lexer);
  return lexer->lookahead == '>';
}

// Check if the current position has a visibility modifier (public, private, protected,
// internal) followed by horizontal whitespace and `next`: `private constructor(...)` of a
// primary constructor, or `val x: Any` / newline / `private field: Int = 1` of a backing field.
// The modifier is read whole as ASCII (constructor_word), so a non-ASCII word is none of them.
static bool constructor_word(TSLexer *lexer, char *word, unsigned capacity);

static bool check_visibility_then(TSLexer *lexer, const char *next, unsigned next_len) {
  char word[16];
  if (!constructor_word(lexer, word, sizeof(word))) return false;
  if (strcmp(word, "public") != 0 && strcmp(word, "private") != 0 &&
      strcmp(word, "protected") != 0 && strcmp(word, "internal") != 0) {
    return false;
  }
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') skip(lexer);
  return check_word(lexer, next, next_len);
}

// Look ahead past one or more annotations (e.g. @Bar, @com.example.Bar, @Bar(x=1)) and an
// optional visibility modifier, then check for `next`: `constructor` of a primary constructor,
// or `field` of an explicit backing field, whose annotations Kotlin's parser puts in the
// BACKING_FIELD's MODIFIER_LIST. All characters are consumed with skip() so nothing affects
// token boundaries.
static bool check_annotations_then(TSLexer *lexer, const char *next, unsigned next_len) {
  // Skip one or more '@annotation' sequences
  while (lexer->lookahead == '@') {
    skip(lexer); // skip '@'
    if (!is_word_char(lexer->lookahead)) return false;
    // Read annotation name, including dot-separated qualifiers
    // (e.g. com.example.Inject)
    while (is_word_char(lexer->lookahead)) skip(lexer);
    while (lexer->lookahead == '.') {
      skip(lexer); // skip '.'
      if (!is_word_char(lexer->lookahead)) break;
      while (is_word_char(lexer->lookahead)) skip(lexer);
    }
    // Skip optional '(...)' argument list (handle nested parens and strings)
    if (lexer->lookahead == '(') {
      unsigned depth = 1;
      skip(lexer);
      while (depth > 0 && lexer->lookahead != '\0' && !lexer->eof(lexer)) {
        if (lexer->lookahead == '"') {
          // Skip over string literal to avoid miscounting parens inside strings
          skip(lexer);
          while (lexer->lookahead != '"' && lexer->lookahead != '\0' && !lexer->eof(lexer)) {
            if (lexer->lookahead == '\\') skip(lexer); // skip escaped char
            skip(lexer);
          }
          if (lexer->lookahead == '"') skip(lexer); // skip closing quote
        } else {
          if (lexer->lookahead == '(') depth++;
          else if (lexer->lookahead == ')') depth--;
          skip(lexer);
        }
      }
    }
    // Skip whitespace and newlines between annotations or before the keyword
    while (iswspace(lexer->lookahead)) skip(lexer);
  }
  // Allow an optional visibility modifier before the keyword
  if (is_word_char(lexer->lookahead) && lexer->lookahead != next[0]) {
    return check_visibility_then(lexer, next, next_len);
  }
  return check_word(lexer, next, next_len);
}

// Probe only while the grammar can start a primary constructor. The hidden
// hint commits that alternative before trivia/modifiers are lexed, so every
// ASI path sees the same decision without changing comment token boundaries.
// Probes use advance(), never skip(): a zero-width hint/semicolon stays at
// the original mark even after looking through comments and annotation args.
static bool constructor_space(int32_t c) {
  return c == ' ' || (c >= '\t' && c <= '\r') || c == 0x85 || c == 0xa0 ||
         c == 0x1680 || (c >= 0x2000 && c <= 0x200a) || c == 0x2028 ||
         c == 0x2029 || c == 0x202f || c == 0x205f || c == 0x3000;
}

static bool constructor_trivia(TSLexer *lexer, bool *newline) {
  for (;;) {
    while (constructor_space(lexer->lookahead)) {
      if (lexer->lookahead == '\n' || lexer->lookahead == '\r') *newline = true;
      advance(lexer);
    }
    if (lexer->lookahead != '/') return true;
    advance(lexer);
    if (lexer->lookahead == '/') {
      while (!lexer->eof(lexer) && lexer->lookahead != '\n' && lexer->lookahead != '\r') advance(lexer);
    } else if (lexer->lookahead == '*') {
      advance(lexer);
      unsigned depth = 1;
      while (depth && !lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        if (c == '\n' || c == '\r') *newline = true;
        advance(lexer);
        if (c == '/' && lexer->lookahead == '*') { advance(lexer); depth++; }
        else if (c == '*' && lexer->lookahead == '/') { advance(lexer); depth--; }
      }
      if (depth) return false;
    } else return false;
  }
}

// Read complete identifiers, including non-ASCII continuations. Only an
// entirely ASCII word can be a modifier/constructor keyword. The generated
// lexer still validates Unicode identifiers; this probe never emits them.
static bool constructor_word_char(int32_t c) {
  if (c < 128) return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') || c == '_';
  return !constructor_space(c);
}

// `constructor` as a whole word: the PRIMARY_CONSTRUCTOR_KEYWORD token, which the internal lexer
// cannot produce. False when it does not match, with the characters read so far advanced past.
static bool scan_constructor_keyword(TSLexer *lexer) {
  static const char keyword[] = "constructor";
  for (unsigned i = 0; i < sizeof(keyword) - 1; i++) {
    if (lexer->lookahead != keyword[i]) return false;
    advance(lexer);
  }
  if (constructor_word_char(lexer->lookahead)) return false;
  lexer->result_symbol = PRIMARY_CONSTRUCTOR_KEYWORD;
  lexer->mark_end(lexer);
  return true;
}

// Read a whole word with advance(); true when it is ASCII and fits `capacity` with its NUL. C-locale
// iswalnum can miss Unicode identifier suffixes, and a keyword probe must not turn catché or
// finallyé into a clause; only wholly ASCII words with a complete identifier boundary qualify.
// This probe emits no identifier.
static bool constructor_word(TSLexer *lexer, char *word, unsigned capacity) {
  unsigned length = 0;
  bool ascii = true;
  while (!lexer->eof(lexer) && constructor_word_char(lexer->lookahead)) {
    if (lexer->lookahead >= 128 || length + 1 >= capacity) ascii = false;
    if (length + 1 < capacity) word[length++] = (char)lexer->lookahead;
    advance(lexer);
  }
  word[length] = '\0';
  return ascii && length > 0;
}

static bool constructor_modifier(const char *word) {
  static const char *const words[] = {
    "public", "private", "protected", "internal", "actual", "expect",
    "final", "open", "abstract", "sealed", "const", "override", "lateinit",
    "tailrec", "operator", "infix", "inline", "external", "suspend", "data",
    "inner", "value", "annotation", "noinline", "crossinline", "vararg"
  };
  for (unsigned i = 0; i < sizeof(words) / sizeof(words[0]); i++)
    if (strcmp(word, words[i]) == 0) return true;
  return false;
}

typedef struct { char end; char kind; unsigned dollars; } ConstructorProbeFrame;
typedef Array(ConstructorProbeFrame) ConstructorProbeStack;

// Balanced annotation arguments/types, with strings, chars, quoted identifiers,
// nested/NUL comments and interpolation. An explicit stack keeps lookahead
// nesting independent of the C call stack and the scanner's serialized strings.
static bool constructor_balanced(TSLexer *lexer, char close) {
  ConstructorProbeStack stack;
  array_init(&stack);
  array_push(&stack, ((ConstructorProbeFrame){close, 0, 0}));
  advance(lexer);
  bool ok = false;
  while (stack.size && !lexer->eof(lexer)) {
    ConstructorProbeFrame frame = *array_back(&stack);
    int32_t c = lexer->lookahead;
    if (frame.kind) {
      if (frame.kind == 1 && c == '\\') { advance(lexer); if (!lexer->eof(lexer)) advance(lexer); continue; }
      if (c == frame.end) {
        advance(lexer);
        if (frame.kind != 2) { (void)array_pop(&stack); continue; }
        if (lexer->lookahead == '"') {
          advance(lexer);
          if (lexer->lookahead == '"') { advance(lexer); (void)array_pop(&stack); }
        }
        continue;
      }
      if (frame.end == '"' && c == '$') {
        unsigned run = 0;
        while (lexer->lookahead == '$') { advance(lexer); run++; }
        if (run >= frame.dollars && lexer->lookahead == '{') {
          advance(lexer);
          array_push(&stack, ((ConstructorProbeFrame){'}', 0, 0}));
        }
        continue;
      }
      advance(lexer); continue;
    }
    if (c == frame.end) { advance(lexer); (void)array_pop(&stack); continue; }
    if (c == '(' || c == '[' || c == '{' || (c == '<' && frame.end == '>')) {
      array_push(&stack, ((ConstructorProbeFrame){c == '(' ? ')' : c == '[' ? ']' : c == '{' ? '}' : '>', 0, 0}));
      advance(lexer); continue;
    }
    if (c == '/') { bool newline = false; if (!constructor_trivia(lexer, &newline)) continue; continue; }
    unsigned dollars = 1;
    if (c == '$') {
      dollars = 0;
      while (lexer->lookahead == '$') { advance(lexer); dollars++; }
      c = lexer->lookahead;
    }
    if (c == '"' || c == '\'' || c == '`') {
      char kind = c == '`' ? 3 : 1;
      advance(lexer);
      if (c == '"' && lexer->lookahead == '"') {
        advance(lexer);
        if (lexer->lookahead == '"') { advance(lexer); kind = 2; }
        else continue; // Empty ordinary string.
      }
      array_push(&stack, ((ConstructorProbeFrame){(char)c, kind, dollars}));
      continue;
    }
    advance(lexer);
  }
  ok = stack.size == 0;
  array_delete(&stack);
  return ok;
}

// A backtick-quoted name, read with advance(); false when the input ends before its closing
// backtick.
static bool constructor_quoted_name(TSLexer *lexer) {
  advance(lexer);
  while (!lexer->eof(lexer) && lexer->lookahead != '`') advance(lexer);
  if (lexer->eof(lexer)) return false;
  advance(lexer);
  return true;
}

static bool constructor_annotation(TSLexer *lexer) {
  advance(lexer); // @
  bool newline = false;
  if (!constructor_trivia(lexer, &newline)) return false;
  if (lexer->lookahead == '[') return constructor_balanced(lexer, ']');
  for (;;) {
    if (!constructor_trivia(lexer, &newline)) return false;
    if (lexer->lookahead == '`') {
      if (!constructor_quoted_name(lexer)) return false;
    } else {
      if (!constructor_word_char(lexer->lookahead)) return false;
      char ignored[32]; constructor_word(lexer, ignored, sizeof(ignored));
    }
    if (!constructor_trivia(lexer, &newline)) return false;
    if (lexer->lookahead == ':') {
      advance(lexer); // use-site target
      if (!constructor_trivia(lexer, &newline)) return false;
      if (lexer->lookahead == '[') return constructor_balanced(lexer, ']');
      continue;
    }
    if (lexer->lookahead == '.') { advance(lexer); continue; }
    break;
  }
  if (!constructor_trivia(lexer, &newline)) return false;
  if (lexer->lookahead == '<' && !constructor_balanced(lexer, '>')) return false;
  if (!constructor_trivia(lexer, &newline)) return false;
  if (lexer->lookahead == '(' && !constructor_balanced(lexer, ')')) return false;
  return true;
}

// Advance-only: every caller has already marked the token end.
static bool where_type_constraint_follows(TSLexer *lexer, bool *newline) {
  if (!constructor_trivia(lexer, newline)) return false;
  while (lexer->lookahead == '@') {
    if (!constructor_annotation(lexer)) return false;
    if (!constructor_trivia(lexer, newline)) return false;
  }
  if (lexer->lookahead == '`') {
    advance(lexer);
    while (!lexer->eof(lexer) && lexer->lookahead != '`' &&
           lexer->lookahead != '\n' && lexer->lookahead != '\r') advance(lexer);
    if (lexer->lookahead != '`') return false;
    advance(lexer);
  } else {
    if (!constructor_word_char(lexer->lookahead)) return false;
    while (constructor_word_char(lexer->lookahead)) advance(lexer);
  }
  if (!constructor_trivia(lexer, newline)) return false;
  if (lexer->lookahead != ':') return false;
  advance(lexer);
  return lexer->lookahead != ':';
}

// Kotlin attaches a `{` on the next line to a call, never to a name, and an
// open class delegate keeps the body that follows.
static bool brace_starts_statement(bool in_delegate, const bool *valid_symbols) {
  return valid_symbols[EXPRESSION_END_HINT] && !in_delegate &&
         !valid_symbols[STRING_CONTENT];
}

// A supertype reads its constructor arguments across a newline (KotlinParsing:
// parseDelegationSpecifier has no newline check), unlike a call: `: Base<T>\n(args)` is one
// supertype entry, in a class header and an object literal alike. The parser expects `by` after
// a supertype and after a property's name or type, where a backing field may follow instead;
// that tells the supertype apart (`val x: T` then `(a).b()` stays two statements).
static bool paren_continues_supertype(const bool *valid_symbols) {
  return valid_symbols[BY_DELEGATION_HINT] && !valid_symbols[BACKING_FIELD_HINT] &&
         !valid_symbols[STRING_CONTENT];
}

static bool scan_primary_constructor_hint(Scanner *scanner, TSLexer *lexer,
                                          const bool *valid_symbols) {
  bool newline = scanner->constructor_newline;
  scanner->constructor_newline = false;
  while (constructor_space(lexer->lookahead)) {
    if (lexer->lookahead == '\n' || lexer->lookahead == '\r') newline = true;
    skip(lexer);
  }
  // Emit leading block comments normally, rather than absorbing them into a
  // speculative hint. Line comments are handled by the internal lexer. This
  // also leaves class bodies/delegation clauses after comments available to
  // the ordinary lexer when there is no explicit constructor.
  if (lexer->lookahead == '/') {
    if (valid_symbols[MULTILINE_COMMENT] && scan_multiline_comment(lexer, &newline, NULL)) {
      scanner->constructor_newline = newline;
      return true;
    }
    return false; // Line comment or division; neither needs an ASI here.
  }
  lexer->mark_end(lexer);
  if (lexer->lookahead == ';') {
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    return valid_symbols[AUTOMATIC_SEMICOLON];
  }
  if (lexer->eof(lexer)) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    return valid_symbols[AUTOMATIC_SEMICOLON];
  }
  const bool header_newline = newline;
  int32_t first = lexer->lookahead;
  char first_word[32] = {0};
  bool first_identifier = true;
  for (;;) {
    if (lexer->lookahead == '@') {
      if (!constructor_annotation(lexer)) break;
    } else {
      char word[32] = {0};
      bool ascii = constructor_word(lexer, word, sizeof(word));
      if (first_identifier) { memcpy(first_word, word, sizeof(word)); first_identifier = false; }
      if (!ascii) break;
      if (strcmp(word, "constructor") == 0) {
        if (constructor_trivia(lexer, &newline) && lexer->lookahead == '(') {
          lexer->result_symbol = PRIMARY_CONSTRUCTOR_HINT;
          return true;
        }
        break;
      }
      if (!constructor_modifier(word)) break;
    }
    if (!constructor_trivia(lexer, &newline)) break;
  }
  // Preserve the old class-header continuations on a failed constructor probe.
  bool continuation = first == '(' || first == '{' || first == '<' ||
    first == '.' || first == '?' || first == ',' || first == '*' ||
    first == '%' || first == '>' || first == '=' || first == '|' || first == '&' ||
    strcmp(first_word, "as") == 0 ||
    (valid_symbols[BY_DELEGATION_HINT] && strcmp(first_word, "by") == 0);
  // Match main's class-header boundaries: :: and [ start a statement, while
  // a lone colon continues delegation. Bare ( can still open a constructor.
  if (strcmp(first_word, "where") == 0)
    continuation = where_type_constraint_follows(lexer, &newline);
  if (first == ':') { advance(lexer); continuation = lexer->lookahead != ':'; }
  if (strcmp(first_word, "finally") == 0) {
    continuation = valid_symbols[TRY_CLAUSE_HINT];
  }
  if (first == '!') { advance(lexer); continuation = lexer->lookahead == '='; }
  if (strcmp(first_word, "else") == 0) {
    continuation = true;
    if (constructor_trivia(lexer, &newline) && lexer->lookahead == '-') {
      advance(lexer);
      continuation = lexer->lookahead != '>';
    }
  }
  lexer->result_symbol = AUTOMATIC_SEMICOLON;
  return (header_newline ? !continuation : strcmp(first_word, "import") == 0) &&
    valid_symbols[AUTOMATIC_SEMICOLON];
}

// After a comment has been skipped following a line break, decide whether an
// automatic semicolon belongs before it: `false` if the next real token
// continues the previous statement, `true` otherwise. Uses skip() throughout so
// nothing is added to the pending token.
static bool trailing_lambda_follows(TSLexer *lexer, char leading_word[32]) {
  leading_word[0] = 0; bool annotated = false;
  bool newline = false;
  if (!constructor_trivia(lexer, &newline)) return false;
  while (lexer->lookahead == '@') {
    annotated = true;
    if (!constructor_annotation(lexer) || !constructor_trivia(lexer, &newline)) return false;
  }
  if (lexer->lookahead == '{') return true;
  if (lexer->lookahead == '`') {
    if (!constructor_quoted_name(lexer)) return false;
  } else {
    if (!constructor_word_char(lexer->lookahead)) return false;
    bool ascii = constructor_word(lexer, leading_word, 32);
    if (annotated || !ascii) leading_word[0] = 0;
  }
  if (!constructor_trivia(lexer, &newline) || lexer->lookahead != '@') return false;
  advance(lexer);
  return constructor_trivia(lexer, &newline) && lexer->lookahead == '{';
}

// The words that continue the statement before a line break, read whole by constructor_word,
// with the lexer right after the word. Every path that decides a line break by its next word
// asks here, so the decisions cannot drift apart. Reads with advance() only, as the probe of
// continuation_after_block_comment requires.
//
// - `as` is a cast of the expression before it.
// - `by` delegates, only where BY_DELEGATION_HINT is valid: elsewhere it is an identifier.
// - `where` continues a declaration only when a type constraint follows; `where()` is a call
//   to a function named where, and the statement before it has already ended.
// - `catch` and `finally` continue a try only in its clause slot (TRY_CLAUSE_HINT), including
//   malformed clauses; outside it, `catch(x)` is a call.
// - `field` continues a property that can still take an explicit backing field
//   (BACKING_FIELD_HINT), and ends the statement everywhere else: a variable may be named
//   `field`, so `var field = 0` followed by `field = 2` must stay two statements.
// - `else` continues an if, unless `->` follows: a when entry's `else ->`.
static bool word_continues_statement(const char *word, TSLexer *lexer, const bool *valid_symbols) {
  if (strcmp(word, "as") == 0) return true;
  if (strcmp(word, "by") == 0) return valid_symbols[BY_DELEGATION_HINT];
  bool newline = false;
  if (strcmp(word, "where") == 0) return where_type_constraint_follows(lexer, &newline);
  if (strcmp(word, "catch") == 0 || strcmp(word, "finally") == 0) return valid_symbols[TRY_CLAUSE_HINT];
  if (strcmp(word, "field") == 0) return valid_symbols[BACKING_FIELD_HINT];
  if (strcmp(word, "else") == 0) {
    if (!constructor_trivia(lexer, &newline) || lexer->lookahead != '-') return true;
    advance(lexer);
    return lexer->lookahead != '>';
  }
  return false;
}

// At the first character of the next line: does the line break before it end the statement?
// A word answers by word_continues_statement; anything else that reaches here ends it. Most
// lines start with a word, so one whose first letter starts none of the continuing words
// (`as`, `by`, `catch`, `else`, `field`, `finally`, `where`) ends the statement unread.
static bool semicolon_before_word(TSLexer *lexer, const bool *valid_symbols) {
  switch (lexer->lookahead) {
    case 'a': case 'b': case 'c': case 'e': case 'f': case 'w': break;
    default: return true;
  }
  char word[16];
  if (!constructor_word(lexer, word, sizeof(word))) return true;
  return !word_continues_statement(word, lexer, valid_symbols);
}

static bool call_prefix_continues(TSLexer *lexer, const bool *valid_symbols) {
  char word[32] = {0};
  if (trailing_lambda_follows(lexer, word)) return true;
  // A failed label probe must retain ordinary keyword continuations.
  return word_continues_statement(word, lexer, valid_symbols);
}

// A call may still take a trailing lambda (CALL_LAMBDA_HINT) and the next line starts with a
// word, an annotation or a backtick: call_prefix_continues decides.
static bool call_lambda_prefix_at(TSLexer *lexer, const bool *valid_symbols) {
  return valid_symbols[CALL_LAMBDA_HINT] &&
         (lexer->lookahead == '@' || constructor_word_char(lexer->lookahead) || lexer->lookahead == '`');
}

// The line before ended in a modifier word (MODIFIER_HINT) and the next one starts with a letter
// or `@`: semicolon_after_modifier_line decides. A primary constructor's modifiers (`class C
// private` with `constructor(...)` on the next line) take the PRIMARY_CONSTRUCTOR_KEYWORD paths.
static bool modifier_line_at(TSLexer *lexer, const bool *valid_symbols) {
  return valid_symbols[MODIFIER_HINT] && !valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
         !valid_symbols[STRING_CONTENT] && (iswalpha(lexer->lookahead) || lexer->lookahead == '@');
}

static bool semicolon_after_modifier_line(TSLexer *lexer, const bool *valid_symbols);

static bool asi_after_comment(TSLexer *lexer, bool in_delegate, const bool *valid_symbols) {
  if (call_lambda_prefix_at(lexer, valid_symbols)) return !call_prefix_continues(lexer, valid_symbols);
  if (modifier_line_at(lexer, valid_symbols)) return semicolon_after_modifier_line(lexer, valid_symbols);
  switch (lexer->lookahead) {
    // '[' is absent, and '(' and ':' are handled separately: a call's '(',
    // an index's '[' and a callable reference's '::' each begin a new
    // statement, but a supertype's '(' does not. Matches the non-comment path above.
    case '{':
      return brace_starts_statement(in_delegate, valid_symbols);
    case '(':
      return !paren_continues_supertype(valid_symbols);
    case '.': case ',': case '*': case '%':
    case '>': case '<': case '=':
    case '?': case '|': case '&': case '/':
      return false;
    case ':':
      skip(lexer);
      if (lexer->lookahead == ':') return true;
      return false;
    case '!':
      skip(lexer);
      if (lexer->lookahead == '=') return false;
      return true;
    case '-':
      skip(lexer);
      return lexer->lookahead != '>';
    default:
      return semicolon_before_word(lexer, valid_symbols);
  }
}

// Like asi_after_comment, but advance-only: the pending comment must be
// re-read at its original position, with no keyword/comment text skipped away.
static bool continuation_after_block_comment(TSLexer *lexer, bool in_delegate, const bool *valid_symbols) {
  bool newline = false;
  if (!constructor_trivia(lexer, &newline)) return !lexer->eof(lexer);
  if (call_lambda_prefix_at(lexer, valid_symbols)) return call_prefix_continues(lexer, valid_symbols);
  switch (lexer->lookahead) {
    case '{': return !brace_starts_statement(in_delegate, valid_symbols);
    case '(': return paren_continues_supertype(valid_symbols);
    case '.': case ',': case '*': case '%': case '>': case '<': case '=':
    case '?': case '|': case '&': return true;
    case ':': advance(lexer); return lexer->lookahead != ':';
    case '!': advance(lexer); return lexer->lookahead == '=';
    case '-': advance(lexer); return lexer->lookahead == '>';
    default: break;
  }
  char word[32] = {0};
  if (!constructor_word(lexer, word, sizeof(word))) return false;
  return word_continues_statement(word, lexer, valid_symbols);
}

static bool resume_pending_comment(Scanner *scanner, TSLexer *lexer,
                                    const bool *valid_symbols) {
  if (scanner->comment.semi_owed) {
    if (!valid_symbols[AUTOMATIC_SEMICOLON]) return false;
    lexer->mark_end(lexer);
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    scanner->comment.semi_owed = false;
    return true;
  }
  if (!valid_symbols[MULTILINE_COMMENT]) return false;
  uint32_t length = scanner->comment.end_byte - scanner->comment.start_byte;
  uint32_t consumed = 0;
  while (iswspace(lexer->lookahead)) skip(lexer);
  bool matched = scan_multiline_comment(lexer, NULL, &consumed);
  scanner->comment = (PendingComment){0};
  return matched && consumed == length;
}

// `cursor_clean` is an out-param for the `return false` case only. Most of the
// keyword probes below skip over source text to make their decision, and skip()
// drags token_start with it, so on a false return the caller can no longer lex a
// token at the original position -- anything it produced would silently swallow
// the skipped text as padding. It therefore defaults to false (dirty) and is set
// only by the handful of returns that are provably still at the first
// non-whitespace character. Skipping *whitespace* is safe (that is what skip() is
// for); skipping comment or keyword text is not.
// Words Kotlin reads as modifiers in a declaration's modifier list (KtTokens.MODIFIER_KEYWORDS,
// without the hard keywords `in` and `fun`), and the keywords that start a declaration.
static const char *const MODIFIER_WORDS[] = {
  "abstract", "actual", "annotation", "companion", "const", "crossinline", "data", "enum", "expect",
  "external", "final", "infix", "inline", "inner", "internal", "lateinit", "noinline", "open",
  "operator", "out", "override", "private", "protected", "public", "reified", "sealed", "suspend",
  "tailrec", "vararg", "value",
};

static const char *const DECLARATION_WORDS[] = {
  "class", "constructor", "fun", "interface", "object", "typealias", "val", "var",
};

static bool word_in(const char *word, const char *const *words, unsigned count) {
  for (unsigned i = 0; i < count; i++) {
    if (strcmp(word, words[i]) == 0) return true;
  }
  return false;
}

#define WORD_IN(word, words) word_in(word, words, sizeof(words) / sizeof(words[0]))

// At a letter right after a closing brace (see BLOCK_END_HINT): does a declaration start here?
// Reads the word whole with constructor_word, so a word with a non-ASCII character is none of
// the keywords whatever the host's locale, and a false answer leaves the cursor dirty.
static bool block_end_starts_declaration(TSLexer *lexer) {
  char word[16];
  if (!constructor_word(lexer, word, sizeof(word))) return false;
  return WORD_IN(word, DECLARATION_WORDS) || WORD_IN(word, MODIFIER_WORDS);
}

// An explicit `;` separates statements, except the one Kotlin allows between an if's consequence
// and its `else` (ifExpression: `if (c) a(); else b()`, also `if (c)\n  "a";\nelse\n  "b"`),
// which belongs to if_expression. Called after the `;` is consumed and marked; true for that `;`,
// so the caller declines it and the internal lexer produces the literal `;`. A when entry's
// `else ->` keeps the separator.
static bool semicolon_before_else(TSLexer *lexer) {
  if (!skip_whitespace_and_comments(lexer)) return false;
  if (lexer->lookahead != 'e') return false;
  if (!scan_for_word(lexer, "lse", 3)) return false;
  return !followed_by_arrow(lexer);
}

// A line break after a modifier word (MODIFIER_HINT is valid), at the first letter or `@` of the
// next line: does a semicolon go at the line break? Kotlin's parser reads a statement as a
// declaration first, takes every modifier word and annotation across line breaks, and keeps them
// when a declaration keyword follows (parseLocalDeclaration), so `private` alone on a line before
// `fun x()` is a modifier and no semicolon ends it. Otherwise the modifier word was an expression
// statement (`open` alone, then `foo()`). A word that is no modifier gets word_continues_statement,
// as the switch in scan_automatic_semicolon cannot read it again. Words are read whole
// with constructor_word, so one with a non-ASCII character is no keyword whatever the host's
// locale (`Ŧun` is not `fun`); a false answer leaves the cursor dirty.
//
// The scan at each line break of a run of modifier lines reads the rest of the run, so the run
// it reads is capped at MODIFIER_CHAIN_MAX words: N lines of `private` would otherwise cost
// about N²/2 steps (16,000 lines took 15 s), and with the cap each line break reads at most that
// many words. Kotlin's parser has no such bound, so a run longer than the cap before its
// declaration keyword takes the semicolon at its first line break where PSI reads one
// declaration; no list of real modifiers comes near it (Kotlin has about thirty).
#define MODIFIER_CHAIN_MAX 256
static bool semicolon_after_modifier_line(TSLexer *lexer, const bool *valid_symbols) {
  char word[16];
  bool after_modifier = false;
  for (unsigned modifiers = 0;; modifiers++) {
    if (lexer->lookahead == '@') return false;
    if (modifiers == MODIFIER_CHAIN_MAX) return true;
    if (!constructor_word(lexer, word, sizeof(word))) return true;
    if (WORD_IN(word, DECLARATION_WORDS)) return false;
    if (!WORD_IN(word, MODIFIER_WORDS)) break;
    after_modifier = true;
    // A comment between the modifiers is whitespace to Kotlin (`suspend // c` before `fun b()`);
    // a bare `/` cannot follow a modifier word, so the modifier word was an expression.
    if (!skip_whitespace_and_comments(lexer)) return true;
  }
  if (after_modifier) return true;
  return !word_continues_statement(word, lexer, valid_symbols);
}

static bool scan_automatic_semicolon(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols,
                                     bool *cursor_clean) {
  lexer->result_symbol = AUTOMATIC_SEMICOLON;
  lexer->mark_end(lexer);

  uint32_t prefix_bytes = 0;
  bool sameline = true;
  for (;;) {
    if (lexer->eof(lexer)) return true;

    if (lexer->lookahead == ';') {
      advance(lexer);
      lexer->mark_end(lexer);
      return !semicolon_before_else(lexer);
    }

    if (!iswspace(lexer->lookahead)) break;

    if (lexer->lookahead == '\n') {
      advance_counted(lexer, &prefix_bytes, true);
      sameline = false;
      break;
    }

    if (lexer->lookahead == '\r') {
      advance_counted(lexer, &prefix_bytes, true);

      if (lexer->lookahead == '\n') advance_counted(lexer, &prefix_bytes, true);

      sameline = false;
      break;
    }

    advance_counted(lexer, &prefix_bytes, true);
  }

  // Skip whitespace and comments. Unreachable today (the helper only skips
  // whitespace and always succeeds); left dirty deliberately, so that if it
  // ever does skip comments the conservative answer is already in place.
  if (!scan_whitespace_and_comments(lexer, &prefix_bytes))
    return false;

  if (sameline) {
    // Right after the `}` of a class body or a block (BLOCK_END_HINT, never produced), Kotlin
    // starts the next declaration without a separator: a file's declarations
    // (parseTopLevelDeclaration) and a class body's members follow each other, so generated code
    // writes `}enum class E {` and `fun a() {}fun b() {}`. A declaration keyword, a modifier word or
    // an annotation (`fun a() {} @A fun b() {}`) there takes a semicolon; any other word (`else`,
    // `catch`, `as`) takes nothing, and a false answer leaves the cursor dirty.
    //
    // Between the statements of a block Kotlin wants a `;` or a line break (parseStatements:
    // "Unexpected tokens"), so `fun f() { fun a() {} fun b() {} }` is an error there. Here it is
    // not: telling a block from a file or a class body needs a separator token of their own, and
    // the parse states of block statements then no longer share with those of members, which cost
    // 2,113 states (28 % of the parse table, 5.2 MB of src/parser.c) for no valid code.
    if (valid_symbols[BLOCK_END_HINT] && !valid_symbols[STRING_CONTENT]) {
      if (lexer->lookahead == '@') return true;
      if (iswalpha(lexer->lookahead)) return block_end_starts_declaration(lexer);
    }
    switch (lexer->lookahead) {
      // Insert imaginary semicolon before an 'import' but not in front
      // of other words or keywords starting with 'i'
      case 'i':
        return scan_for_word(lexer, "mport", 5);

      case ';':
        advance(lexer);
        lexer->mark_end(lexer);
        return !semicolon_before_else(lexer);

      // Don't insert a semicolon in other cases. Nothing but whitespace has
      // been skipped, so a string or comment token may still start here.
      default:
        *cursor_clean = true;
        return false;
    }
  }

  if (call_lambda_prefix_at(lexer, valid_symbols)) return !call_prefix_continues(lexer, valid_symbols);
  if (modifier_line_at(lexer, valid_symbols)) return semicolon_after_modifier_line(lexer, valid_symbols);

  // Characters that continue the previous expression across a newline.
  //
  // '(' and '[' are deliberately absent. Kotlin requires a call's '(' and an
  // index's '[' to sit on the same line as what they apply to, so a line
  // starting with one begins a new statement:
  //
  //     ftp.close()
  //     (ftp.executor as ExecutorService).awaitTermination(1, SECONDS)
  //
  // is two statements, not `close()(...)`. Treating them as continuations
  // merged the lines with no error node at all. The exception is a supertype's
  // argument list (see paren_continues_supertype).
  //
  // '{' stays: `foo()` followed by `{ … }` on the next line is a trailing
  // lambda, which is one expression — confirmed against the Kotlin PSI, as
  // was every other character in this set.
  //
  // '<' stays: a line may open with type arguments that continue the previous
  // construct — `is T` then `<X>` is one type, which the Kotlin PSI confirms.
  switch (lexer->lookahead) {
      case '{':
        if (brace_starts_statement(scanner->in_delegate, valid_symbols)) return true;
        *cursor_clean = true;
        return false;

      case '(':
        if (!paren_continues_supertype(valid_symbols)) return true;
        *cursor_clean = true;
        return false;

      case ',':
      case '.':
      case '*':
      case '%':
      case '>':
      case '<':
      case '=':
      case '?':
      case '|':
      case '&':
        // Decided from lookahead alone, so the cursor never moved past it and
        // e.g. scan_import_dot can still claim the '.'.
        *cursor_clean = true;
        return false;

      // ':' continues the previous construct — `class A` then `: B()` is one
      // declaration — but '::' opens a callable reference, which starts a new
      // statement:
      //
      //     suspend fun g() {}
      //     ::g.use()
      case ':':
        skip(lexer);
        if (lexer->lookahead == ':') return true;
        return false;

      // Handle `/` — could be division, line comment, or block comment.
      // For division: no ASI (continuation operator).
      // For line comments (`//`): skip the comment(s) and check the next
      // real token. If continuation, suppress ASI (return false — tree-sitter
      // resets, parses line_comment internally, then re-checks ASI).
      // If non-continuation, insert ASI (return true at original mark_end).
      // Block comments (`/*`) use the same decide-first strategy; the branch
      // below documents the two shapes where the internal token cannot help.
      case '/': {
        advance(lexer);
        if (lexer->lookahead == '/') {
          // Line comment — skip to end of line using skip() since
          // line_comment is an internal token (the grammar handles it).
          skip(lexer);
          while (lexer->lookahead != '\n' && lexer->lookahead != '\r' &&
                 lexer->lookahead != 0 && !lexer->eof(lexer)) {
            skip(lexer);
          }
          // Skip any whitespace and further comments after this line comment.
          // A bare '/' (division) after comments is a continuation operator.
          if (!skip_whitespace_and_comments(lexer)) return false;
          // Now check the next real token.
          return asi_after_comment(lexer, scanner->in_delegate, valid_symbols);
        } else if (lexer->lookahead == '*') {
          // Block comment after a line break. Read through it to find out what
          // comes *after* it, but leave mark_end where it is so the decision
          // below can still put a zero-width ASI in front of the comment.
          // Moving the cursor here is not binding: tree-sitter rewinds to
          // mark_end once a token is produced, and throws the whole scan away
          // if we return false.
          advance(lexer); // '*'
          uint32_t comment_bytes = 2; // Opening /* already consumed.
          unsigned nesting_depth = 1;
          bool nested = false;
          bool has_nul = false;
          while (nesting_depth > 0 && !lexer->eof(lexer)) {
            if (lexer->lookahead == '*') {
              advance_counted(lexer, &comment_bytes, false);
              if (lexer->lookahead == '/') {
                advance_counted(lexer, &comment_bytes, false);
                nesting_depth--;
              }
            } else if (lexer->lookahead == '/') {
              advance_counted(lexer, &comment_bytes, false);
              if (lexer->lookahead == '*') {
                advance_counted(lexer, &comment_bytes, false);
                nesting_depth++;
                nested = true;
              }
            } else {
              // A literal NUL is comment content, not EOF — see #279.
              if (lexer->lookahead == 0) has_nul = true;
              advance_counted(lexer, &comment_bytes, false);
            }
          }
          if (nesting_depth > 0) {
            // Unterminated at EOF. Nothing follows that could continue the
            // statement, so the semicolon belongs in front of the comment;
            // scan_multiline_comment produces the comment on the next call.
            return true;
          }
          if (nested || has_nul) {
            if (continuation_after_block_comment(lexer, scanner->in_delegate, valid_symbols) &&
                valid_symbols[COMMENT_CONTINUATION_HINT] &&
                !valid_symbols[STRING_CONTENT] &&
                prefix_bytes <= UINT32_MAX - comment_bytes) {
              scanner->comment = (PendingComment){true, prefix_bytes,
                prefix_bytes + comment_bytes, false};
              lexer->result_symbol = COMMENT_CONTINUATION_HINT;
            }
            // A non-continuation retains the hidden ASI at the original mark.
            // A continuation emits a hidden extra there, without ending the
            // expression; the next scan emits the normal extra comment.
            return true;
          }
          // Skip any whitespace and further comments after this block comment.
          // A bare '/' (division) after comments is a continuation operator.
          if (!skip_whitespace_and_comments(lexer)) return false;
          return asi_after_comment(lexer, scanner->in_delegate, valid_symbols);
        }

        // Bare `/` (not `//` or `/*`) — division. No ASI.
        return false;
      }

      // In Kotlin, `+` and `-` after a newline are always prefix operators,
      // not binary continuation. If a binary operation is intended, the
      // operator must be placed at the end of the previous line:
      //   a +       // binary: a + b
      //     b
      //   a         // prefix: a; +b
      //   + b
      // The grammar ensures AUTOMATIC_SEMICOLON is only valid where a
      // statement could end, so this won't fire inside () or [] where
      // newlines don't terminate statements.
      case '+':
        return true;

      // `->` is no prefix operator: it ends a lambda's parameters, which may sit
      // on the line before it, `forEach { item\n -> ... }` (Kotlin's parser looks
      // for the arrow of a parameter list across newlines).
      case '-':
        skip(lexer);
        return lexer->lookahead != '>';

      // Don't insert a semicolon before `!=`, but do insert one before a unary `!`.
      case '!':
        skip(lexer);
        return lexer->lookahead != '=';

      // A visibility modifier (`internal`, `public`, `private`, `protected`) on the next line
      // before `constructor` in a class declaration, or before `field` of an explicit backing
      // field, continues the declaration. No other word starting with `i` or `p` continues a
      // statement (Kotlin has no `instanceof`; it uses `is`).
      case 'i':
      case 'p':
        if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
            !valid_symbols[STRING_CONTENT] &&
            check_visibility_then(lexer, "constructor", 11)) {
          return false;
        }
        if (valid_symbols[BACKING_FIELD_HINT] &&
            !valid_symbols[STRING_CONTENT] &&
            check_visibility_then(lexer, "field", 5)) {
          return false;
        }
        return true;

      // Don't insert a semicolon before `constructor` if the parser expects
      // a primary constructor (class declaration context). In class body
      // context, PRIMARY_CONSTRUCTOR_KEYWORD won't be valid, so ASI is
      // inserted normally before secondary constructors.
      // Guard against error recovery mode where all symbols are valid.
      // Instead of suppressing ASI, we emit the constructor keyword directly
      // since it's an external token and the internal lexer won't match it.
      // If `constructor` does not match, characters were advanced past and
      // `catch` can no longer be read: the automatic semicolon goes in.
      case 'c':
        if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
            !valid_symbols[STRING_CONTENT]) {
          scan_constructor_keyword(lexer);
          return true;
        }
        return semicolon_before_word(lexer, valid_symbols);

      // Don't insert a semicolon before an annotation that precedes 'constructor'
      // e.g. `class Foo\n@Bar\nconstructor(...)` — the @Bar is a constructor modifier
      case '@':
        if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
            !valid_symbols[STRING_CONTENT] &&
            check_annotations_then(lexer, "constructor", 11)) {
          return false;
        }
        if (valid_symbols[BACKING_FIELD_HINT] &&
            !valid_symbols[STRING_CONTENT] &&
            check_annotations_then(lexer, "field", 5)) {
          return false;
        }
        return true;

      case ';':
        advance(lexer);
        lexer->mark_end(lexer);
        return !semicolon_before_else(lexer);

      // `as`, `by`, `else`, `where`, `catch`, `finally` and `field`: see word_continues_statement.
      default:
        return semicolon_before_word(lexer, valid_symbols);
  }
}


// Scan a dot in import identifiers. Matches '.' normally, but when the dot
// is followed by a newline and then the 'import' keyword, produces an
// AUTOMATIC_SEMICOLON (zero-width, before the dot) instead. This cleanly
// terminates the current import_header, preventing malformed imports
// (e.g. trailing dots) from bleeding into subsequent valid imports.
static bool scan_import_dot(TSLexer *lexer) {
  if (lexer->lookahead != '.') return false;

  // Mark end BEFORE consuming the dot — this is where ASI would go
  lexer->mark_end(lexer);

  advance(lexer);

  // Peek ahead: skip horizontal whitespace, check for newline
  bool found_newline = false;
  while (iswspace(lexer->lookahead)) {
    if (lexer->lookahead == '\n' || lexer->lookahead == '\r') {
      found_newline = true;
    }
    skip(lexer);
  }

  if (found_newline && lexer->lookahead == 'i' &&
      scan_for_word(lexer, "mport", 5)) {
    // Trailing dot followed by 'import' on next line — produce ASI
    // instead of the dot. mark_end was set before the dot, so the
    // semicolon is zero-width at that position.
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    return true;
  }

  // Normal dot — include it in the token
  lexer->result_symbol = IMPORT_DOT;
  lexer->mark_end(lexer);
  return true;
}

// After a `?` of a callable-reference receiver: do further `?`s and then `::` follow? Kotlin's
// lexer reads comments and line breaks as whitespace, so `X?/*c*/?::x`, `X?` / newline / `?::x`
// and `a?` / newline / `::b` are one reference each, as are `a? ::b` and `X ?? :: x` (JetBrains
// fixtures). Reads with advance() past the marked end of the `?` token.
static bool quest_chain_reaches_reference(TSLexer *lexer) {
  for (;;) {
    bool newline = false;
    if (!constructor_trivia(lexer, &newline)) return false;
    if (lexer->lookahead == '?') {
      advance(lexer);
      continue;
    }
    if (lexer->lookahead != ':') return false;
    advance(lexer);
    return lexer->lookahead == ':';
  }
}

// Where a companion object may start (COMPANION_OBJECT_HINT is valid): do the words `companion`
// and `object` follow? The hint is zero-width at the `companion`, and without it `companion` is a
// member_modifier (`companion fun String.f()`, `@Ann companion val`). Only a `c` is read past: a
// member that starts otherwise is left to the rest of the scan.
static bool scan_companion_object_hint(TSLexer *lexer, bool *decided) {
  *decided = false;
  while (iswspace(lexer->lookahead)) skip(lexer);
  if (lexer->lookahead != 'c') return false;
  *decided = true;
  lexer->mark_end(lexer);
  char word[16];
  if (!constructor_word(lexer, word, sizeof(word)) || strcmp(word, "companion") != 0) return false;
  bool newline = false;
  if (!constructor_trivia(lexer, &newline)) return false;
  if (!constructor_word(lexer, word, sizeof(word)) || strcmp(word, "object") != 0) return false;
  lexer->result_symbol = COMPANION_OBJECT_HINT;
  return true;
}

static bool scan_token(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
  // Pending work takes priority over constructor, ASI, string and
  // interpolation paths. No other branch may consume its source as padding.
  if (scanner->comment.pending)
    return resume_pending_comment(scanner, lexer, valid_symbols);
  if (valid_symbols[DELEGATE_START_HINT] && !valid_symbols[STRING_CONTENT]) {
    lexer->mark_end(lexer);
    scanner->in_delegate = true;
    lexer->result_symbol = DELEGATE_START_HINT;
    return true;
  }
  if (valid_symbols[DELEGATE_END_HINT] && !valid_symbols[STRING_CONTENT]) {
    lexer->mark_end(lexer);
    scanner->in_delegate = false;
    lexer->result_symbol = DELEGATE_END_HINT;
    return true;
  }
  if (valid_symbols[PRIMARY_CONSTRUCTOR_HINT] && !valid_symbols[STRING_CONTENT])
    return scan_primary_constructor_hint(scanner, lexer, valid_symbols);
  if (valid_symbols[COMPANION_OBJECT_HINT] && !valid_symbols[STRING_CONTENT] &&
      !valid_symbols[AUTOMATIC_SEMICOLON]) {
    bool decided;
    if (scan_companion_object_hint(lexer, &decided)) return true;
    if (decided) return false;
  }
  scanner->constructor_newline = false;
  // TRY_CLAUSE_HINT is optional before catch/finally and is never emitted.
  // Its validity identifies clause positions without changing keyword nodes.
  // BY_DELEGATION_HINT is declared in the grammar (optional, before `by` in
  // explicit_delegation and property_delegate) purely so it appears in
  // valid_symbols when the parser is in a delegation context. The scanner
  // never emits it; it's used only as a context flag in scan_automatic_semicolon.
  if (valid_symbols[AUTOMATIC_SEMICOLON]) {
    bool cursor_clean = false;
    bool ret = scan_automatic_semicolon(scanner, lexer, valid_symbols, &cursor_clean);
    // If we fail to find an automatic semicolon, it's still possible that we may
    // want to lex a string or comment later -- but only if the ASI scan left the
    // cursor at the first non-whitespace character. Once it has skipped over
    // comment or keyword text, token_start has moved and any token produced
    // below would silently swallow everything in between as padding.
    //
    // Error recovery is exempt. There tree-sitter marks every external symbol
    // valid at once (STRING_CONTENT alongside AUTOMATIC_SEMICOLON is the
    // giveaway -- a statement can never end inside a string), and that is the
    // only way MULTILINE_COMMENT or STRING_START is reachable after a keyword
    // probe. The text is already bound for an ERROR node, so an external token
    // with a dragged start beats no token at all: without this exemption the
    // internal lexer tears an unterminated `/*` into `/` plus a bogus
    // wildcard_import, and a nested comment collapses to zero width.
    if (ret) return ret;
    if (!cursor_clean && !valid_symbols[STRING_CONTENT]) return false;
  }

  // A backtick-quoted identifier. The internal lexer cannot express this:
  // a character class stops at the NUL that terminates its input buffer, so
  // `a<NUL>b` tore into pieces, while Kotlin's lexer accepts any character
  // here except a backtick or a line terminator. Scanning it externally and
  // testing `eof` rather than a sentinel byte carries the NUL through.
  //
  // With `@` right after the closing backtick it is a label, `` `if`@ ``, one
  // token as in Kotlin's lexer, where a label is valid.
  if ((valid_symbols[QUOTED_IDENTIFIER] || valid_symbols[QUOTED_LABEL]) && !valid_symbols[STRING_CONTENT]) {
    while (iswspace(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead == '`') {
      advance(lexer);
      bool content = false;
      while (!lexer->eof(lexer) && lexer->lookahead != '`' &&
             lexer->lookahead != '\n' && lexer->lookahead != '\r') {
        content = true;
        advance(lexer);
      }
      if (content && lexer->lookahead == '`') {
        advance(lexer);
        lexer->mark_end(lexer);
        if (valid_symbols[QUOTED_LABEL] && lexer->lookahead == '@') {
          advance(lexer);
          lexer->mark_end(lexer);
          lexer->result_symbol = QUOTED_LABEL;
          return true;
        }
        if (!valid_symbols[QUOTED_IDENTIFIER]) return false;
        lexer->result_symbol = QUOTED_IDENTIFIER;
        return true;
      }
      return false;
    }
  }

  // A `?` in a callable-reference receiver: `String?::plus`.
  //
  // The internal lexer takes the longest valid token, and in expression
  // position `?:` is the elvis operator, so `String?::plus` lexed as elvis
  // followed by `:` and parsed as an elvis_expression wrapped around an
  // ERROR. `String??::plus` parsed correctly all along, because the first `?`
  // cannot begin an elvis there -- the same construct failing or not purely
  // on what followed the `?`.
  //
  // The external scanner runs before the internal lexer, so claiming the `?`
  // here settles it. Two guards keep that from reaching anything else:
  // valid_symbols restricts it to the receiver position, and the `?` is only
  // claimed when a `::` actually follows it, directly or through further
  // `?`s. Claiming on valid_symbols alone broke safe navigation -- `a?.b` and
  // a `?` after a newline -- because the receiver position overlaps those.
  //
  // mark_end is set straight after the `?`, so the lookahead below inspects
  // the following characters without lengthening the token.
  //
  // The second `?` of `X? ?::x` starts after whitespace, a line break included
  // (`X?` / newline / `?::x`). Skip it here rather than rely on the ASI scan
  // above having stepped over it, which happens only where the parse state also
  // accepts a semicolon. A comment before it is an extra of its own.
  if (valid_symbols[CALLABLE_REFERENCE_QUEST] && !valid_symbols[STRING_CONTENT])
    while (iswspace(lexer->lookahead)) skip(lexer);
  if (valid_symbols[CALLABLE_REFERENCE_QUEST] && lexer->lookahead == '?') {
    advance(lexer);
    lexer->mark_end(lexer);
    if (!quest_chain_reaches_reference(lexer)) return false;
    lexer->result_symbol = CALLABLE_REFERENCE_QUEST;
    return true;
  }

  // Match dots in import identifiers, refusing dots that would cause
  // malformed imports to bleed into subsequent import statements.
  if (valid_symbols[IMPORT_DOT]) {
    if (scan_import_dot(lexer)) return true;
  }

  // Match 'constructor' keyword for primary constructors when on the same line
  // (the cross-newline case is handled inside scan_automatic_semicolon)
  if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] && !valid_symbols[STRING_CONTENT]) {
    while (iswspace(lexer->lookahead)) skip(lexer);
    if (scan_constructor_keyword(lexer)) return true;
  }

  // content, end, or interpolation start
  if (valid_symbols[STRING_CONTENT] || valid_symbols[INTERPOLATION_EXPRESSION_START] ||
      valid_symbols[INTERPOLATION_IDENTIFIER_START]) {
    if (scan_string_content(lexer, &scanner->strings, valid_symbols)) return true;
  }

  // a string might follow after some whitespace, so we can't lookahead
  // until we get rid of it
  while (iswspace(lexer->lookahead)) skip(lexer);

  if (valid_symbols[STRING_START] && scan_string_start(lexer, &scanner->strings)) {
    lexer->result_symbol = STRING_START;
    return true;
  }

  if (valid_symbols[MULTILINE_COMMENT] && scan_multiline_comment(lexer, NULL, NULL)) {
    return true;
  }

  return false;
}

// A `;` after a separator (FURTHER_SEMICOLON valid) is one only with whitespace before it: the
// scan starts where the `;` before it ended, and Kotlin's lexer reads `;;` as one token,
// DOUBLE_SEMICOLON, which its parser rejects. A comment between them (`;/*c*/;`) is no
// whitespace here, so that pair is an error too, where Kotlin reads two semicolons.
// The characters of a character literal up to its next escape, closing quote or line break
// (CHARACTER_CONTENT valid, only inside one): any character, a NUL too, which the internal lexer
// cannot carry through a character class. The scan starts right after the previous part, so a
// space or a `/*` is content, as it is for Kotlin's lexer.
static bool scan_character_content(TSLexer *lexer) {
  bool content = false;
  while (!lexer->eof(lexer) && lexer->lookahead != '\'' && lexer->lookahead != '\\' &&
         lexer->lookahead != '\n' && lexer->lookahead != '\r') {
    advance(lexer);
    content = true;
  }
  lexer->result_symbol = CHARACTER_CONTENT;
  return content;
}

// Kotlin's hard keywords, which grammar.js reserves: none is the name of a label.
static const char *const HARD_KEYWORD_WORDS[] = {
  "as", "break", "class", "continue", "do", "else", "false", "for", "fun", "if", "in", "interface",
  "is", "null", "object", "package", "return", "super", "this", "throw", "true", "try", "typealias",
  "typeof", "val", "var", "when", "while",
};

// The name right after `break@`, `return@`, `this@` and the like (LABEL_IDENTIFIER valid): a
// whole word at the scan's start, which is where the `@` ended, and no hard keyword. Anything
// else leaves the position to the internal lexer, which has no token for it.
static bool scan_label_identifier(TSLexer *lexer) {
  if (!constructor_word_char(lexer->lookahead) || iswdigit(lexer->lookahead)) return false;
  char word[16];
  if (constructor_word(lexer, word, sizeof(word)) && WORD_IN(word, HARD_KEYWORD_WORDS)) return false;
  lexer->mark_end(lexer);
  lexer->result_symbol = LABEL_IDENTIFIER;
  return true;
}

bool tree_sitter_kotlin_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  Scanner *scanner = payload;
  if (valid_symbols[CHARACTER_CONTENT] && !valid_symbols[STRING_CONTENT]) return scan_character_content(lexer);
  if (valid_symbols[LABEL_IDENTIFIER] && !valid_symbols[STRING_CONTENT] && lexer->lookahead != '`') {
    return scan_label_identifier(lexer);
  }
  if (valid_symbols[FURTHER_SEMICOLON] && !valid_symbols[STRING_CONTENT] &&
      (lexer->lookahead == ';' || iswspace(lexer->lookahead))) {
    if (lexer->lookahead == ';') return false;
    // Whitespace, then maybe a `;`. No token valid after a separator depends on a line break
    // before it (the separator itself is not valid here), so the scan below goes on from there.
    while (iswspace(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead == ';') {
      advance(lexer);
      lexer->result_symbol = FURTHER_SEMICOLON;
      return true;
    }
  }
  bool found = scan_token(scanner, lexer, valid_symbols);
  if (found && lexer->result_symbol == AUTOMATIC_SEMICOLON) scanner->in_delegate = false;
  return found;
}

void *tree_sitter_kotlin_external_scanner_create() {
  Scanner *scanner = ts_calloc(1, sizeof(Scanner));
  if (scanner == NULL) abort();
  array_init(&scanner->strings);
  return scanner;
}

void tree_sitter_kotlin_external_scanner_destroy(void *payload) {
  Scanner *scanner = payload;
  array_delete(&scanner->strings);
  ts_free(scanner);
}

// Ordinary states keep their existing byte-for-byte encoding. A pending
// comment uses an explicit header and 11 bits per string frame (10 prefix
// bits plus the raw/triple bit), preserving the existing 512-frame capacity.
#define PENDING_HEADER_BYTES 11
#define PENDING_FRAME_BITS 11
#define MAX_STRING_FRAMES (TREE_SITTER_SERIALIZATION_BUFFER_SIZE / 2)
_Static_assert(PENDING_HEADER_BYTES + (MAX_STRING_FRAMES * PENDING_FRAME_BITS + 7) / 8
               <= TREE_SITTER_SERIALIZATION_BUFFER_SIZE,
               "pending comment and maximum string stack must fit serialization");

static void write_u32(char *buffer, uint32_t value) {
  for (unsigned i = 0; i < 4; i++) buffer[i] = (char)(value >> (8 * i));
}

static uint32_t read_u32(const char *buffer) {
  uint32_t value = 0;
  for (unsigned i = 0; i < 4; i++) value |= (uint32_t)(uint8_t)buffer[i] << (8 * i);
  return value;
}

unsigned tree_sitter_kotlin_external_scanner_serialize(void *payload, char *buffer) {
  Scanner *scanner = payload;
  Stack *stack = &scanner->strings;
  unsigned n = stack->size;
  if (n > TREE_SITTER_SERIALIZATION_BUFFER_SIZE || n % 2) return 0;
  if (scanner->comment.pending) {
    unsigned frames = n / 2;
    unsigned length = PENDING_HEADER_BYTES + (frames * PENDING_FRAME_BITS + 7) / 8;
    memset(buffer, 0, length);
    // A legacy delimiter has low bits 2/3, so low bits 0 plus bit 3
    // unambiguously identify this format, including an empty string stack.
    buffer[0] = 8 | (scanner->constructor_newline ? 4 : 0) |
      (scanner->comment.semi_owed ? 16 : 0) | (scanner->in_delegate ? 32 : 0);
    buffer[1] = (char)frames;
    buffer[2] = (char)(frames >> 8);
    write_u32(buffer + 3, scanner->comment.start_byte);
    write_u32(buffer + 7, scanner->comment.end_byte);
    for (unsigned i = 0; i < frames; i++) {
      uint8_t delimiter = (uint8_t)stack->contents[2 * i];
      unsigned value = ((delimiter >> PREFIX_HI_SHIFT) << 8) |
        (uint8_t)stack->contents[2 * i + 1] |
        ((delimiter & 1) << 10);
      for (unsigned bit = 0; bit < PENDING_FRAME_BITS; bit++) {
        unsigned position = i * PENDING_FRAME_BITS + bit;
        if (value & (1u << bit))
          buffer[PENDING_HEADER_BYTES + position / 8] |= (char)(1u << (position % 8));
      }
    }
    return length;
  }
  // in_delegate is bit 16 here and bit 32 in the pending form, where 16 is taken.
  uint8_t flags = (scanner->constructor_newline ? 4 : 0) | (scanner->in_delegate ? 16 : 0);
  if (n > 0) {
    memcpy(buffer, stack->contents, n);
    buffer[0] |= flags;
  } else if (flags) {
    buffer[0] = flags;
    return 1;
  }
  return n;
}

void tree_sitter_kotlin_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  Scanner *scanner = payload;
  Stack *stack = &scanner->strings;
  array_clear(stack);
  scanner->constructor_newline = false;
  scanner->comment = (PendingComment){0};
  scanner->in_delegate = false;
  if (!length || length > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) return;
  uint8_t flags = (uint8_t)buffer[0];
  if ((flags & 3) == 0 && (flags & 8)) {
    if (length < PENDING_HEADER_BYTES || (flags & ~60u)) return;
    unsigned frames = (uint8_t)buffer[1] | ((unsigned)(uint8_t)buffer[2] << 8);
    if (frames > MAX_STRING_FRAMES ||
        length != PENDING_HEADER_BYTES + (frames * PENDING_FRAME_BITS + 7) / 8) return;
    uint32_t start = read_u32(buffer + 3), end = read_u32(buffer + 7);
    if (end < start || end - start < 4) return;
    for (unsigned i = 0; i < frames; i++) {
      unsigned value = 0;
      for (unsigned bit = 0; bit < PENDING_FRAME_BITS; bit++) {
        unsigned position = i * PENDING_FRAME_BITS + bit;
        if ((uint8_t)buffer[PENDING_HEADER_BYTES + position / 8] & (1u << (position % 8)))
          value |= 1u << bit;
      }
      stack_push(stack, '"', (value & 1024) != 0, (uint16_t)(value & 1023));
    }
    scanner->constructor_newline = (flags & 4) != 0;
    scanner->in_delegate = (flags & 32) != 0;
    scanner->comment = (PendingComment){true, start, end, (flags & 16) != 0};
    return;
  }
  if (length == 1 && (flags & ~20u) == 0) {
    scanner->constructor_newline = (flags & 4) != 0;
    scanner->in_delegate = (flags & 16) != 0;
    return;
  }
  if (length % 2) return;
  array_reserve(stack, length);
  memcpy(stack->contents, buffer, length);
  stack->contents[0] &= (Delimiter)~20;
  stack->size = length;
  scanner->constructor_newline = (flags & 4) != 0;
  scanner->in_delegate = (flags & 16) != 0;
}
