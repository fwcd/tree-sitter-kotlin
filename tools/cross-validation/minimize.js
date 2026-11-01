/**
 * Shrinks the smallest example of each differential bucket to a minimal input
 * that still produces the same bucket key.
 *
 * Reduction deletes lines, then tokens. Each round builds every candidate of
 * several chunk sizes at once and checks them in one batch — one oracle call
 * and one tree-sitter parse per candidate — then keeps the shortest candidate
 * that still holds the key. A round without such a candidate ends the phase.
 *
 * Usage:
 *   node tools/cross-validation/minimize.js --run local/psi-diff/runs/NAME
 *     [--label LABEL] [--verdict A,B,C] [--limit N]
 *
 * Writes `minimized.json` and `minimized.md` next to the run's report; buckets
 * already minimized are skipped.
 *
 * @module cross-validation/minimize
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runIfMain } = require('../cli');

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
  const byLines = await reduce(text.split('\n'), candidates => holds(candidates.map(lines => lines.join('\n'))));
  const byTokens = await reduce(tokenize(byLines.join('\n')), candidates => holds(candidates.map(tokens => tokens.join(''))));
  return byTokens.join('').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Build the predicate "this text still yields bucket `key` for grammar `label`".
 * Candidates are written to a scratch directory, the PSI oracle parses them in
 * one request, and the grammar classifies them in process.
 */
function bucketPredicate({ server, parser, key, extension }) {
  const { classify, parseText } = require('./diff-run');
  return async texts => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-min-'));
    try {
      const files = texts.map((text, i) => {
        const name = `c${i}${extension}`;
        fs.writeFileSync(path.join(root, name), text);
        return name;
      });
      const index = await server.run(files, { root, out: path.join(root, 'out') });
      return texts.map((text, i) => {
        const psi = index[i];
        if (!psi || psi.failure) return false;
        const normalized = psi.crlf ? text.replace(/\r\n?/g, '\n') : text;
        try {
          const dump = fs.readFileSync(path.join(root, 'out', psi.dump), 'utf8');
          return classify({ text: normalized, tree: parseText(parser, normalized), psi, dump }).key === key;
        } catch {
          return false;
        }
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function renderMinimized(entries) {
  const out = ['# Minimized buckets', ''];
  for (const entry of entries) {
    out.push(`## ${entry.verdict}: \`${entry.key.replace(/`/g, 'ˋ')}\``, '');
    out.push(`Counts: ${Object.entries(entry.counts).map(([label, count]) => `${label} ${count}`).join(', ')}. From \`${entry.example}\`${entry.line ? `:${entry.line}` : ''} (${entry.label}).`, '');
    out.push('```kotlin', entry.snippet.trimEnd(), '```', '');
  }
  return out.join('\n');
}

async function main(argv) {
  const args = [...argv];
  let run, label, verdicts = ['A', 'B', 'C'], limit = Infinity;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--run') run = path.resolve(args.shift());
    else if (arg === '--label') label = args.shift();
    else if (arg === '--verdict') verdicts = args.shift().split(',');
    else if (arg === '--limit') limit = Number(args.shift());
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!run) throw new Error('--run is required');
  const { loadParsers } = require('./diff-run');
  const { OracleServer } = require('../psi-oracle/oracle');
  const meta = JSON.parse(fs.readFileSync(path.join(run, 'meta.json'), 'utf8'));
  const { buckets } = JSON.parse(fs.readFileSync(path.join(run, 'buckets.json'), 'utf8'));
  const parsers = Object.fromEntries(loadParsers(meta.grammars).map(entry => [entry.label, entry.parser]));
  const outFile = path.join(run, 'minimized.json');
  const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  const known = new Set(done.map(entry => entry.key));
  const server = new OracleServer();
  let count = 0;
  try {
    for (const bucket of buckets) {
      if (!verdicts.includes(bucket.verdict) || known.has(bucket.key) || count >= limit) continue;
      const use = label && bucket.counts[label] ? label : meta.grammars.map(g => g.label).find(l => bucket.counts[l] > 0);
      const example = bucket.examples[use][0];
      const text = fs.readFileSync(path.join(meta.root, example.path), 'utf8');
      const holds = bucketPredicate({ server, parser: parsers[use], key: bucket.key, extension: path.extname(example.path) });
      const [original] = await holds([text]);
      const snippet = original ? await minimizeText(text, holds) : text;
      done.push({ key: bucket.key, verdict: bucket.verdict, counts: bucket.counts, label: use, example: example.path,
        line: example.line, reproduced: original, snippet });
      fs.writeFileSync(outFile, JSON.stringify(done, null, 2) + '\n');
      count++;
      process.stderr.write(`\rminimized ${count} buckets`);
    }
  } finally {
    server.close();
  }
  process.stderr.write('\n');
  const order = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  done.sort((a, b) => (order.get(a.key) ?? 1e9) - (order.get(b.key) ?? 1e9));
  fs.writeFileSync(outFile, JSON.stringify(done, null, 2) + '\n');
  fs.writeFileSync(path.join(run, 'minimized.md'), renderMinimized(done));
  console.log(JSON.stringify({ run, minimized: done.length }));
}

module.exports = { candidatesOf, reduce, tokenize, minimizeText, bucketPredicate };

runIfMain(module, main);
