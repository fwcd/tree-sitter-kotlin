import { it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { conformance, headlines, partition } = require('./conformance');
const { renderReport, summarize } = require('./diff-report');
const state = require('../psi-gate/state');
const result = (verdict, treeHash = verdict) => ({ verdict, key: verdict === 'ok' ? undefined : verdict + ' bucket', treeHash });
const row = (path, base, head, psiErrors = 0) => ({ path, sha256: path, bytes: 10, psiErrors, results: { base, head } });
it('counts newly matching/worse/changed files independently in source partitions', () => {
  const records = [
    row('src/main/fixed.kt', result('C'), result('ok')),
    row('src/main/worse.kt', result('ok'), result('C')),
    row('src/main/changed.kt', result('C'), result('C', 'different')),
    row('src/test/test.kt', result('C'), result('ok')),
    row('compiler/testData/negative.kt', result('both-error'), result('both-error'), 1),
    row('build.gradle.kts', result('B-script'), result('B-script'), 1),
  ];
  const score = conformance(records, ['head', 'base'], { corpus: 'repo', excluded: ['src/main/excluded.kt'] });
  const source = score.partitions.find(p => p.partition === 'production');
  expect(source.labels.base.mismatching).toBe(2);
  expect(source.labels.head.mismatching).toBe(2);
  expect(source.deltas.head).toEqual({ fixed: 1, worse: 1, changed: 1 });
  expect(source.excluded).toBe(1);
  expect(score.partitions.find(p => p.partition === 'testData').labels.head.mismatching).toBe(1);
  expect(score.partitions.find(p => p.partition === 'support').labels.head.mismatching).toBe(1);
  expect(headlines(score).join('\n')).toContain('target 0, 1 excluded');
  expect(headlines(score).join('\n')).not.toContain('%');
});
it('credits N actual fixes rather than bucket-count changes', () => {
  const records = [0, 1, 2].map(i => row(`src/main/${i}.kt`, result('A'), result('ok')));
  const source = conformance(records, ['base', 'head'], { corpus: 'repo' }).partitions[0];
  expect(source.labels.base.mismatching).toBe(3);
  expect(source.labels.head.mismatching).toBe(0);
  expect(source.deltas.head.fixed).toBe(3);
  expect(state.gate(records, 'head', { base: 'base' }).failures).toEqual([]);
});
it('shows execution failures without crediting them as grammar fixes or regressions', () => {
  const records = [
    row('src/main/no-oracle.kt', result('oracle-failure'), result('ok')),
    row('src/main/no-harness.kt', result('ok'), result('harness-error')),
  ];
  const source = conformance(records, ['base', 'head'], { corpus: 'repo' }).partitions[0];
  expect(source.deltas.head).toEqual({ fixed: 0, worse: 0, changed: 0 });
  expect(source.labels.base.executionErrors).toBe(1);
  expect(source.labels.head.executionErrors).toBe(1);
  expect(state.gate(records, 'head', { base: 'base' }).failures).toHaveLength(2);
});
it('distinguishes scripted/negative inputs from full clean matches in strict mode', () => {
  for (const verdict of ['both-error', 'B-script']) {
    const records = [row('testData/a.kt', result(verdict), result(verdict), 1)];
    expect(state.gate(records, 'head', { base: 'base' }).failures).toEqual([]);
    expect(state.gate(records, 'head', { base: 'base', conformance: true }).failures).toHaveLength(1);
  }
});
it('puts mismatch counts before provenance and diagnostic buckets', () => {
  const records = [row('src/main/a.kt', result('C'), result('ok'))];
  const summary = summarize(records, ['base', 'head'], null, { corpus: 'repo' });
  const report = renderReport({ corpus: 'repo', summary, labels: ['base', 'head'],
    meta: { root: '/input', files: 1, grammars: [] } });
  expect(report.indexOf('files still mismatching')).toBeLessThan(report.indexOf('Corpus root:'));
  expect(report).toContain('base→head 1→0, fixed 1, worse 0, changed 0');
  expect(report).not.toContain('%');
});
it('keeps generated/test resources separate and respects production source sets', () => {
  expect(partition('x.kt', 'snippets')).toBe('generated');
  expect(partition('original/x.kt', 'mutations')).toBe('testData-originals');
  expect(partition('compiler/api-tests/src/main/F.kt', 'kotlin')).toBe('tests');
  expect(partition('library/src/commonMain/kotlin/test/F.kt', 'repo')).toBe('production');
  expect(partition('src/test/resources/a.kt', 'repo')).toBe('testData');
});
