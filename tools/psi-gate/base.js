'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FALLBACK_UPSTREAM = 'https://github.com/fwcd/tree-sitter-kotlin.git';

/** Select a local override or a proven merge-base, without updating tracking refs. */
function resolveBase(options = {}, { cwd = process.cwd(), env = process.env, log = console.log } = {}) {
  const git = (args, optional = false) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 180000 });
    if (result.error || result.status !== 0) {
      if (optional) return null;
      throw new Error('Could not read Git history; check this checkout or provide --base REV.');
    }
    return result.stdout.trim();
  };
  if (options.base) {
    if (options.base.startsWith('-')) throw new Error('Invalid --base revision');
    const commit = git(['rev-parse', '--verify', `${options.base}^{commit}`]);
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
  const fetch = (repository, refs, depth) => {
    const args = ['fetch', '--no-tags', '--no-prune', '--no-prune-tags', '--no-auto-gc', '--no-recurse-submodules', '--refmap='];
    if (depth) args.push(`--depth=${depth}`);
    // Empty refmap and URL transport prevent configured remote fetch mappings
    // from updating refs/remotes/*; FETCH_HEAD is the only fetched reference.
    args.push('--', repository, ...refs);
    if (git(args, true) === null)
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
  const depths = git(['rev-parse', '--is-shallow-repository']) === 'true' ? [64, 256, 1024, 4096] : [null];
  for (const depth of depths) {
    if (depth && initial.length) fetch(historyUrl, initial, depth);
    fetch(url, [`refs/heads/${branch}`], depth);
    const upstream = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
    const commit = git(['merge-base', head, upstream], true);
    if (!commit) continue;
    // A shallow frontier outside the candidate's ancestry could hide a better
    // common ancestor. Deepen until every relevant frontier is at/before it.
    const incomplete = boundaries().some(boundary =>
      (ancestor(boundary, head) || ancestor(boundary, upstream)) && !ancestor(boundary, commit));
    if (incomplete) continue;
    log(`Base ${commit}: merge-base of HEAD and ${label} (upstream tip ${upstream}).`);
    return { commit, upstream, remote: remote || null, branch, reason: 'merge-base' };
  }
  throw new Error('Cannot establish a complete common ancestor with upstream. Fetch more history or use --base REV explicitly.');
}

module.exports = { resolveBase, FALLBACK_UPSTREAM };
