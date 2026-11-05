'use strict';

const fs = require('fs');
const path = require('path');
const { run, resetOutput } = require('../safety');
const state = require('./state');
const { unmarked, snapshotRepository } = require('./repository');
const ROOT = path.resolve(__dirname, '../..');
const KOTLIN = '9180ce6a7a7d3627f88b424717583f28ddca052d';

function checkoutKotlin(home) {
  const root = path.join(home, 'kotlin');
  if (!fs.existsSync(path.join(root, '.git'))) {
    console.log(
      'Fetching pinned Kotlin inputs (full checkout, only for selected repository/mutation corpora)...',
    );
    resetOutput(root);
    run('git', ['init', '-q', root]);
    run('git', [
      '-C',
      root,
      'fetch',
      '--depth=1',
      'https://github.com/JetBrains/kotlin.git',
      KOTLIN,
    ]);
    run('git', ['-C', root, 'checkout', '-q', 'FETCH_HEAD']);
  }
  if (
    run('git', ['-C', root, 'rev-parse', 'HEAD']).trim() !== KOTLIN ||
    run('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no']).trim()
  )
    throw new Error('Kotlin input cache is not clean at its pinned revision; choose a new --home');
  return root;
}

function corpusPlan(corpus, options, kotlin, baseRevision) {
  let root = path.join(options.home, 'corpora', corpus),
    extra = [],
    provenance = { corpus };
  if (corpus === 'repo') {
    const snapshot = snapshotRepository(options.repoRoot, options.home);
    return { ...snapshot, reportContext: { excluded: snapshot.repository.markupExcluded } };
  } else if (corpus === 'snippets') {
    run(process.execPath, [path.join(ROOT, 'tools/cross-validation/mutations.js'), '--out', root]);
    provenance.generator = state.hashFile(path.join(ROOT, 'tools/cross-validation/mutations.js'));
  } else if (corpus === 'corpus') {
    run(process.execPath, [
      path.join(__dirname, 'corpus.js'),
      path.join(ROOT, 'test/corpus'),
      root,
    ]);
    extra.push('--base-cases', baseCorpus(options.home, baseRevision));
  } else if (corpus === 'mutations') {
    run(process.execPath, [
      path.join(__dirname, 'mutate.js'),
      path.join(kotlin, 'compiler/psi/psi-impl/testData/psi'),
      root,
    ]);
    extra.push('--origins', path.join(root, 'origins.json'));
    provenance = {
      corpus,
      revision: KOTLIN,
      seed: 'psi-gate',
      perFile: 2,
      generator: state.hashFile(path.join(__dirname, 'mutate.js')),
    };
  } else {
    root = corpus === 'kotlin' ? kotlin : path.resolve(process.env.IDEA_ROOT);
    const commit = corpus === 'kotlin' ? KOTLIN : process.env.IDEA_REV;
    if (
      run('git', ['-C', root, 'rev-parse', 'HEAD']).trim() !== commit ||
      run('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no']).trim()
    )
      throw new Error(`${corpus} checkout differs from its pinned revision`);
    const list = path.join(options.home, corpus + '.list');
    const selected = unmarked(root);
    fs.writeFileSync(list, selected.join('\n') + '\n');
    const tracked = run('git', ['-C', root, 'ls-files', '-z', '--', '*.kt', '*.kts']).split('\0').filter(Boolean);
    const included = new Set(selected);
    const reportContext = { excluded: tracked.filter(file => !included.has(file)) };
    return { root, extra: [...extra, '--list', list], reportContext };
  }
  if (provenance) fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(provenance));
  return { root, extra };
}

function baseCorpus(home, revision) {
  const directory = path.join(home, 'base-corpus', revision);
  const cases = path.join(directory, 'inputs', 'cases.json');
  const receipt = path.join(directory, 'claims.sha256');
  if (fs.existsSync(cases)) {
    if (!fs.existsSync(receipt) || fs.readFileSync(receipt, 'utf8') !== state.hashFile(cases))
      throw new Error('Base corpus cache is corrupt; choose a new --home');
    return cases;
  }
  resetOutput(directory);
  const source = path.join(directory, 'source');
  fs.mkdirSync(source);
  const archive = run('git', ['archive', revision, 'test/corpus'], { cwd: ROOT, encoding: null });
  run('tar', ['-x', '-C', source], { input: archive });
  require('./corpus').main([path.join(source, 'test/corpus'), path.join(directory, 'inputs')]);
  fs.writeFileSync(receipt, state.hashFile(cases));
  return cases;
}


module.exports = { checkoutKotlin, corpusPlan, baseCorpus };
