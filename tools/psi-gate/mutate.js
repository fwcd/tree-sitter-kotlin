// Generic mutations of Kotlin sources for the PSI differential. Each operator applies to every
// input file, not to hand-picked cases, so a gap shows wherever the operator's construct is.
//
// A mutant changes one place of its original (`--per-file N` places per operator and file, picked
// by a seeded generator), so a gap is not hidden behind an error the same file has elsewhere: a
// file changed everywhere at once errs for both parsers and says nothing. The inputs are the
// PSI-clean files only (a sibling `.txt` golden without `PsiErrorElement`), each copied under
// `original/`, and `origins.json` maps every mutant to its original, so `diff-run.js --origins`
// tells a divergence the mutation made from one the original already had.
//
// Usage: node tools/psi-gate/mutate.js INPUT_DIR OUTPUT_DIR [--per-file N] [--seed S]
'use strict';
const fs = require('fs');
const path = require('path');

const { HARD_KEYWORDS: HARD, SOFT_KEYWORDS, MODIFIERS } = require('../cross-validation/mutations');
const KEYWORDS = new Set([...HARD, ...SOFT_KEYWORDS, ...MODIFIERS]);
const OPERATORS = ['===', '!==', '..<', '?.', '?:', '::', '->', '!!', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=',
  '*=', '/=', '%=', '++', '--', '..'];

// Tokens of a Kotlin source with their offsets and lines; strings, characters and comments are
// opaque.
function tokenize(text) {
  const tokens = [];
  let i = 0, line = 1, lineFrom = 0;
  const lineOf = offset => {
    for (; lineFrom < offset; lineFrom++) if (text[lineFrom] === '\n') line++;
    return line;
  };
  const push = (kind, start, end) => tokens.push({ kind, start, end, text: text.slice(start, end), line: lineOf(start) });
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (text.startsWith('//', i)) { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (text.startsWith('/*', i)) {
      let depth = 0;
      do {
        if (text.startsWith('/*', i)) { depth++; i += 2; } else if (text.startsWith('*/', i)) { depth--; i += 2; } else i++;
      } while (depth > 0 && i < text.length);
      continue;
    }
    const start = i;
    if (text.startsWith('"""', i)) {
      i += 3; while (i < text.length && !text.startsWith('"""', i)) i++; i += 3;
      while (text[i] === '"') i++;
      push('string', start, i); continue;
    }
    if (c === '"' || c === '\'') {
      i++; while (i < text.length && text[i] !== c && text[i] !== '\n') { if (text[i] === '\\') i++; i++; } i++;
      push(c === '"' ? 'string' : 'char', start, i); continue;
    }
    if (c === '`') { i++; while (i < text.length && text[i] !== '`' && text[i] !== '\n') i++; i++; push('name', start, i); continue; }
    const word = /^[\p{L}_][\p{L}\p{Nd}_]*@?/u.exec(text.slice(i, i + 200));
    if (word) { i += word[0].length; push(word[0].endsWith('@') ? 'label' : 'word', start, i); continue; }
    const number = /^[0-9](?:[0-9a-zA-Z_]|\.(?=[0-9]))*/.exec(text.slice(i, i + 100));
    if (number) { i += number[0].length; push('number', start, i); continue; }
    const op = OPERATORS.find(o => text.startsWith(o, i));
    i += op ? op.length : 1;
    push('punct', start, i);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Sites: each operator lists the places it can change, then edits one of them
// ---------------------------------------------------------------------------

const opaque = t => t.kind === 'string' || t.kind === 'char';
const isName = t => t.kind === 'word' && !KEYWORDS.has(t.text) && /^[\p{L}_]/u.test(t.text);

/** Lines of the file header (`package`, `import`), whose names are no expressions. */
function headerLines(tokens) {
  const lines = new Set();
  tokens.forEach((t, k) => {
    if ((t.text === 'package' || t.text === 'import') && (k === 0 || tokens[k - 1].line !== t.line)) lines.add(t.line);
  });
  return lines;
}

/** One edit: replace `text[start, end)` with `insert`. */
const edit = (text, start, end, insert) => text.slice(0, start) + insert + text.slice(end);

const BREAK_BEFORE = new Set(['?', '.', '?.', '::', '?:', '->', ':', '{', '(', '[', '=', 'as', 'else', 'catch',
  'finally', 'by', 'where', 'is', 'in', '&&', '||', '+', '-', '*']);
const DECLARATION_KEYWORDS = new Set(['fun', 'class', 'interface', 'object', 'val', 'var', 'typealias']);
// Modifier runs: [words, words per line]. 25 words in lines of 3 split before the declaration in
// one grammar; the scanner's bound is 256 words.
const MODIFIER_RUNS = [[2, 2], [9, 3], [25, 3], [300, 1], [300, 5]];
// Contents of a character literal, PSI-clean and not: an unknown escape, a NUL escape, a raw NUL,
// a raw line break, comment openers and lengths other than one.
const CHAR_CONTENTS = ['\\q', '\\u0000', '\u0000', 'a\nb', 'a/*c*/b', 'a//b', 'ab', ''];
// Pieces one insertion puts at a token boundary, as kotlin-syntax's parse-fuzz.py does.
const PIECES = ['(', ')', '{', '}', '[', ']', '<', '>', ',', ':', ';', '=', '->', '.', '?.', '::', '?', '!!', '?:',
  '..', '..<', '@', '@Ann ', '*', '&&', '!', 'is ', 'as ', 'in ', '\n', 'fun ', 'class ', 'interface ', 'object ',
  'val ', 'when ', 'if ', 'else ', 'try ', 'return ', 'throw ', 'break ', 'this', 'super', 'null', 'by ', 'where ',
  'get() ', 'constructor', 'init ', 'companion ', 'data ', 'private ', 'suspend ', 'out ', 'context(', 'x', '1',
  '<T>', '(a: Int)', '{ a -> }', '`x`'];

/**
 * The operators of one file: each lists its sites (token indexes), and `apply(site, random)`
 * returns the mutants of a site as `[variant, text]`.
 */
function operators(text, tokens) {
  const header = headerLines(tokens);
  const inBody = t => !header.has(t.line);
  const next = k => tokens[k + 1];
  const indexes = filter => tokens.map((t, k) => k).filter(filter);
  const ops = [];
  const add = (name, sites, apply) => ops.push({ name, sites, apply });

  add('comment-between-tokens', indexes(k => next(k) && next(k).line === tokens[k].line && !opaque(tokens[k])
    && !opaque(next(k))), k => [['', edit(text, tokens[k].end, tokens[k].end, '/*c*/')]]);
  add('break-before', indexes(k => k > 0 && BREAK_BEFORE.has(tokens[k].text) && tokens[k - 1].line === tokens[k].line),
    k => [['', edit(text, tokens[k].start, tokens[k].start, '\n')]]);
  // `break@ lab`, `x. y`, `x:: y`, `@ A`: trivia where Kotlin's lexer wants none or allows some.
  add('trivia-after', indexes(k => next(k) && next(k).start === tokens[k].end
    && (tokens[k].kind === 'label' || ['@', '::', '?.', '.'].includes(tokens[k].text))),
  k => [['space', edit(text, tokens[k].end, tokens[k].end, ' ')], ['break', edit(text, tokens[k].end, tokens[k].end, '\n')]]);
  const labelName = t => t.kind === 'label' && isName({ kind: 'word', text: t.text.slice(0, -1) });
  add('backtick-name', indexes(k => inBody(tokens[k]) && (isName(tokens[k]) || labelName(tokens[k]))), k => {
    const t = tokens[k], label = t.kind === 'label';
    return [['', edit(text, t.start, t.end, `\`${label ? t.text.slice(0, -1) : t.text}\`${label ? '@' : ''}`)]];
  });
  add('keyword-selector', indexes(k => k > 0 && inBody(tokens[k]) && isName(tokens[k])
    && (tokens[k - 1].text === '.' || tokens[k - 1].text === '?.')),
  k => HARD.map(word => [word, edit(text, tokens[k].start, tokens[k].end, word)]));
  // `(X)?::x`, `(x).y`: a receiver in parentheses.
  const NO_RECEIVER_AFTER = ['.', '?.', '::', ':', '@', 'fun', 'val', 'var', 'class', 'interface', 'object', 'typealias'];
  add('parenthesize', indexes(k => k > 0 && inBody(tokens[k]) && isName(tokens[k]) && next(k)
    && next(k).start === tokens[k].end && ['.', '?.', '::', '?'].includes(next(k).text)
    && !NO_RECEIVER_AFTER.includes(tokens[k - 1].text)),
  k => [['', edit(text, tokens[k].start, tokens[k].end, `(${tokens[k].text})`)]]);
  // Two statements joined on one line by one semicolon, two or none.
  const ends = t => t.text === ')' || t.text === '}' || isName(t) || t.kind === 'number';
  add('join-lines', indexes(k => next(k) && next(k).line !== tokens[k].line && inBody(tokens[k]) && inBody(next(k))
    && ends(tokens[k]) && isName(next(k)) && text.slice(tokens[k].end, next(k).start).trim() === ''),
  k => [['semi', '; '], ['double-semi', ';; '], ['none', ' ']]
    .map(([variant, glue]) => [variant, edit(text, tokens[k].end, next(k).start, glue)]));
  add('double-semi', indexes(k => tokens[k].text === ';'), k => [['', edit(text, tokens[k].end, tokens[k].end, ';')]]);
  add('modifier-run', indexes(k => DECLARATION_KEYWORDS.has(tokens[k].text) && inBody(tokens[k])
    && (k === 0 || tokens[k - 1].line !== tokens[k].line)), k => {
    const t = tokens[k];
    const indent = /[ \t]*$/.exec(text.slice(0, t.start))[0];
    return MODIFIER_RUNS.map(([words, perLine]) => {
      const lines = [];
      for (let left = words; left > 0; left -= perLine) lines.push(Array(Math.min(perLine, left)).fill('private').join(' '));
      return [`${words}x${perLine}`, edit(text, t.start, t.start, lines.join('\n' + indent) + '\n' + indent)];
    });
  });
  add('char-content', indexes(k => tokens[k].kind === 'char'),
    k => CHAR_CONTENTS.map((content, i) => [String(i), edit(text, tokens[k].start, tokens[k].end, `'${content}'`)]));
  // A named function without its body, where a declaration or an expression stands.
  add('drop-body', indexes(k => tokens[k].text === 'fun' && bodyOf(tokens, k)),
    k => { const [from, to] = bodyOf(tokens, k); return [['', edit(text, tokens[from - 1].end, tokens[to].end, '')]]; });
  add('insert-piece', indexes(() => true), (k, random) => {
    const piece = PIECES[Math.floor(random() * PIECES.length)];
    return [['', edit(text, tokens[k].start, tokens[k].start, piece + (/\s$/.test(piece) ? '' : ' '))]];
  });
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

function matching(tokens, k, open, close) {
  for (let depth = 0, i = k; i < tokens.length; i++) {
    if (tokens[i].text === open) depth++;
    else if (tokens[i].text === close && --depth === 0) return i;
  }
  return -1;
}

// Unicode names: every name of the file at once, which keeps it valid.
function rename(text, tokens, suffix) {
  let out = '', last = 0;
  for (const t of tokens) {
    if (t.kind !== 'word' && t.kind !== 'label') continue;
    const name = t.kind === 'label' ? t.text.slice(0, -1) : t.text;
    if (KEYWORDS.has(name) || !/^[a-z]/i.test(name)) continue;
    out += text.slice(last, t.start) + name + suffix + (t.kind === 'label' ? '@' : ''); last = t.end;
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
        if (mutated !== text) out.push({ dir: variant ? `${name}/${variant}` : name, index, text: mutated });
      }
    });
  }
  for (const [name, suffix] of [['unicode-latin', 'é'], ['unicode-cjk', '名']]) {
    const mutated = rename(text, tokens, suffix);
    if (mutated !== text) out.push({ dir: name, index: 0, text: mutated });
  }
  return out;
}

/** True when the input's PSI golden (`NAME.txt` beside `NAME.kt`) holds an error element. */
function goldenHasError(file) {
  const golden = file.replace(/\.kts?$/, '.txt');
  return fs.existsSync(golden) && fs.readFileSync(golden, 'utf8').includes('PsiErrorElement');
}

function main(args) {
  const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
  const [input, output] = args.filter((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const perFile = Number(option('--per-file', 2));
  const seed = option('--seed', 'psi-gate');
  const files = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.kts?$/.test(e.name)) files.push(p);
    }
  };
  walk(input);
  const origins = {};
  let written = 0, skipped = 0;
  const write = (rel, text) => {
    const dest = path.join(output, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    written++;
  };
  for (const file of files.sort()) {
    if (goldenHasError(file)) { skipped++; continue; }
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(input, file);
    const original = path.join('original', rel);
    write(original, text);
    const ext = path.extname(rel);
    for (const { dir, index, text: mutated } of mutantsOf(text, { perFile, seed, rel })) {
      const mutant = path.join(dir, `${rel.slice(0, -ext.length)}~${index}${ext}`);
      write(mutant, mutated);
      origins[mutant] = original;
    }
  }
  fs.writeFileSync(path.join(output, 'origins.json'), JSON.stringify(origins) + '\n');
  console.error(`mutate: ${files.length - skipped} PSI-clean inputs (${skipped} with a PSI error left out), ${written} files`);
}

module.exports = { tokenize, mutantsOf, pick, generator };

if (require.main === module) main(process.argv.slice(2));
