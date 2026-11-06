'use strict';

/**
 * Candidates for one round: every contiguous chunk deletion for chunk counts
 * 2, 4, 8, … and, once the input is small enough, every single unit.
 *
 * @param {string[]} units
 * @param {number} maxCandidates
 * @returns {string[][]}
 */
function candidatesOf(units, maxCandidates = 600) {
  const n = units.length;
  const seen = new Set();
  const out = [];
  const add = (start, end) => {
    const key = `${start}:${end}`;
    if (seen.has(key) || end <= start || (start === 0 && end === n)) return;
    seen.add(key);
    out.push(units.slice(0, start).concat(units.slice(end)));
  };
  for (let chunks = 2; chunks < n && out.length < maxCandidates; chunks *= 2) {
    const size = Math.ceil(n / chunks);
    for (let start = 0; start < n; start += size) add(start, Math.min(n, start + size));
  }
  if (n <= maxCandidates) for (let i = 0; i < n; i++) add(i, i + 1);
  return out;
}

/**
 * Greedy batched reduction.
 *
 * @param {string[]} units
 * @param {(candidates: string[][]) => Promise<boolean[]>} test - Whether each
 *   candidate still shows the property.
 * @returns {Promise<string[]>}
 */
async function reduce(units, test, { maxCandidates = 600, maxRounds = 200 } = {}) {
  let current = units;
  for (let round = 0; round < maxRounds && current.length > 1; round++) {
    const candidates = candidatesOf(current, maxCandidates);
    if (!candidates.length) break;
    const verdicts = await test(candidates);
    let best = null;
    candidates.forEach((candidate, i) => {
      if (verdicts[i] && (!best || candidate.length < best.length)) best = candidate;
    });
    if (!best) break;
    current = best;
  }
  return current;
}

/** Split source text into tokens whose concatenation is the text. */
function tokenize(text) {
  return text.match(/\s+|`[^`\n]*`|"(?:\\.|[^"\\\n])*"|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s\w]/g) || [];
}

/**
 * Minimize a text against a batch predicate: lines first, then tokens.
 *
 * @param {string} text
 * @param {(texts: string[]) => Promise<boolean[]>} holds
 * @returns {Promise<string>}
 */
async function minimizeText(text, holds) {
  const byLines = await reduce(text.split('\n'), (candidates) =>
    holds(candidates.map((lines) => lines.join('\n'))),
  );
  const byTokens = await reduce(tokenize(byLines.join('\n')), (candidates) =>
    holds(candidates.map((tokens) => tokens.join(''))),
  );
  return (
    byTokens
      .join('')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

module.exports = {candidatesOf, reduce, tokenize, minimizeText};
