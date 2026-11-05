'use strict';

const fs = require('fs');
const path = require('path');
const { conformance, renderConformance } = require('./conformance');

function readShards(outDir) {
  const dir = path.join(outDir, 'shards');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .flatMap((name) =>
      fs
        .readFileSync(path.join(dir, name), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    );
}

/**
 * Group records into buckets per grammar label.
 *
 * @returns {{ totals: object, buckets: Array<{ key: string, verdict: string, counts: object, examples: object }> }}
 */
function summarize(records, labels, origins = null, context = {}) {
  const score = conformance(records, labels, context);
  if (origins) records = markMutants(records, labels, origins);
  const totals = Object.fromEntries(labels.map((label) => [label, {}]));
  const buckets = new Map();
  for (const record of records) {
    for (const label of labels) {
      const result = record.results[label];
      if (!result) continue;
      totals[label][result.verdict] = (totals[label][result.verdict] || 0) + 1;
      if (!result.key || result.verdict === 'both-error') continue;
      if (!buckets.has(result.key)) {
        buckets.set(result.key, {
          key: result.key,
          verdict: result.verdict,
          counts: Object.fromEntries(labels.map((l) => [l, 0])),
          examples: Object.fromEntries(labels.map((l) => [l, []])),
        });
      }
      const bucket = buckets.get(result.key);
      bucket.counts[label]++;
      bucket.examples[label].push({ path: record.path, line: result.line, bytes: record.bytes });
    }
  }
  for (const bucket of buckets.values()) {
    for (const label of labels) {
      bucket.examples[label] = bucket.examples[label]
        .sort((a, b) => a.bytes - b.bytes || (a.path < b.path ? -1 : 1))
        .slice(0, 5);
    }
  }
  const order = { A: 0, 'A-prefix': 0, B: 1, 'B-prefix': 1, 'C-mutant': 2, C: 3 };
  const sorted = [...buckets.values()].sort(
    (a, b) =>
      (order[a.verdict] ?? 3) - (order[b.verdict] ?? 3) ||
      Math.max(...Object.values(b.counts)) - Math.max(...Object.values(a.counts)) ||
      (a.key < b.key ? -1 : 1),
  );
  return { totals, buckets: sorted, conformance: score };
}

/**
 * A mutant whose structure differs from PSI while its original agrees is a divergence the
 * mutation made: verdict `C-mutant`, key `C* …`, which remains a per-input difference.
 *
 * @param {object[]} records
 * @param {string[]} labels
 * @param {Record<string, string>} origins - Mutant path → original path, both corpus-relative.
 */
function markMutants(records, labels, origins) {
  const byPath = new Map(records.map((record) => [record.path, record]));
  return records.map((record) => {
    const original = byPath.get(origins[record.path]);
    if (!original) return record;
    const results = { ...record.results };
    for (const label of labels) {
      const result = results[label];
      if (result?.verdict === 'C' && original.results[label]?.verdict === 'ok') {
        results[label] = { ...result, verdict: 'C-mutant', key: 'C* ' + result.key.slice(2) };
      }
    }
    return { ...record, results };
  });
}

function renderReport({ corpus, meta, summary, labels, triaged = null }) {
  const out = [`# PSI differential: ${corpus}`, ''];
  if (summary.conformance) out.push(renderConformance(summary.conformance));
  out.push(
    `Corpus root: \`${meta.root}\`${meta.rootHead ? ` at \`${meta.rootHead}\`` : ''}; ${meta.files} files.`,
  );
  for (const grammar of meta.grammars)
    out.push(
      `Grammar \`${grammar.label}\`: \`${grammar.root}\`${grammar.head ? ` at \`${grammar.head}\`` : ''}.`,
    );
  out.push(
    'PSI: kotlin-compiler-embeddable 2.4.21.',
    '',
    '| verdict | ' + labels.join(' | ') + ' |',
    '|---|' + labels.map(() => '---:').join('|') + '|',
  );
  const verdicts = [
    'ok',
    'A',
    'A-prefix',
    'B',
    'B-prefix',
    'B-script',
    'C',
    'C-mutant',
    'both-error',
    'oracle-failure',
    'harness-error',
  ];
  for (const verdict of verdicts)
    out.push(
      `| ${verdict} | ${labels.map((label) => summary.totals[label][verdict] || 0).join(' | ')} |`,
    );
  const table = (title, buckets) => {
    out.push(
      '',
      `## ${title}`,
      '',
      '| key | ' + labels.join(' | ') + ' | smallest example |',
      '|---|' + labels.map(() => '---:').join('|') + '|---|',
    );
    for (const bucket of buckets) {
      const example = labels.map((label) => bucket.examples[label][0]).find(Boolean);
      out.push(
        `| \`${bucket.key.replace(/\|/g, '\\|').replace(/`/g, 'ˋ')}\` | ${labels.map((label) => bucket.counts[label]).join(' | ')} | ${example ? `\`${example.path}${example.line ? `:${example.line}` : ''}\`` : ''} |`,
      );
    }
  };
  if (triaged) {
    out.push(
      '',
      `## Gate: ${triaged.failures.length ? 'FAIL' : 'PASS'} (${triaged.mode})`,
      '',
      `${triaged.existing.length} unchanged differences and ${triaged.existingClaims?.length || 0} known corpus discrepancies retained from the reference.`,
      '',
    );
    if (triaged.existingClaims?.length) {
      out.push('### Known corpus discrepancies (not new failures)', '');
      for (const claim of triaged.existingClaims) out.push(`- ${claim.path}: ${claim.message}`);
      out.push('');
    }
    for (const failure of triaged.failures)
      out.push(`- **${failure.kind}** ${failure.path}: ${failure.message}`);
    out.push(
      '',
      'Inspect a failing input, fix the grammar or corpus assertion, and rerun. Use --fresh after changing inputs in an explicit output directory.',
    );
  }
  if (labels.includes('base') && labels.length > 1) {
    const head = labels.find((label) => label !== 'base');
    table(
      `More in ${head} than in base`,
      summary.buckets.filter((bucket) => bucket.counts[head] > bucket.counts.base),
    );
  }
  table('Buckets', summary.buckets);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

module.exports = { readShards, summarize, markMutants, renderReport };
