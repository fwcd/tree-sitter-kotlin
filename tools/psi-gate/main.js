#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { runIfMain } = require('../cli');
const { loadConfig } = require('./config');
const { HELP, argumentsOf } = require('./options');
const { prerequisites, createParser } = require('./runtime');
const { assertHome, withHome } = require('./home');
const { inspectRepository, selectFiles, fetchRepositories } = require('./repository');
const { checkFiles } = require('./check');
const { fetchAll } = require('../psi-oracle/fetch');
const ROOT = path.resolve(__dirname, '../..');
function quick(options) { return require('./quick').run({ ...options, root: ROOT }); }
async function checkRepository(repo, options) {
  const selected = repo.files ? repo : { ...repo, ...selectFiles(repo.root, repo) };
  const out = path.join(options.home, 'runs', repo.name || 'repo');
  const result = await checkFiles({ ...options, root: repo.root, files: selected.files, out });
  inspectRepository(repo.root, repo.rev);
  console.log(`${repo.name || 'repo'}: ${result.mismatches.length} files mismatching (target 0, ${selected.excluded.length} excluded)`);
  for (const row of result.mismatches) console.log(`${row.path}: ${row.verdict}: ${row.key || 'PSI mismatch'}`);
  if (selected.excluded.length) {
    try {
      const omitted = await checkFiles({ ...options, root: repo.root, files: selected.excluded, out: out + '-excluded' });
      for (const row of omitted.rows.filter(row => row.match)) console.log(`NOTICE excluded file now matches PSI: ${row.path}`);
    } catch (error) { console.log(`NOTICE excluded-file probe unavailable: ${error.message}`); }
  }
  inspectRepository(repo.root, repo.rev);
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ name: repo.name, revision: repo.commit,
    files: result.files, mismatching: result.mismatches.length, excluded: selected.excluded }, null, 2) + '\n');
  return result;
}
async function full(options) {
  const quickPromise = Promise.resolve().then(() => quick(options));
  const repoPromise = Promise.all([fetchRepositories(options.config.repos, options.home), fetchAll({ config: options.config })])
    .then(async ([repos]) => {
      const results = [];
      for (const repo of repos) results.push(await checkRepository(repo, options));
      return { exitCode: results.some(result => result.exitCode) ? 1 : 0 };
    });
  const results = await Promise.allSettled([quickPromise, repoPromise]);
  for (const result of results) if (result.status === 'rejected') console.error(result.reason.message);
  return { exitCode: results.some(result => result.status === 'rejected' || result.value.exitCode) ? 1 : 0 };
}
async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return { exitCode: 0 }; }
  const options = argumentsOf(argv); options.config = loadConfig(options.configFile);
  assertHome(options.home);
  prerequisites({ java: options.command !== 'quick' });
  return withHome(options.home, async () => {
    if (options.command === 'quick') return quick(options);
    if (options.command === 'full') return full(options);
    if (options.command === 'repo') {
      const repo = inspectRepository(options.repoRoot); await fetchAll({ config: options.config });
      return checkRepository(repo, options);
    }
    if (options.command === 'regenerate-expectations') return require('./quick').regenerate({ ...options, root: ROOT });
    if (options.command === 'add') return require('./add').run(options);
    return require('./fuzz').run(require('./fuzz').argumentsOf(options.forward, {
      config: options.config, home: options.home, jobs: options.jobs, timeoutMs: options.timeoutMs,
      parseTimeoutMs: options.parseTimeoutMs}));
  });
}
async function prepareGrammar({ home, config = loadConfig(), base, upstream } = {}) {
  if (base || upstream) throw new Error('Historical grammar selection was removed; build the current repo with npm install');
  prerequisites(); createParser(); await fetchAll({ config });
  return { grammar: ROOT, runtime: ROOT, revision: 'current-working-tree' };
}
module.exports = { main, argumentsOf, prerequisites, prepareGrammar, full, checkRepository };
runIfMain(module, main);
