#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { runIfMain } = require('../cli');
const { loadConfig } = require('./config');
const { commandHelp, argumentsOf } = require('./options');
const { prerequisites, createParser } = require('./runtime');
const { assertHome, withHome } = require('./home');
const { inspectRepository, selectFiles, fetchRepositories } = require('./repository');
const {isResourceError, resourceMessage} = require('../resource');
const { checkFiles } = require('./check');
const { fetchAll } = require('../psi-oracle/fetch');
const ROOT = path.resolve(__dirname, '../..');
function quick(options) { return require('./quick').run({...options, root: ROOT}); }
async function checkRepository(repo, options) {
  const selected = repo.files ? repo : { ...repo, ...selectFiles(repo.root, repo) };
  const out = path.join(options.home, 'runs', repo.name || 'repo');
  console.error(`${repo.name || 'repo'}: comparing with live PSI...`);
  const result = await checkFiles({ ...options, root: repo.root, files: selected.files, out });
  inspectRepository(repo.root, repo.rev);
  console.log(`${repo.name || 'repo'}: ${result.mismatches.length} files mismatching (target 0, ${selected.excluded.length} excluded)`);
  for (const row of result.mismatches) console.error(`${row.path}: ${row.verdict}: ${row.key || 'PSI mismatch'}`);
  if (selected.excluded.length) {
    try {
      const omitted = await checkFiles({ ...options, root: repo.root, files: selected.excluded, out: out + '-excluded' });
      for (const row of omitted.rows.filter(row => row.match)) console.error(`NOTICE excluded file now matches PSI: ${row.path}`);
    } catch (error) { console.error(`NOTICE excluded-file probe unavailable: ${error.message}`); }
  }
  inspectRepository(repo.root, repo.rev);
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ name: repo.name, revision: repo.commit,
    files: result.files, mismatching: result.mismatches.length, excluded: selected.excluded }, null, 2) + '\n');
  return result;
}
async function full(options) {
  const started = Date.now(), exits = [];
  const preparations = await Promise.allSettled([
    Promise.resolve().then(() => quick({...options, emit: false})),
    Promise.all([fetchRepositories(options.config.repos, options.home, {log: console.error}),
      fetchAll({config: options.config})]).then(([repos]) => repos),
  ]);
  const failed = error => {
    console.error(isResourceError(error) ? resourceMessage('full', error) : error.message);
    exits.push(isResourceError(error) ? 2 : 1);
  };
  const [q, r] = preparations;
  if (q.status === 'fulfilled') {require('./quick').printResult(q.value); exits.push(q.value.exitCode);}
  else failed(q.reason);
  if (r.status === 'fulfilled') for (const repo of r.value) {
    try {exits.push((await checkRepository(repo, options)).exitCode);} catch (error) {failed(error);}
  } else failed(r.reason);
  const exitCode = exits.includes(2) ? 2 : exits.includes(1) ? 1 : 0;
  console.log(`full: ${exitCode === 0 ? 'PASS' : exitCode === 2 ? 'INCOMPLETE' : 'FAIL'}`);
  console.error(`full: completed in ${((Date.now() - started) / 1000).toFixed(2)}s`);
  return {exitCode};
}
async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(commandHelp(argv[0])); return { exitCode: 0 }; }
  const options = argumentsOf(argv); options.config = loadConfig(options.configFile);
  assertHome(options.home);
  prerequisites({ java: options.command !== 'quick' });
  const usesBinding = ['quick', 'full', 'repo'].includes(options.command);
  const binding = require('../../bindings/node/build');
  const before = usesBinding ? binding.assertFresh().source.hash : null;
  if (usesBinding) createParser();
  const result = await withHome(options.home, async () => {
    if (options.command === 'quick') return quick(options);
    if (options.command === 'full') return full(options);
    if (options.command === 'repo') {
      const repo = inspectRepository(options.repoRoot); await fetchAll({ config: options.config });
      return checkRepository(repo, options);
    }
    if (options.command === 'regenerate-expectations') return require('./quick').regenerate({ ...options, root: ROOT });
    if (options.command === 'coverage') {
      await fetchAll({config: options.config});
      return {exitCode: 0, ...await require('./quick-coverage').measure(options)};
    }
    if (options.command === 'minimize') return require('./minimize').run(options);
    if (options.command === 'add') return require('./add').run(options);
    return require('./fuzz').run(require('./fuzz').argumentsOf(options.forward, {
      config: options.config, home: options.home, jobs: options.jobs, timeoutMs: options.oracleTimeoutMs,
      parseTimeoutMs: options.parseTimeoutMs}));
  });
  if (usesBinding && binding.assertFresh().source.hash !== before)
    throw Error('Native binding inputs changed during this check; rerun npm run psi-gate');
  return result;
}
async function prepareGrammar({ home, config = loadConfig(), base, upstream } = {}) {
  if (base || upstream) throw new Error('Historical grammar selection was removed; build the current repo with npm install');
  prerequisites(); createParser(); await fetchAll({ config });
  return { grammar: ROOT, runtime: ROOT, revision: 'current-working-tree' };
}
module.exports = { main, argumentsOf, prerequisites, prepareGrammar, full, checkRepository };
runIfMain(module, main);
