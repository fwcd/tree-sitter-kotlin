'use strict';

function partition(file, corpus) {
  if (corpus === 'snippets') return 'generated';
  if (corpus === 'mutations') return file.startsWith('original/') ? 'testData-originals' : 'testData-mutants';
  if (corpus === 'corpus') return file.startsWith('jetbrains/') ? 'testData' : 'tests';
  const parts = file.toLowerCase().split('/'), name = parts.at(-1);
  const testModule = (corpus === 'kotlin' || /^(compiler|libraries)\//.test(file)) &&
    parts.some(p => /-(?:integration-)?tests?(?:-|$)/.test(p) &&
      !['kotlin-test', 'kotlin-test-common', 'kotlin-test-annotations-common'].includes(p));
  const testDirectories = new RegExp(
    '^(test|tests|tests-gen|testfixtures|test-fixtures|testframework|test-framework|' +
    'test-infrastructure(?:-.*)?|tests-common(?:-.*)?|tests-jvm|tests-spec|test-integration|stress)$',
  );
  const testSet = parts.some(p => testDirectories.test(p) ||
    /^(common|jvm|js|native|wasm|android|androidunit|androidinstrumented|ios|linux|macos|mingw).*tests?$/.test(p));
  if (parts.some(p => ['testdata', 'test-data', 'test_data'].includes(p))) return 'testData';
  if ((testModule || testSet) &&
      parts.some(p => ['resources', 'testresources', 'fixtures', 'testfixturesresources'].includes(p))) return 'testData';
  if (parts.includes('archetype-resources') || name.endsWith('.gradle.kts') ||
      parts.some(p => /^(examples?|samples?|benchmarks?|jmh|buildsrc|build-logic|scripts?|gradle)$/.test(p))) return 'support';
  if (testModule) return 'tests';
  const mainSet = /^(main|commonmain|jvmmain|jsmain|nativemain|wasmmain|androidmain|iosmain|linuxmain|macosmain|mingwmain)$/;
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === 'src' && mainSet.test(parts[i + 1])) return 'production';
    if (/^(common|jvm|js|native|wasm|android|ios|linux|macos|mingw)$/.test(parts[i]) && parts[i + 1] === 'src') return 'production';
  }
  if (testSet) return 'tests';
  return name.endsWith('.kts') ? 'support' : 'production';
}
const matches = (record, result) => result?.verdict === 'ok' && result.hasError !== true && !(record.psiErrors > 0);
const signature = result => JSON.stringify([result?.verdict, result?.key, result?.treeHash]);
const executionError = result => !result || ['oracle-failure', 'harness-error'].includes(result.verdict);
function conformance(records, labels, context = {}) {
  const groups = new Map();
  const group = name => {
    if (!groups.has(name)) groups.set(name, { partition: name, files: 0, excluded: 0,
      labels: Object.fromEntries(labels.map(label => [label, {
        mismatching: 0, verdicts: {}, psiRejected: 0, nativeRejected: 0, executionErrors: 0,
      }])),
      deltas: Object.fromEntries(labels.filter(label => label !== 'base').map(label => [label, { fixed: 0, worse: 0, changed: 0 }])) });
    return groups.get(name);
  };
  for (const file of context.excluded || []) group(partition(file, context.corpus)).excluded++;
  for (const record of records) {
    const row = group(partition(record.path, context.corpus)); row.files++;
    for (const label of labels) {
      const result = record.results[label], score = row.labels[label];
      if (!matches(record, result)) score.mismatching++;
      score.verdicts[result?.verdict || 'missing-result'] = (score.verdicts[result?.verdict || 'missing-result'] || 0) + 1;
      if (record.psiErrors > 0) score.psiRejected++;
      if (result?.hasError || ['A', 'A-prefix', 'both-error'].includes(result?.verdict)) score.nativeRejected++;
      if (['oracle-failure', 'harness-error', 'missing-result'].includes(result?.verdict || 'missing-result')) score.executionErrors++;
      if (label === 'base' || !labels.includes('base')) continue;
      const prior = record.results.base;
      if (executionError(prior) || executionError(result)) continue;
      const before = matches(record, prior), after = matches(record, result), delta = row.deltas[label];
      if (!before && after) delta.fixed++;
      else if (before && !after) delta.worse++;
      else if (!before && !after && signature(prior) !== signature(result)) delta.changed++;
    }
  }
  const order = ['production', 'tests', 'testData', 'support', 'generated', 'testData-originals', 'testData-mutants'];
  return { schemaVersion: 1, corpus: context.corpus, labels,
    partitions: [...groups.values()].sort((a, b) => order.indexOf(a.partition) - order.indexOf(b.partition)) };
}
function headlines(score) {
  return score.partitions.flatMap(row => score.labels.filter(label => label !== 'base').map(label => {
    const delta = row.deltas[label], prior = row.labels.base;
    return `${score.corpus}/${row.partition} (${label}): ${row.labels[label].mismatching} files mismatching ` +
      `(target 0, ${row.excluded} excluded)` + (prior
        ? `; base→${label} ${prior.mismatching}→${row.labels[label].mismatching}, ` +
          `fixed ${delta.fixed}, worse ${delta.worse}, changed ${delta.changed}` : '');
  }));
}
function renderConformance(score) {
  const out = ['## PSI conformance: files still mismatching', ''];
  out.push(...headlines(score), '',
    '| partition | files | excluded | grammar | mismatching | fixed | worse | changed |',
    '|---|---:|---:|---|---:|---:|---:|---:|');
  for (const row of score.partitions) for (const label of score.labels) {
    const delta = row.deltas[label];
    out.push(`| ${row.partition} | ${row.files} | ${row.excluded} | ${label} | ` +
      `${row.labels[label].mismatching} | ${delta?.fixed ?? '—'} | ${delta?.worse ?? '—'} | ${delta?.changed ?? '—'} |`);
  }
  out.push('', '| partition / grammar | ok | A | B | C | script-only | both-error | execution-error |',
    '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of score.partitions) for (const label of score.labels) {
    const value = row.labels[label], v = value.verdicts;
    out.push(`| ${row.partition} / ${label} | ${v.ok || 0} | ` +
      `${(v.A || 0) + (v['A-prefix'] || 0)} | ${(v.B || 0) + (v['B-prefix'] || 0)} | ` +
      `${(v.C || 0) + (v['C-mutant'] || 0)} | ${v['B-script'] || 0} | ${v['both-error'] || 0} | ${value.executionErrors} |`);
  }
  out.push('', 'Only a clean original-file comparison counts as a match. ' +
    'Script-only acceptance and syntax-bearing test data remain mismatches; ' +
    'partitions are directory-based and must be reviewed for a chosen gate corpus.', '');
  return out.join('\n');
}
module.exports = { partition, matches, conformance, headlines, renderConformance };
