'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const { minimatch } = require('minimatch');
const {resourceError, isResourceError} = require('../resource');
const { canonical, sha256, positive } = require('../safety');
const gitTimeout = () => positive(process.env.PSI_GATE_GIT_TIMEOUT_MS || 180000, 'PSI_GATE_GIT_TIMEOUT_MS', 3600000);
function gitFailure(error, args, limit, stderr = '') {
  if (error.code === 'ETIMEDOUT' || error.killed && error.signal === 'SIGTERM')
    return resourceError(`Git ${args[0]} timed out after ${limit} ms`, 'PSI_GIT_TIMEOUT');
  return new Error(`Repository Git operation failed: ${stderr || error.stderr?.toString() || error.message}`);
}
function git(root, args) {
  const limit = gitTimeout();
  try { return execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', timeout: limit,
    maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}); }
  catch (error) {throw gitFailure(error, args, limit);}
}
function inspectRepository(input, revision = null) {
  const root = canonical(input);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Repository folder is missing: ${input}`);
  let top, commit;
  try { top = canonical(git(root, ['rev-parse', '--show-toplevel']).trim()); commit = git(root, ['rev-parse', 'HEAD']).trim(); }
  catch (error) { if (isResourceError(error)) throw error;
    throw new Error(`repo requires a Git checkout with a commit: ${input}`); }
  const dirty = git(top, ['status', '--porcelain', '--untracked-files=no']).trim();
  if (dirty) throw new Error(`External repository has modified or staged tracked files:\n${dirty}`);
  if (revision && commit !== revision) throw new Error(`Repository HEAD ${commit} differs from configured rev ${revision}`);
  return { root, top, commit };
}
function indexFiles(root) {
  return [...new Set(git(root, ['ls-files', '-z']).split('\0').filter(Boolean))].sort();
}
function selectFiles(root, { includes = ['**/*.kt', '**/*.kts'], excludes = [] } = {}) {
  const candidates = indexFiles(root).filter(file => /\.kts?$/.test(file) &&
    includes.some(pattern => minimatch(file, pattern, { dot: true })));
  const excluded = candidates.filter(file => excludes.some(pattern => minimatch(file, pattern, { dot: true })));
  const omitted = new Set(excluded);
  return { files: candidates.filter(file => !omitted.has(file)), excluded, candidates };
}
function runGit(args, cwd, timeout = gitTimeout()) {
  return new Promise((resolve, reject) => execFile('git', args, { cwd, timeout, maxBuffer: 32 * 1024 * 1024 },
    (error, stdout, stderr) => error ? reject(gitFailure(error, args, timeout, stderr)) : resolve(stdout)));
}
function freshHomeRemedy(home) {
  const quoted = "'" + (home + '-retry').replace(/'/g, "'\\''") + "'";
  return `Choose an empty home: npm run psi-gate -- full --home ${quoted}`;
}
async function fetchRepository(repo, home, {gitTimeoutMs = gitTimeout(), log = () => {}} = {}) {
  const cache = path.join(home, 'repos', `${repo.name}-${sha256(repo.url + '\0' + repo.rev).slice(0, 16)}`);
  if (fs.existsSync(cache) && fs.lstatSync(cache).isSymbolicLink())
    throw new Error(`Repository cache is a symlink: ${cache}. ${freshHomeRemedy(home)}`);
  const cached = fs.existsSync(path.join(cache, '.git'));
  log(`${repo.name}: ${cached ? 'checking cached checkout' : 'fetching ' + repo.url}`);
  try {
    if (!cached) {
      if (fs.existsSync(cache) && fs.readdirSync(cache).length) throw new Error(`Repository cache is unowned: ${cache}`);
      fs.mkdirSync(cache, {recursive: true});
      await runGit(['init', '-q'], cache, gitTimeoutMs);
    }
    let hasHead = true;
    try { await runGit(['rev-parse', '--verify', 'HEAD'], cache, gitTimeoutMs); }
    catch (error) { if (isResourceError(error)) throw error; hasHead = false; }
    if (!hasHead) {
      const metadata = fs.lstatSync(path.join(cache, '.git'));
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error(`Incomplete cache metadata is not owned: ${cache}`);
      const dirty = (await runGit(['status', '--porcelain', '--untracked-files=no'], cache, gitTimeoutMs)).trim();
      if (dirty || indexFiles(cache).length) throw new Error(`Incomplete cache has indexed work; recovery refused:\n${dirty}`);
      const top = canonical((await runGit(['rev-parse', '--show-toplevel'], cache, gitTimeoutMs)).trim());
      if (top !== canonical(cache)) throw new Error(`Incomplete cache is not its own Git checkout: ${cache}`);
      if (cached) log(`${repo.name}: resuming incomplete cached checkout`);
      await runGit(['fetch', '--depth=1', '--no-tags', '--refmap=', '--', repo.url, repo.rev], cache, gitTimeoutMs);
      await runGit(['checkout', '--no-overwrite-ignore', '-q', '--detach', 'FETCH_HEAD'], cache, gitTimeoutMs);
    }
    const result = {...repo, ...inspectRepository(cache, repo.rev), ...selectFiles(cache, repo)};
    log(`${repo.name}: pinned checkout ready at ${result.commit}; ${result.files.length} selected, ${result.excluded.length} excluded`);
    return result;
  } catch (error) {
    if (isResourceError(error)) throw error;
    throw new Error(`${error.message}\n${freshHomeRemedy(home)}`);
  }
}
async function fetchRepositories(repos, home, options) {
  return Promise.all(repos.map(repo => fetchRepository(repo, home, options)));
}
module.exports = { inspectRepository, indexFiles, selectFiles, fetchRepository, fetchRepositories, runGit };
