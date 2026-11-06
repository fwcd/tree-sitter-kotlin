'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { positive } = require('../safety');
const FALLBACK_UPSTREAM = 'https://github.com/fwcd/tree-sitter-kotlin.git';

class GitTimeout extends Error {
  constructor(step, elapsed, timeout) {
    super(`TIMEOUT ${step} after ${(elapsed / 1000).toFixed(3)}s (Git budget ${timeout}ms). ` +
      'Use --base REV for a local/offline pin, --upstream REMOTE|URL for another source, ' +
      'or --git-timeout-ms N / PSI_GATE_GIT_TIMEOUT_MS to raise the timeout.');
    this.code = 'PSI_GATE_GIT_TIMEOUT';
  }
}

/** Select a local override or a proven merge-base, without updating tracking refs. */
function resolveBase(options = {}, { cwd = process.cwd(), env = process.env, log = console.log } = {}) {
  const timeout = positive(options.gitTimeoutMs ?? env.PSI_GATE_GIT_TIMEOUT_MS ?? 180000, '--git-timeout-ms', 3600000);
  const git = (args, optional = false, step = `git ${args[0]}`) => {
    const started = process.hrtime.bigint();
    const result = spawnSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout });
    if (result.error?.code === 'ETIMEDOUT')
      throw new GitTimeout(step, Number(process.hrtime.bigint() - started) / 1e6, timeout);
    if (result.error || result.status !== 0) {
      if (optional) return null;
      throw new Error('Could not read Git history; check this checkout or provide --base REV.');
    }
    return result.stdout.trim();
  };
  if (options.base) {
    if (options.base.startsWith('-')) throw new Error('Invalid --base revision');
    const commit = git(['rev-parse', '--verify', `${options.base}^{commit}`], true);
    if (!commit) throw new Error(`Could not resolve --base reference ${options.base}; fetch it or choose an existing --base REV.`);
    log(`Base ${commit}: explicit --base (no upstream fetch).`);
    return { commit, reason: 'explicit' };
  }
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  const remotes = git(['remote']).split('\n').filter(Boolean);
  const urlOf = remote => git(['config', '--get', `remote.${remote}.url`], true);
  const canonicalRemote = value => {
    try {
      const url = new URL((value || '').replace(/^([^/@]+@)?github\.com:/i, 'ssh://github.com/'));
      return url.hostname.toLowerCase() === 'github.com' &&
        /^\/fwcd\/tree-sitter-kotlin(?:\.git)?\/?$/i.test(url.pathname);
    } catch { return false; }
  };
  const requested = options.upstream || env.PSI_GATE_UPSTREAM;
  const preferred = [...new Set(['upstream', 'origin', ...remotes])];
  const remote = requested && remotes.includes(requested) ? requested
    : requested ? null : preferred.find(name => remotes.includes(name) && canonicalRemote(urlOf(name)));
  const url = requested && !remote ? requested : remote ? urlOf(remote) : FALLBACK_UPSTREAM;
  const remoteHead = remote && git(['symbolic-ref', `refs/remotes/${remote}/HEAD`], true);
  const branch = (options.upstreamBranch || env.PSI_GATE_UPSTREAM_BRANCH ||
    (remoteHead && remoteHead.slice(`refs/remotes/${remote}/`.length)) || 'main').replace(/^refs\/heads\//, '');
  if (git(['check-ref-format', `refs/heads/${branch}`], true) === null)
    throw new Error('Invalid upstream branch; use --upstream-branch NAME or --base REV.');
  const label = `${remote || (requested ? 'configured upstream' : 'canonical fallback')}/${branch}`;
  const fetch = (repository, refs, depth, role) => {
    const args = ['fetch', '--no-tags', '--no-prune', '--no-prune-tags', '--no-auto-gc', '--no-recurse-submodules', '--refmap='];
    const window = typeof depth === 'number' ? `depth ${depth}` : `since ${depth}`;
    args.push(typeof depth === 'number' ? `--depth=${depth}` : `--shallow-since=${depth}`);
    // Empty refmap and URL transport prevent configured remote fetch mappings
    // from updating refs/remotes/*; FETCH_HEAD is the only fetched reference.
    args.push('--', repository, ...refs);
    if (git(args, true, `fetch ${label} ${role}, ${window}`) === null)
      throw new Error(`Could not fetch upstream history for ${label}. Check connectivity/configuration, or use --base REV for an offline check.`);
  };
  const boundaries = () => {
    const file = path.resolve(cwd, git(['rev-parse', '--git-path', 'shallow']));
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : [];
  };
  const ancestor = (a, b) => git(['merge-base', '--is-ancestor', a, b], true) !== null;
  const initial = boundaries().filter(commit => ancestor(commit, head));
  const tracking = git(['symbolic-ref', '--short', 'HEAD'], true);
  const trackingRemote = tracking && git(['config', '--get', `branch.${tracking}.remote`], true);
  const historyRemote = trackingRemote && remotes.includes(trackingRemote) ? trackingRemote
    : remotes.includes('origin') ? 'origin' : remote;
  const historyUrl = historyRemote ? urlOf(historyRemote) : url;
  const knownBase = upstream => {
    if (git(['cat-file', '-e', `${upstream}^{commit}`], true) === null) return null;
    const commit = git(['merge-base', head, upstream], true);
    if (!commit || boundaries().some(boundary =>
      (ancestor(boundary, head) || ancestor(boundary, upstream)) && !ancestor(boundary, commit))) return null;
    log(`Base ${commit}: merge-base of HEAD and ${label} (upstream tip ${upstream}).`);
    return { commit, upstream, remote: remote || null, branch, reason: 'merge-base' };
  };
  const advertised = git(['ls-remote', '--exit-code', url, `refs/heads/${branch}`], true, `advertise ${label}`);
  if (!advertised)
    throw new Error(`Could not fetch upstream history for ${label}. Check connectivity/configuration, or use --base REV for an offline check.`);
  const tip = advertised.split(/\s+/)[0];
  const existing = knownBase(tip);
  if (existing) return existing;
  // Begin cheaply even when only the upstream side is shallow/missing. Each
  // larger window is bounded, and a slow window does not end the progression.
  const depths = [1, 8, 32, 128, 512, 2048, 4096];
  let lastTimeout, windowTimedOut, triedSince = false;
  const attempt = (repository, refs, depth, role) => {
    try { fetch(repository, refs, depth, role); return true; }
    catch (error) {
      if (!(error instanceof GitTimeout)) throw error;
      lastTimeout = error; windowTimedOut = true;
      log(`${error.message} Continuing the bounded history progression.`);
      return false;
    }
  };
  for (const depth of depths) {
    windowTimedOut = false;
    if (!triedSince && initial.length && git(['cat-file', '-e', `${tip}^{commit}`], true) !== null) {
      triedSince = true;
      const timestamp = Number(git(['show', '-s', '--format=%ct', tip]));
      if (Number.isSafeInteger(timestamp) && timestamp > 0) {
        const since = new Date((timestamp - 1) * 1000).toISOString();
        try { fetch(historyUrl, initial, since, 'fork ancestry'); }
        catch (error) {
          if (error instanceof GitTimeout) log(error.message + ' Continuing depth windows.');
          else log('Date-bounded fork history unavailable; continuing depth windows.');
        }
        const fromDate = knownBase(tip);
        if (fromDate) return fromDate;
      }
    }
    const historyFetched = initial.length && attempt(historyUrl, initial, depth, 'fork ancestry');
    // The fork history often already contains upstream's advertised tip. Avoid
    // downloading its trees/blobs again when the complete ancestor is now local.
    const fromHistory = knownBase(tip);
    if (fromHistory) return fromHistory;
    const tipKnown = git(['cat-file', '-e', `${tip}^{commit}`], true) !== null;
    if (historyFetched && depth > 1 && depth < depths.at(-1) && tipKnown &&
        boundaries().some(boundary => ancestor(boundary, head))) {
      log(`Extending fork ancestry at depth ${depth} before requesting a larger upstream window for ${label}.`);
      continue;
    }
    // A complete upstream chain needs no additional fetch, even if the local
    // fork still has a shallow frontier. Do not shorten its known ancestry.
    if (tipKnown &&
        !boundaries().some(boundary => ancestor(boundary, tip))) continue;
    if (!attempt(url, [`refs/heads/${branch}`], depth, 'upstream history')) continue;
    const upstream = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
    const resolved = knownBase(upstream);
    if (resolved) return resolved;
  }
  if (windowTimedOut) {
    lastTimeout.message += ' No complete common ancestor after the bounded history progression.';
    throw lastTimeout;
  }
  throw new Error('Cannot establish a complete common ancestor with upstream. Fetch more history or use --base REV explicitly.');
}

module.exports = { resolveBase, FALLBACK_UPSTREAM };
