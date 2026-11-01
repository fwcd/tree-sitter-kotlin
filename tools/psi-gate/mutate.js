// Generic mutations of Kotlin sources for the PSI differential: each operator applies to every
// input file, not to hand-picked cases, so a gap shows wherever the operator's construct is:
// a comment between any two tokens of a line, a line break before the tokens that decide
// statement termination, a Unicode suffix on every name, and each hard keyword in place of a
// selector. Usage: node tools/psi-gate/mutate.js INPUT_DIR OUTPUT_DIR
'use strict';
const fs = require('fs');
const path = require('path');

const { HARD_KEYWORDS: HARD, SOFT_KEYWORDS, MODIFIERS } = require('../cross-validation/mutations');
const KEYWORDS = new Set([...HARD, ...SOFT_KEYWORDS, ...MODIFIERS]);
const OPERATORS = ['===', '!==', '..<', '?.', '?:', '::', '->', '!!', '&&', '||', '==', '!=', '<=', '>=', '+=', '-=',
  '*=', '/=', '%=', '++', '--', '..'];

// Tokens of a Kotlin source with their offsets; strings, characters and comments are opaque.
function tokenize(text) {
  const tokens = [];
  let i = 0;
  const push = (kind, start, end) => tokens.push({ kind, start, end, text: text.slice(start, end) });
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
      push('string', start, i); continue;
    }
    if (c === '`') { i++; while (i < text.length && text[i] !== '`' && text[i] !== '\n') i++; i++; push('name', start, i); continue; }
    const word = /^[\p{L}_][\p{L}\p{Nd}_]*@?/u.exec(text.slice(i, i + 200));
    if (word) { i += word[0].length; push(word[0].endsWith('@') ? 'label' : 'word', start, i); continue; }
    const number = /^[0-9][0-9a-zA-Z_.]*/.exec(text.slice(i, i + 100));
    if (number) { i += number[0].length; push('number', start, i); continue; }
    const op = OPERATORS.find(o => text.startsWith(o, i));
    i += op ? op.length : 1;
    push('punct', start, i);
  }
  return tokens;
}

const sameLine = (text, a, b) => !text.slice(a.end, b.start).includes('\n');

function commentEverywhere(text, tokens) {
  let out = '', last = 0;
  for (let k = 1; k < tokens.length; k++) {
    const a = tokens[k - 1], b = tokens[k];
    if (!sameLine(text, a, b) || a.kind === 'string' || b.kind === 'string') continue;
    out += text.slice(last, a.end) + '/*c*/'; last = a.end;
  }
  return out + text.slice(last);
}

const BREAK_BEFORE = new Set(['?', '.', '?.', '::', '?:', '->', ':', '{', '(', '[', '=', 'as', 'else', 'catch',
  'finally', 'by', 'where', 'is', 'in', '&&', '||', '+', '-', '*']);
function breakBefore(text, tokens) {
  let out = '', last = 0;
  for (const t of tokens) {
    if (!BREAK_BEFORE.has(t.text)) continue;
    out += text.slice(last, t.start) + '\n'; last = t.start;
  }
  return out + text.slice(last);
}

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

function keywordSelectors(text, tokens) {
  const k = tokens.findIndex((t, i) => i > 0 && t.kind === 'word' && tokens[i - 1].text === '.' && !KEYWORDS.has(t.text));
  if (k < 0) return [];
  const t = tokens[k];
  return HARD.map(word => [word, text.slice(0, t.start) + word + text.slice(t.end)]);
}

function main([input, output]) {
  const files = [];
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.kts?$/.test(e.name)) files.push(p); } };
  walk(input);
  let written = 0;
  const write = (op, rel, text) => {
    const dest = path.join(output, op, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); written++;
  };
  for (const file of files.sort()) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(input, file);
    const tokens = tokenize(text);
    write('comment-between-tokens', rel, commentEverywhere(text, tokens));
    write('break-before', rel, breakBefore(text, tokens));
    write('unicode-latin', rel, rename(text, tokens, 'é'));
    write('unicode-cjk', rel, rename(text, tokens, '名'));
    for (const [word, mutated] of keywordSelectors(text, tokens)) write(`keyword-selector/${word}`, rel, mutated);
  }
  console.error(`mutate: ${files.length} inputs, ${written} files`);
}

main(process.argv.slice(2));
