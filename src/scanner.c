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

// We use a stack to keep track of the string delimiters.
// Each entry is two bytes: [delimiter_byte, prefix_len_byte].
// delimiter_byte: '"' for single-quoted, '"'+1 for triple-quoted.
// prefix_len_byte: number of '$' signs required to trigger interpolation
//   (1 for regular strings and $"...", 2 for $$"...", etc.; max 255).
typedef Array(Delimiter) Stack;

static inline void stack_push(Stack *stack, char chr, bool triple, uint8_t prefix_len) {
  if (stack->size + 1 >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE) abort();
  array_push(stack, (Delimiter)(triple ? (chr + 1) : chr));
  array_push(stack, (Delimiter)prefix_len);
}

static inline void stack_pop(Stack *stack) {
  if (stack->size < 2) abort();
  stack->size -= 2;
}

static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }

// Scanner functions

static bool scan_string_start(TSLexer *lexer, Stack *stack) {
  // Count leading '$' signs (the interpolation prefix). Capped at 255.
  uint8_t prefix_len = 0;
  while (lexer->lookahead == '$') {
    advance(lexer);
    if (prefix_len < 255) prefix_len++;
  }
  // Regular strings with no prefix still use a single '$' as the trigger.
  if (prefix_len == 0) prefix_len = 1;

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
  uint8_t prefix_len = (uint8_t)stack->contents[stack->size - 1];
  Delimiter raw_delim = stack->contents[stack->size - 2];
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
      uint16_t additional_dollars = 0;
      while (lexer->lookahead == '$') {
        advance(lexer);
        additional_dollars++;
      }
      uint16_t total_dollars = 1 + additional_dollars;
      if (total_dollars >= prefix_len &&
          (iswalpha(lexer->lookahead) || lexer->lookahead == '_' || lexer->lookahead == '{')) {
        if (total_dollars > prefix_len) {
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
      // if we see a \, then this might possibly escape a dollar sign
      // in which case, we should not defer to the interpolation
      advance(lexer);
      // this dollar sign is escaped, so it must be content.
      // we consume it here so we don't enter the dollar sign case above,
      // which leaves the possibility that it is an interpolation 
      if (lexer->lookahead == '$') {
        advance(lexer);
        // however this leaves an edgecase where an escaped dollar sign could
        // appear at the end of a string (e.g "aa\$") which isn't handled
        // correctly; if we were at the end of the string, terminate properly
        if (lexer->lookahead == end_char) {
          stack_pop(stack);
          advance(lexer);
          lexer->mark_end(lexer);
          lexer->result_symbol = STRING_END;
          return true;
        }
      } else if (is_triple && lexer->lookahead == end_char) {
        // In triple-quoted strings, `\` is NOT an escape character. So `\"` is
        // also literal backslash + quote, and the `"` might be the start of
        // the closing `"""`. Don't advance past it (at the end of the while
        // loop). Let the next iteration handle it.
        has_content = true;
        continue;
      }
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
        stack_pop(stack);
        return true;
      }
      if (has_content) {
        lexer->mark_end(lexer);
        lexer->result_symbol = STRING_CONTENT;
        return true;
      }
      stack_pop(stack);
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


static bool scan_multiline_comment(TSLexer *lexer) {
  if (lexer->lookahead != '/') return false;
  advance(lexer);
  if (lexer->lookahead != '*') return false;
  advance(lexer);

  bool after_star = false;
  unsigned nesting_depth = 1;
  for (;;) {
    switch (lexer->lookahead) {
      case '*':
        advance(lexer);
        after_star = true;
        break;
      case '/':
        advance(lexer);
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
            advance(lexer);
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
        advance(lexer);
        after_star = false;
        break;
    }
  }
}

static bool scan_whitespace_and_comments(TSLexer *lexer) {
  while (iswspace(lexer->lookahead)) skip(lexer);
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

// Check if the current position has a visibility modifier (public, private,
// protected, internal) followed by horizontal whitespace and "constructor".
// Uses skip() — safe to call speculatively since no token boundary is changed.
static bool check_modifier_then_constructor(TSLexer *lexer) {
  // Buffer the first word to identify the modifier
  char word[20];
  unsigned len = 0;
  while (is_word_char(lexer->lookahead) && len < 19) {
    word[len++] = (char)lexer->lookahead;
    skip(lexer);
  }
  word[len] = '\0';

  if (strcmp(word, "public") != 0 && strcmp(word, "private") != 0 &&
      strcmp(word, "protected") != 0 && strcmp(word, "internal") != 0) {
    return false;
  }

  // Skip horizontal whitespace (not newlines)
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') skip(lexer);

  return check_word(lexer, "constructor", 11);
}

// Look ahead past one or more annotations (e.g. @Bar, @com.example.Bar,
// @Bar(x=1)) and optional visibility modifier, then check for 'constructor'.
// All characters are consumed with skip() so nothing affects token boundaries.
static bool check_annotation_then_constructor(TSLexer *lexer) {
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
    // Skip whitespace and newlines between annotations or before constructor
    while (iswspace(lexer->lookahead)) skip(lexer);
  }
  // Allow an optional visibility modifier before 'constructor'
  if (is_word_char(lexer->lookahead) && lexer->lookahead != 'c') {
    return check_modifier_then_constructor(lexer);
  }
  // Check directly for 'constructor'
  return check_word(lexer, "constructor", 11);
}

// After a comment has been skipped following a line break, decide whether an
// automatic semicolon belongs before it: `false` if the next real token
// continues the previous statement, `true` otherwise. Uses skip() throughout so
// nothing is added to the pending token.
static bool asi_after_comment(TSLexer *lexer, const bool *valid_symbols) {
  switch (lexer->lookahead) {
    case '.': case ',': case ':': case '*': case '%':
    case '>': case '<': case '=': case '{': case '[':
    case '(': case '?': case '|': case '&': case '/':
      return false;
    case '!':
      skip(lexer);
      if (lexer->lookahead == '=') return false;
      return true;
    case 'e':
      if (scan_for_word(lexer, "lse", 3)) {
        if (followed_by_arrow(lexer)) return true;
        return false;
      }
      return true;
    case 'a':
      if (scan_for_word(lexer, "s", 1)) return false;
      return true;
    case 'w':
      if (scan_for_word(lexer, "here", 4)) return false;
      return true;
    case 'c':
      if (scan_for_word(lexer, "atch", 4)) {
        // `catch` only continues a try_expression when its parameter list
        // follows; a bare `catch` word is an ordinary identifier, so the
        // statement really did end at the line break. A bare '/' means
        // division, which is likewise not a catch_block.
        if (!skip_whitespace_and_comments(lexer)) return true;
        return lexer->lookahead != '(';
      }
      return true;
    case 'b':
      if (valid_symbols[BY_DELEGATION_HINT] &&
          scan_for_word(lexer, "y", 1)) return false;
      return true;
    case 'f':
      if (scan_for_word(lexer, "inally", 6)) {
        // Same as `catch` above: only a following block makes this a
        // finally_block rather than an identifier.
        if (!skip_whitespace_and_comments(lexer)) return true;
        return lexer->lookahead != '{';
      }
      return true;
    default:
      return true;
  }
}

// `cursor_clean` is an out-param for the `return false` case only. Most of the
// keyword probes below skip over source text to make their decision, and skip()
// drags token_start with it, so on a false return the caller can no longer lex a
// token at the original position -- anything it produced would silently swallow
// the skipped text as padding. It therefore defaults to false (dirty) and is set
// only by the handful of returns that are provably still at the first
// non-whitespace character. Skipping *whitespace* is safe (that is what skip() is
// for); skipping comment or keyword text is not.
static bool scan_automatic_semicolon(TSLexer *lexer, const bool *valid_symbols,
                                     bool *cursor_clean) {
  lexer->result_symbol = AUTOMATIC_SEMICOLON;
  lexer->mark_end(lexer);

  bool sameline = true;
  for (;;) {
    if (lexer->eof(lexer)) return true;

    if (lexer->lookahead == ';') {
      advance(lexer);
      lexer->mark_end(lexer);
      return true;
    }

    if (!iswspace(lexer->lookahead)) break;

    if (lexer->lookahead == '\n') {
      skip(lexer);
      sameline = false;
      break;
    }

    if (lexer->lookahead == '\r') {
      skip(lexer);

      if (lexer->lookahead == '\n') skip(lexer);

      sameline = false;
      break;
    }

    skip(lexer);
  }

  // Skip whitespace and comments. Unreachable today (the helper only skips
  // whitespace and always succeeds); left dirty deliberately, so that if it
  // ever does skip comments the conservative answer is already in place.
  if (!scan_whitespace_and_comments(lexer))
    return false;

  if (sameline) {
    switch (lexer->lookahead) {
      // Insert imaginary semicolon before an 'import' but not in front
      // of other words or keywords starting with 'i'
      case 'i':
        return scan_for_word(lexer, "mport", 5);

      case ';':
        advance(lexer);
        lexer->mark_end(lexer);
        return true;

      // Don't insert a semicolon in other cases. Nothing but whitespace has
      // been skipped, so a string or comment token may still start here.
      default:
        *cursor_clean = true;
        return false;
    }
  }

  switch (lexer->lookahead) {
      case ',':
      case '.':
      case ':':
      case '*':
      case '%':
      case '>':
      case '<':
      case '=':
      case '{':
      case '[':
      case '(':
      case '?':
      case '|':
      case '&':
        // Decided from lookahead alone, so the cursor never moved past it and
        // e.g. scan_import_dot can still claim the '.'.
        *cursor_clean = true;
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
          return asi_after_comment(lexer, valid_symbols);
        } else if (lexer->lookahead == '*') {
          // Block comment after a line break. Read through it to find out what
          // comes *after* it, but leave mark_end where it is so the decision
          // below can still put a zero-width ASI in front of the comment.
          // Moving the cursor here is not binding: tree-sitter rewinds to
          // mark_end once a token is produced, and throws the whole scan away
          // if we return false.
          advance(lexer); // '*'
          unsigned nesting_depth = 1;
          bool nested = false;
          bool has_nul = false;
          while (nesting_depth > 0 && !lexer->eof(lexer)) {
            if (lexer->lookahead == '*') {
              advance(lexer);
              if (lexer->lookahead == '/') {
                advance(lexer);
                nesting_depth--;
              }
            } else if (lexer->lookahead == '/') {
              advance(lexer);
              if (lexer->lookahead == '*') {
                advance(lexer);
                nesting_depth++;
                nested = true;
              }
            } else {
              // A literal NUL is comment content, not EOF — see #279.
              if (lexer->lookahead == 0) has_nul = true;
              advance(lexer);
            }
          }
          if (nesting_depth > 0) {
            // Unterminated at EOF. Nothing follows that could continue the
            // statement, so the semicolon belongs in front of the comment;
            // scan_multiline_comment produces the comment on the next call.
            return true;
          }
          if (nested || has_nul) {
            // Two shapes the internal `multiline_comment` token cannot match:
            // a nested comment (a regex cannot recurse) and one containing a
            // NUL (the internal lexer stops there, see #279). The fallback is
            // unavailable, so this scanner has to produce the token itself —
            // which means mark_end must be committed *before* any keyword
            // lookahead moves the cursor. Committing it unconditionally would
            // pin the token end past the comment even when no continuation
            // follows, fusing the two statements, so mark_end is called only
            // in the branches that need it.
            //
            // NOTE: both definitions of `multiline_comment` share one symbol
            // id, so the internal token silently truncates a nested comment at
            // its first `*/`. Anything added below must therefore keep
            // producing the token here rather than deferring to the fallback
            // with `return false`.
            //
            // This path still carries the #274 symptom and is deliberately
            // out of scope. The `skip()` loop below drags token_start onto the
            // follower, so the outcome depends on which arm runs:
            //   - an arm that calls mark_end pins the token there, so a
            //     continuation follower yields a zero-width multiline_comment;
            //   - the same arms with a non-continuation follower leave
            //     result_symbol as AUTOMATIC_SEMICOLON, and the comment text
            //     becomes that zero-width token's padding, so the node vanishes
            //     from the tree with no ERROR reported;
            //   - `default` (and `b` outside a delegation context) never calls
            //     mark_end, so the semicolon lands in front of the comment and
            //     scan_multiline_comment emits it correctly on the next call.
            // #274 is fixed only for the non-nested, NUL-free case below.
            while (iswspace(lexer->lookahead)) skip(lexer);
            switch (lexer->lookahead) {
              case '.': case ',': case ':': case '*': case '%':
              case '>': case '<': case '=': case '{': case '[':
              case '(': case '?': case '|': case '&': case '/':
                // A continuation operator needs no further lookahead, so the
                // end can be marked without probing. It is not the comment's
                // real end: the whitespace skip above already moved
                // token_start here, so the node is zero-width (see NOTE).
                lexer->mark_end(lexer);
                lexer->result_symbol = MULTILINE_COMMENT;
                return true;
              case '!': case 'e': case 'a': case 'w':
                // May or may not begin a continuation, and finding out moves
                // the cursor past it, so mark the end first (again zero-width,
                // see NOTE).
                lexer->mark_end(lexer);
                if (!asi_after_comment(lexer, valid_symbols)) {
                  lexer->result_symbol = MULTILINE_COMMENT;
                }
                return true;
              case 'b':
                if (!valid_symbols[BY_DELEGATION_HINT]) return true;
                lexer->mark_end(lexer);
                if (!asi_after_comment(lexer, valid_symbols)) {
                  lexer->result_symbol = MULTILINE_COMMENT;
                }
                return true;
              default:
                // Not a continuation. mark_end is still at the position before
                // the comment, so this is a zero-width semicolon in front of
                // it and scan_multiline_comment produces the comment on the
                // next call.
                return true;
            }
          }
          // Skip any whitespace and further comments after this block comment.
          // A bare '/' (division) after comments is a continuation operator.
          if (!skip_whitespace_and_comments(lexer)) return false;
          return asi_after_comment(lexer, valid_symbols);
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
      case '-':
        return true;

      // Don't insert a semicolon before `!=`, but do insert one before a unary `!`.
      case '!':
        skip(lexer);
        return lexer->lookahead != '=';

      // Don't insert a semicolon before 'by' in delegation contexts.
      // Gated on BY_DELEGATION_HINT so `by` remains a usable soft-keyword
      // identifier in non-delegation positions.
      case 'b':
        return !(valid_symbols[BY_DELEGATION_HINT] &&
                 scan_for_word(lexer, "y", 1));

      // Don't insert a semicolon before an else, unless it's
      // followed by "->" (a when-entry's else, not an if-else).
      case 'e':
        if (!scan_for_word(lexer, "lse", 3)) return true;
        return followed_by_arrow(lexer);

      // Don't insert a semicolon before an as
      case 'a':
        return !scan_for_word(lexer, "s", 1);

      // Don't insert a semicolon before a where
      case 'w':
        return !scan_for_word(lexer, "here", 4);

      // Don't insert a semicolon before `instanceof`, or before `internal`
      // when followed by `constructor` in a class declaration context.
      case 'i':
        if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
            !valid_symbols[STRING_CONTENT] &&
            check_modifier_then_constructor(lexer)) {
          return false;
        }
        // Note: lexer has advanced past the word. For "instanceof", scan_for_word
        // can no longer match. But since "instanceof" is not a Kotlin keyword
        // (Kotlin uses "is"), this is acceptable — ASI is inserted, which is
        // the correct behavior for any non-constructor identifier.
        return true;

      // Don't insert a semicolon before `public/private/protected constructor`
      // in class declaration context.
      case 'p':
        if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
            !valid_symbols[STRING_CONTENT] &&
            check_modifier_then_constructor(lexer)) {
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
      case 'c':
        if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
            !valid_symbols[STRING_CONTENT]) {
          const char *kw = "constructor";
          bool matched = true;
          for (unsigned i = 0; i < 11; i++) {
            if (lexer->lookahead != kw[i]) { matched = false; break; }
            advance(lexer);
          }
          if (matched && !is_word_char(lexer->lookahead)) {
            lexer->result_symbol = PRIMARY_CONSTRUCTOR_KEYWORD;
            lexer->mark_end(lexer);
            return true;
          }
          // If constructor didn't match, we've advanced past some chars.
          // Can't reliably check 'catch' now. Just insert ASI.
          return true;
        }
        // Not in constructor context — check for 'catch'
        if (!scan_for_word(lexer, "atch", 4)) return true;
        // Same follower requirement as the comment path in asi_after_comment:
        // only a parameter list makes this a catch_block. A bare `catch` word
        // is an ordinary identifier, and Kotlin puts the newline *after* an
        // infix operator (`simpleIdentifier NL* rangeExpression`), never before
        // it, so the statement really did end at the line break. A bare '/'
        // means division, which is likewise not a catch_block.
        if (!skip_whitespace_and_comments(lexer)) return true;
        return lexer->lookahead != '(';

      // Don't insert a semicolon before finally (continues try_expression)
      case 'f':
        if (!scan_for_word(lexer, "inally", 6)) return true;
        // Same as `catch` above: only a following block makes this a
        // finally_block rather than an identifier.
        if (!skip_whitespace_and_comments(lexer)) return true;
        return lexer->lookahead != '{';

      // Don't insert a semicolon before an annotation that precedes 'constructor'
      // e.g. `class Foo\n@Bar\nconstructor(...)` — the @Bar is a constructor modifier
      case '@':
        if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] &&
            !valid_symbols[STRING_CONTENT] &&
            check_annotation_then_constructor(lexer)) {
          return false;
        }
        return true;

      case ';':
        advance(lexer);
        lexer->mark_end(lexer);
        return true;

      default:
        return true;
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

bool tree_sitter_kotlin_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  // BY_DELEGATION_HINT is declared in the grammar (optional, before `by` in
  // explicit_delegation and property_delegate) purely so it appears in
  // valid_symbols when the parser is in a delegation context. The scanner
  // never emits it; it's used only as a context flag in scan_automatic_semicolon.
  if (valid_symbols[AUTOMATIC_SEMICOLON]) {
    bool cursor_clean = false;
    bool ret = scan_automatic_semicolon(lexer, valid_symbols, &cursor_clean);
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

  // Match dots in import identifiers, refusing dots that would cause
  // malformed imports to bleed into subsequent import statements.
  if (valid_symbols[IMPORT_DOT]) {
    if (scan_import_dot(lexer)) return true;
  }

  // Match 'constructor' keyword for primary constructors when on the same line
  // (the cross-newline case is handled inside scan_automatic_semicolon)
  if (valid_symbols[PRIMARY_CONSTRUCTOR_KEYWORD] && !valid_symbols[STRING_CONTENT]) {
    while (iswspace(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead == 'c') {
      const char *kw = "constructor";
      bool matched = true;
      for (unsigned i = 0; i < 11; i++) {
        if (lexer->lookahead != kw[i]) { matched = false; break; }
        advance(lexer);
      }
      if (matched && !is_word_char(lexer->lookahead)) {
        lexer->result_symbol = PRIMARY_CONSTRUCTOR_KEYWORD;
        lexer->mark_end(lexer);
        return true;
      }
    }
  }

  // content, end, or interpolation start
  if (valid_symbols[STRING_CONTENT] || valid_symbols[INTERPOLATION_EXPRESSION_START] ||
      valid_symbols[INTERPOLATION_IDENTIFIER_START]) {
    if (scan_string_content(lexer, payload, valid_symbols)) return true;
  }

  // a string might follow after some whitespace, so we can't lookahead
  // until we get rid of it
  while (iswspace(lexer->lookahead)) skip(lexer);

  if (valid_symbols[STRING_START] && scan_string_start(lexer, payload)) {
    lexer->result_symbol = STRING_START;
    return true;
  }

  if (valid_symbols[MULTILINE_COMMENT] && scan_multiline_comment(lexer)) {
    return true;
  }

  return false;
}

void *tree_sitter_kotlin_external_scanner_create() {
  Stack *stack = ts_calloc(1, sizeof(Stack));
  if (stack == NULL) abort();
  array_init(stack);
  return stack;
}

void tree_sitter_kotlin_external_scanner_destroy(void *payload) {
  Stack *stack = (Stack *)payload;
  array_delete(stack);
  ts_free(stack);
}

unsigned tree_sitter_kotlin_external_scanner_serialize(void *payload, char *buffer) {
  Stack *stack = (Stack *)payload;
  unsigned n = stack->size;
  if (n > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) {
    n = TREE_SITTER_SERIALIZATION_BUFFER_SIZE;
  }
  if (n > 0) {
    // it's an undefined behavior to memcpy 0 bytes
    memcpy(buffer, stack->contents, n);
  }
  return n;
}

void tree_sitter_kotlin_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  Stack *stack = (Stack *)payload;
  // Stack entries are 2 bytes each (delimiter + prefix_len).
  // Discard corrupted state with odd length.
  if (length > 0 && length % 2 == 0) {
    array_reserve(stack, length);
    memcpy(stack->contents, buffer, length);
    stack->size = length;
  } else {
    array_clear(stack);
  }
}
