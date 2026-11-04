'use strict';

// `s`: a leaf's text may hold a line or paragraph separator (U+2028, U+2029), which DebugUtil
// prints raw and `.` would not match without it.
const LEAF_RE = /^(PsiElement|PsiWhiteSpace|PsiComment)(?:\(([^)]*)\))?\('(.*)'\)$/s;

const LINE_ESCAPES = { n: '\n', r: '\r', t: '\t' };

/**
 * Source length of a leaf's printed text. `DebugUtil` prints a line break, a carriage return and
 * a tab as `\n`, `\r` and `\t` and every other character as itself, so a backslash in the
 * source (`"a\nb"`, a KDoc escape) prints unchanged and `\n` is ambiguous; with the source text
 * at hand the ambiguity resolves against it.
 *
 * @param {string} leaf - The printed text.
 * @param {string|null} source - The source text, or null.
 * @param {number} offset - Where the leaf starts in `source`.
 */
function leafLength(leaf, source, offset) {
  let o = offset;
  for (let i = 0; i < leaf.length; i++, o++) {
    const real = leaf[i] === '\\' && LINE_ESCAPES[leaf[i + 1]];
    if (real && (source === null || source[o] === real)) i++;
  }
  return o - offset;
}

/**
 * Recover source offsets from a PSI dump by concatenating its leaf texts.
 *
 * @param {string} dump - `DebugUtil.psiToString(file, true, false)` output.
 * @param {string|null} [source] - The parsed text, which makes the offsets exact, see `leafLength`.
 * @returns {{ composites: Array<{ type: string, parent: string, start: number, end: number, depth: number, token: number|null }>,
 *   errors: Array<{ offset: number, parent: string, message: string }>, comments: number[] }}
 *   Composites in document order, `parent` the type of the enclosing one; `end` is exclusive, `token` is the start of the composite's first
 *   leaf that is no whitespace, comment or KDoc (null when it has none). `comments` holds the start
 *   of every comment (a `PsiComment` leaf or a `KDoc`). Offsets count UTF-16 code units, as Java
 *   and JavaScript do.
 */
function psiLayout(dump, source = null) {
  const composites = [];
  const errors = [];
  const comments = [];
  const commentSpans = [];
  const tokens = [];
  const open = []; // { indent, entry }
  let offset = 0;
  const close = (indent) => {
    while (open.length && open[open.length - 1].indent >= indent) open.pop().entry.end = offset;
  };
  for (const line of dump.split('\n').slice(1)) {
    const indent = line.length - line.trimStart().length;
    const node = line.trim();
    if (!node || node === '<empty list>') continue;
    close(indent);
    const leaf = LEAF_RE.exec(node);
    if (leaf) {
      if (leaf[1] === 'PsiComment') {
        comments.push(offset);
        commentSpans.push({ start: offset, end: offset + leafLength(leaf[3], source, offset) });
      }
      if (leaf[1] === 'PsiElement' && !open.some((o) => o.entry.type === 'KDoc')) {
        for (let i = open.length - 1; i >= 0 && open[i].entry.token === null; i--)
          open[i].entry.token = offset;
      }
      const end = offset + leafLength(leaf[3], source, offset);
      if (leaf[1] === 'PsiElement' && !open.some((o) => o.entry.type === 'KDoc')) {
        tokens.push({ type: leaf[2], start: offset, end });
      }
      offset = end;
      continue;
    }
    const parent = open.length ? open[open.length - 1].entry.type : 'FILE';
    if (node.startsWith('PsiErrorElement')) {
      errors.push({ offset, parent, message: node.replace(/^PsiErrorElement:?/, '') });
      const entry = {
        type: 'PsiErrorElement',
        start: offset,
        end: offset,
        depth: open.length,
        token: null,
      };
      open.push({ indent, entry });
      continue;
    }
    if (node === 'KDoc') comments.push(offset);
    const entry = {
      type: node,
      parent,
      start: offset,
      end: offset,
      depth: open.length,
      token: null,
    };
    composites.push(entry);
    if (node === 'KDoc') commentSpans.push(entry);
    open.push({ indent, entry });
  }
  close(-1);
  return { composites, errors, comments, commentSpans, tokens };
}

/** Innermost PSI composite that starts at or covers `offset`. */
function psiTypeAt(layout, offset) {
  let best = null;
  for (const entry of layout.composites) {
    if (entry.start > offset) break;
    if (entry.end > offset || (entry.start === offset && entry.end === offset)) {
      if (!best || entry.depth >= best.depth) best = entry;
    }
  }
  return best ? best.type : 'FILE';
}

module.exports = { psiLayout, psiTypeAt };
