'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execFile } = require('child_process');
const { minimatch } = require('minimatch');
const { canonical, sha256 } = require('../safety');
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 180000,
    maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function inspectRepository(input, revision = null) {
  const root = canonical(input);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`Repository folder is missing: ${input}`);
  let top, commit;
  try { top = canonical(git(root, ['rev-parse', '--show-toplevel']).trim()); commit = git(root, ['rev-parse', 'HEAD']).trim(); }
  catch { throw new Error(`repo requires a Git checkout with a commit: ${input}`); }
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
function runGit(args, cwd, timeout = 180000) {
  return new Promise((resolve, reject) => execFile('git', args, { cwd, timeout, maxBuffer: 32 * 1024 * 1024 },
    (error, stdout, stderr) => error ? reject(new Error(`Repository Git operation failed: ${stderr || error.message}`)) : resolve(stdout)));
}
async function fetchRepository(repo, home, { timeoutMs = 180000 } = {}) {
  const cache = path.join(home, 'repos', `${repo.name}-${sha256(repo.url + '\0' + repo.rev).slice(0, 16)}`);
  if (!fs.existsSync(path.join(cache, '.git'))) {
    if (fs.existsSync(cache) && fs.readdirSync(cache).length) throw new Error(`Repository cache is unowned: ${cache}`);
    fs.mkdirSync(cache, { recursive: true });
    await runGit(['init', '-q'], cache, timeoutMs);
    await runGit(['fetch', '--depth=1', '--no-tags', '--refmap=', '--', repo.url, repo.rev], cache, timeoutMs);
    await runGit(['checkout', '-q', '--detach', 'FETCH_HEAD'], cache, timeoutMs);
  }
  return { ...repo, ...inspectRepository(cache, repo.rev), ...selectFiles(cache, repo) };
}
async function fetchRepositories(repos, home, options) {
  return Promise.all(repos.map(repo => fetchRepository(repo, home, options)));
}
module.exports = { inspectRepository, indexFiles, selectFiles, fetchRepository, fetchRepositories };
