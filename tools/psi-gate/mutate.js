// Deterministic single-site mutations and lexical units shared by v2 search/reduction.
'use strict';

const { HARD_KEYWORDS: HARD, SOFT_KEYWORDS, MODIFIERS } = require('../cross-validation/mutations');
const KEYWORDS = new Set([...HARD, ...SOFT_KEYWORDS, ...MODIFIERS]);
const OPERATORS = [
  '===',
  '!==',
  '..<',
  '?.',
  '?:',
  '::',
  '->',
  '!!',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '++',
  '--',
  '..',
];

// Tokens of a Kotlin source with their offsets and lines; strings, characters and comments are
// opaque.
function tokenize(text) {
  const tokens = [];
  let i = 0,
    line = 1,
    lineFrom = 0;
  const lineOf = (offset) => {
    for (; lineFrom < offset; lineFrom++) if (text[lineFrom] === '\n') line++;
    return line;
  };
  const push = (kind, start, end) =>
    tokens.push({ kind, start, end, text: text.slice(start, end), line: lineOf(start) });
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (text.startsWith('/*', i)) {
      let depth = 0;
      do {
        if (text.startsWith('/*', i)) {
          depth++;
          i += 2;
        } else if (text.startsWith('*/', i)) {
          depth--;
          i += 2;
        } else i++;
      } while (depth > 0 && i < text.length);
      continue;
    }
    const start = i;
    if (text.startsWith('"""', i)) {
      i += 3;
      while (i < text.length && !text.startsWith('"""', i)) i++;
      i += 3;
      while (text[i] === '"') i++;
      push('string', start, i);
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') {
        if (text[i] === '\\') i++;
        i++;
      }
      i++;
      push(c === '"' ? 'string' : 'char', start, i);
      continue;
    }
    if (c === '`') {
      i++;
      while (i < text.length && text[i] !== '`' && text[i] !== '\n') i++;
      i++;
      push('name', start, i);
      continue;
    }
    const word = /^[\p{L}_][\p{L}\p{Nd}_]*@?/u.exec(text.slice(i, i + 200));
    if (word) {
      i += word[0].length;
      push(word[0].endsWith('@') ? 'label' : 'word', start, i);
      continue;
    }
    const number = /^[0-9](?:[0-9a-zA-Z_]|\.(?=[0-9]))*/.exec(text.slice(i, i + 100));
    if (number) {
      i += number[0].length;
      push('number', start, i);
      continue;
    }
    const op = OPERATORS.find((o) => text.startsWith(o, i));
    i += op ? op.length : 1;
    push('punct', start, i);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Sites: each operator lists the places it can change, then edits one of them
// ---------------------------------------------------------------------------

const opaque = (t) => t.kind === 'string' || t.kind === 'char';
const isName = (t) => t.kind === 'word' && !KEYWORDS.has(t.text) && /^[\p{L}_]/u.test(t.text);

/** Lines of the file header (`package`, `import`), whose names are no expressions. */
function headerLines(tokens) {
  const lines = new Set();
  tokens.forEach((t, k) => {
    if ((t.text === 'package' || t.text === 'import') && (k === 0 || tokens[k - 1].line !== t.line))
      lines.add(t.line);
  });
  return lines;
}

/** One edit: replace `text[start, end)` with `insert`. */
const edit = (text, start, end, insert) => text.slice(0, start) + insert + text.slice(end);

const BREAK_BEFORE = new Set([
  '?',
  '.',
  '?.',
  '::',
  '?:',
  '->',
  ':',
  '{',
  '(',
  '[',
  '=',
  'as',
  'else',
  'catch',
  'finally',
  'by',
  'where',
  'is',
  'in',
  '&&',
  '||',
  '+',
  '-',
  '*',
]);
const DECLARATION_KEYWORDS = new Set([
  'fun',
  'class',
  'interface',
  'object',
  'val',
  'var',
  'typealias',
]);
// Modifier runs: [words, words per line]. 25 words in lines of 3 split before the declaration in
// one grammar; the scanner's bound is 256 words.
const MODIFIER_RUNS = [
  [2, 2],
  [9, 3],
  [25, 3],
  [300, 1],
  [300, 5],
];
// Contents of a character literal, PSI-clean and not: an unknown escape, a NUL escape, a raw NUL,
// a backslash before a raw NUL, a raw line break, comment openers and lengths other than one. A raw
// carriage return is left out: kotlinc reads it as a line break, and so does the oracle.
const CHAR_CONTENTS = ['\\q', '\\u0000', '\u0000', '\\\u0000', 'a\nb', 'a/*c*/b', 'a//b', 'ab', ''];
// Names Kotlin's lexer does not take whole: a suffix that is no letter or digit, a digit of another
// script first. Each replaces one name or label, so PSI errs at that place alone.
const BAD_NAMES = [
  ['emoji-suffix', (n) => n + '💩'],
  ['digit-start', (n) => '١' + n],
];
// Pieces one insertion puts at a token boundary, as kotlin-syntax's parse-fuzz.py does.
const PIECES = [
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  '<',
  '>',
  ',',
  ':',
  ';',
  '=',
  '->',
  '.',
  '?.',
  '::',
  '?',
  '!!',
  '?:',
  '..',
  '..<',
  '@',
  '@Ann ',
  '*',
  '&&',
  '!',
  'is ',
  'as ',
  'in ',
  '\n',
  'fun ',
  'class ',
  'interface ',
  'object ',
  'val ',
  'when ',
  'if ',
  'else ',
  'try ',
  'return ',
  'throw ',
  'break ',
  'this',
  'super',
  'null',
  'by ',
  'where ',
  'get() ',
  'constructor',
  'init ',
  'companion ',
  'data ',
  'private ',
  'suspend ',
  'out ',
  'context(',
  'x',
  '1',
  '<T>',
  '(a: Int)',
  '{ a -> }',
  '`x`',
];

/**
 * The operators of one file: each lists its sites (token indexes), and `apply(site, random)`
 * returns the mutants of a site as `[variant, text]`.
 */
function operators(text, tokens) {
  const header = headerLines(tokens);
  const inBody = (t) => !header.has(t.line);
  const next = (k) => tokens[k + 1];
  const indexes = (filter) => tokens.map((t, k) => k).filter(filter);
  const ops = [];
  const add = (name, sites, apply) => ops.push({ name, sites, apply });

  add(
    'comment-between-tokens',
    indexes(
      (k) => next(k) && next(k).line === tokens[k].line && !opaque(tokens[k]) && !opaque(next(k)),
    ),
    (k) => [['', edit(text, tokens[k].end, tokens[k].end, '/*c*/')]],
  );
  add(
    'break-before',
    indexes(
      (k) => k > 0 && BREAK_BEFORE.has(tokens[k].text) && tokens[k - 1].line === tokens[k].line,
    ),
    (k) => [['', edit(text, tokens[k].start, tokens[k].start, '\n')]],
  );
  // `break@ lab`, `x. y`, `x:: y`, `@ A`, `break@/*c*/lab`: trivia where Kotlin's lexer wants none or
  // allows some.
  add(
    'trivia-after',
    indexes(
      (k) =>
        next(k) &&
        next(k).start === tokens[k].end &&
        (tokens[k].kind === 'label' || ['@', '::', '?.', '.'].includes(tokens[k].text)),
    ),
    (k) =>
      [
        ['space', ' '],
        ['break', '\n'],
        ['comment', '/*c*/'],
      ].map(([variant, trivia]) => [variant, edit(text, tokens[k].end, tokens[k].end, trivia)]),
  );
  const labelName = (t) =>
    t.kind === 'label' && isName({ kind: 'word', text: t.text.slice(0, -1) });
  add(
    'backtick-name',
    indexes((k) => inBody(tokens[k]) && (isName(tokens[k]) || labelName(tokens[k]))),
    (k) => {
      const t = tokens[k],
        label = t.kind === 'label';
      return [
        [
          '',
          edit(
            text,
            t.start,
            t.end,
            `\`${label ? t.text.slice(0, -1) : t.text}\`${label ? '@' : ''}`,
          ),
        ],
      ];
    },
  );
  add(
    'keyword-selector',
    indexes(
      (k) =>
        k > 0 &&
        inBody(tokens[k]) &&
        isName(tokens[k]) &&
        (tokens[k - 1].text === '.' || tokens[k - 1].text === '?.'),
    ),
    (k) => HARD.map((word) => [word, edit(text, tokens[k].start, tokens[k].end, word)]),
  );
  // `(X)?::x`, `(x).y`, `(X<T>)?::x`: a receiver in parentheses, a name or a name with type arguments.
  const NO_RECEIVER_AFTER = [
    '.',
    '?.',
    '::',
    ':',
    '@',
    'fun',
    'val',
    'var',
    'class',
    'interface',
    'object',
    'typealias',
  ];
  const receiverEnd = (k) => {
    const end = tokens[k + 1]?.text === '<' ? typeArgumentsEnd(tokens, k + 1) : k;
    // The tokenizer reads `?::` as `?:` and `:`.
    return end >= 0 &&
      next(end) &&
      next(end).start === tokens[end].end &&
      (['.', '?.', '::', '?'].includes(next(end).text) || text.startsWith('?::', next(end).start))
      ? end
      : -1;
  };
  add(
    'parenthesize',
    indexes(
      (k) =>
        k > 0 &&
        inBody(tokens[k]) &&
        isName(tokens[k]) &&
        receiverEnd(k) >= 0 &&
        !NO_RECEIVER_AFTER.includes(tokens[k - 1].text),
    ),
    (k) => {
      const end = receiverEnd(k);
      return [
        [
          '',
          edit(
            text,
            tokens[k].start,
            tokens[end].end,
            `(${text.slice(tokens[k].start, tokens[end].end)})`,
          ),
        ],
      ];
    },
  );
  // Two statements joined on one line by one semicolon, two or none.
  const ends = (t) => t.text === ')' || t.text === '}' || isName(t) || t.kind === 'number';
  add(
    'join-lines',
    indexes(
      (k) =>
        next(k) &&
        next(k).line !== tokens[k].line &&
        inBody(tokens[k]) &&
        inBody(next(k)) &&
        ends(tokens[k]) &&
        isName(next(k)) &&
        text.slice(tokens[k].end, next(k).start).trim() === '',
    ),
    (k) =>
      [
        ['semi', '; '],
        ['double-semi', ';; '],
        ['none', ' '],
      ].map(([variant, glue]) => [variant, edit(text, tokens[k].end, next(k).start, glue)]),
  );
  // `a();; b()`, `a();/*c*/; b()`, `A;; fun f()` in an enum: `;;` is one token for Kotlin's lexer.
  add(
    'double-semi',
    indexes((k) => tokens[k].text === ';'),
    (k) =>
      [
        ['', ';'],
        ['comment', '/*c*/;'],
        ['space', ' ;'],
      ].map(([variant, more]) => [variant, edit(text, tokens[k].end, tokens[k].end, more)]),
  );
  add(
    'modifier-run',
    indexes(
      (k) =>
        DECLARATION_KEYWORDS.has(tokens[k].text) &&
        inBody(tokens[k]) &&
        (k === 0 || tokens[k - 1].line !== tokens[k].line),
    ),
    (k) => {
      const t = tokens[k];
      const indent = /[ \t]*$/.exec(text.slice(0, t.start))[0];
      return MODIFIER_RUNS.map(([words, perLine]) => {
        const lines = [];
        for (let left = words; left > 0; left -= perLine)
          lines.push(Array(Math.min(perLine, left)).fill('private').join(' '));
        return [
          `${words}x${perLine}`,
          edit(text, t.start, t.start, lines.join('\n' + indent) + '\n' + indent),
        ];
      });
    },
  );
  add(
    'bad-name',
    indexes((k) => inBody(tokens[k]) && (isName(tokens[k]) || labelName(tokens[k]))),
    (k) => {
      const t = tokens[k],
        label = t.kind === 'label',
        name = label ? t.text.slice(0, -1) : t.text;
      return BAD_NAMES.map(([variant, make]) => [
        variant,
        edit(text, t.start, t.end, make(name) + (label ? '@' : '')),
      ]);
    },
  );
  add(
    'char-content',
    indexes((k) => tokens[k].kind === 'char'),
    (k) =>
      CHAR_CONTENTS.map((content, i) => [
        String(i),
        edit(text, tokens[k].start, tokens[k].end, `'${content}'`),
      ]),
  );
  // A named function without its body, where a declaration or an expression stands.
  add(
    'drop-body',
    indexes((k) => tokens[k].text === 'fun' && bodyOf(tokens, k)),
    (k) => {
      const [from, to] = bodyOf(tokens, k);
      return [['', edit(text, tokens[from - 1].end, tokens[to].end, '')]];
    },
  );
  add(
    'insert-piece',
    indexes(() => true),
    (k, random) => {
      const piece = PIECES[Math.floor(random() * PIECES.length)];
      return [
        ['', edit(text, tokens[k].start, tokens[k].start, piece + (/\s$/.test(piece) ? '' : ' '))],
      ];
    },
  );
  return ops;
}

/** Token range `[from, to]` of the braces of the body of the function at `k`, or null. */
function bodyOf(tokens, k) {
  let i = k + 1;
  while (i < tokens.length && tokens[i].text !== '(') {
    if (['{', '}', '=', ';'].includes(tokens[i].text)) return null;
    i++;
  }
  i = matching(tokens, i, '(', ')');
  if (i < 0) return null;
  for (i++; i < tokens.length && tokens[i].text !== '{'; i++) {
    if (['}', '=', ';', '(', 'fun', 'val', 'var', 'class'].includes(tokens[i].text)) return null;
  }
  if (i >= tokens.length) return null;
  const end = matching(tokens, i, '{', '}');
  return end < 0 ? null : [i, end];
}

/** Index of the `>` closing the type arguments that open at `k`, or -1. */
function typeArgumentsEnd(tokens, k) {
  for (let depth = 0, i = k; i < tokens.length && i < k + 40; i++) {
    const t = tokens[i].text;
    if (t === '<') depth++;
    else if (t === '>' && --depth === 0) return i;
    else if (!['?', ',', '.', '*', 'in', 'out'].includes(t) && tokens[i].kind !== 'word') return -1;
  }
  return -1;
}

function matching(tokens, k, open, close) {
  for (let depth = 0, i = k; i < tokens.length; i++) {
    if (tokens[i].text === open) depth++;
    else if (tokens[i].text === close && --depth === 0) return i;
  }
  return -1;
}

// Unicode names: every name of the file at once, which keeps it valid.
function rename(text, tokens, suffix) {
  let out = '',
    last = 0;
  for (const t of tokens) {
    if (t.kind !== 'word' && t.kind !== 'label') continue;
    const name = t.kind === 'label' ? t.text.slice(0, -1) : t.text;
    if (KEYWORDS.has(name) || !/^[a-z]/i.test(name)) continue;
    out += text.slice(last, t.start) + name + suffix + (t.kind === 'label' ? '@' : '');
    last = t.end;
  }
  return out + text.slice(last);
}

// ---------------------------------------------------------------------------
// Sampling and output
// ---------------------------------------------------------------------------

/** mulberry32, seeded by a string. */
function generator(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to `n` of `sites`, picked by `random`, in document order. */
function pick(sites, n, random) {
  if (sites.length <= n) return sites;
  const chosen = new Set();
  while (chosen.size < n) chosen.add(sites[Math.floor(random() * sites.length)]);
  return [...chosen].sort((a, b) => a - b);
}

/**
 * Every mutant of one file.
 *
 * @returns {Array<{ dir: string, index: number, text: string }>} `dir` is the operator and its
 *   variant (`keyword-selector/fun`); `index` numbers the picked sites of the operator.
 */
function mutantsOf(text, { perFile = 2, seed = 'psi-gate', rel = '' } = {}) {
  const tokens = tokenize(text);
  const out = [];
  for (const { name, sites, apply } of operators(text, tokens)) {
    const random = generator(`${seed}:${rel}:${name}`);
    pick(sites, perFile, random).forEach((site, index) => {
      for (const [variant, mutated] of apply(site, random)) {
        if (mutated !== text)
          out.push({ dir: variant ? `${name}/${variant}` : name, index, text: mutated });
      }
    });
  }
  for (const [name, suffix] of [
    ['unicode-latin', 'é'],
    ['unicode-cjk', '名'],
  ]) {
    const mutated = rename(text, tokens, suffix);
    if (mutated !== text) out.push({ dir: name, index: 0, text: mutated });
  }
  return out;
}

module.exports = {tokenize, mutantsOf, pick, generator};
