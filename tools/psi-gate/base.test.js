import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const { resolveBase } = require('./base');
const { argumentsOf } = require('./main');
const git = (root, ...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const refs = root => git(root, 'for-each-ref', '--format=%(refname) %(objectname) %(symref)');
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-base-'));
  const seed = path.join(dir, 'seed'), upstream = path.join(dir, 'upstream.git'), local = path.join(dir, 'local');
  fs.mkdirSync(seed);
  git(seed, 'init', '-q'); git(seed, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(seed, 'config', 'user.name', 'Test'); git(seed, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(seed, 'grammar-state'), 'original\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'common ancestor');
  const common = git(seed, 'rev-parse', 'HEAD');
  git(dir, 'clone', '-q', '--bare', seed, upstream);
  git(dir, 'clone', '-q', upstream, local);
  git(local, 'config', 'user.name', 'Test'); git(local, 'config', 'user.email', 'test@example.invalid');
  git(local, 'checkout', '-qb', 'feature');
  fs.writeFileSync(path.join(local, 'feature-only'), 'contributor change\n');
  git(local, 'add', '.'); git(local, 'commit', '-qm', 'feature');
  fs.writeFileSync(path.join(seed, 'grammar-state'), 'upstream-only parser change\n');
  fs.writeFileSync(path.join(seed, 'upstream-only'), 'upstream change\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-qm', 'upstream advances');
  git(seed, 'tag', 'new-upstream-tag');
  git(seed, 'push', '-q', upstream, 'main', '--tags');
  return { dir, seed, upstream, local, common, tip: git(seed, 'rev-parse', 'HEAD') };
}
const cleanup = f => fs.rmSync(f.dir, { recursive: true });

describe('upstream merge-base selection', () => {
  it('excludes upstream-only changes and leaves all refs/tags unchanged', () => {
    const f = fixture();
    try {
      const before = refs(f.local), messages = [];
      const result = resolveBase({ upstream: f.upstream }, { cwd: f.local, env: {}, log: s => messages.push(s) });
      expect(result.commit).toBe(f.common);
      expect(result.upstream).toBe(f.tip);
      expect(git(f.local, 'diff', '--name-only', result.commit, 'HEAD')).toBe('feature-only');
      expect(git(f.local, 'diff', '--name-only', f.tip, 'HEAD')).toContain('upstream-only');
      expect(git(f.local, 'show', result.commit + ':grammar-state')).toBe('original');
      expect(refs(f.local)).toBe(before);
      expect(git(f.local, 'tag')).toBe('');
      expect(messages[0]).toContain('merge-base of HEAD');
    } finally { cleanup(f); }
  });
  it('prefers a canonical configured remote and honors its existing default branch', () => {
    const f = fixture();
    try {
      git(f.seed, 'push', '-q', f.upstream, 'main:trunk');
      git(f.local, 'remote', 'add', 'upstream', 'https://github.com/fwcd/tree-sitter-kotlin.git');
      git(f.local, 'config', `url.${f.upstream}.insteadOf`, 'https://github.com/fwcd/tree-sitter-kotlin.git');
      git(f.local, 'update-ref', 'refs/remotes/upstream/trunk', f.common);
      git(f.local, 'symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/trunk');
      const before = refs(f.local);
      const result = resolveBase({}, { cwd: f.local, env: {}, log: () => {} });
      expect(result).toMatchObject({ commit: f.common, remote: 'upstream', branch: 'trunk' });
      expect(refs(f.local)).toBe(before);
    } finally { cleanup(f); }
  });
  it('supports URL/remote and branch overrides through flags or environment', () => {
    const f = fixture();
    try {
      git(f.seed, 'push', '-q', f.upstream, 'main:develop');
      git(f.local, 'remote', 'add', 'custom', f.upstream);
      const env = { PSI_GATE_UPSTREAM: 'custom', PSI_GATE_UPSTREAM_BRANCH: 'develop' };
      const fromEnv = resolveBase({}, { cwd: f.local, env, log: () => {} });
      expect(fromEnv).toMatchObject({ commit: f.common, remote: 'custom', branch: 'develop' });
      const options = argumentsOf(['quick', '--upstream', f.upstream, '--upstream-branch', 'main']);
      const fromFlags = resolveBase(options, { cwd: f.local, env, log: () => {} });
      expect(fromFlags).toMatchObject({ commit: f.common, remote: null, branch: 'main' });
    } finally { cleanup(f); }
  });
  it('uses the documented canonical fallback without creating a tracking remote', () => {
    const f = fixture();
    try {
      git(f.local, 'config', `url.${f.upstream}.insteadOf`, 'https://github.com/fwcd/tree-sitter-kotlin.git');
      const before = refs(f.local), remoteNames = git(f.local, 'remote');
      expect(resolveBase({}, { cwd: f.local, env: {}, log: () => {} }).commit).toBe(f.common);
      expect(refs(f.local)).toBe(before);
      expect(git(f.local, 'remote')).toBe(remoteNames);
    } finally { cleanup(f); }
  });
  it('deepens a shallow fork branch while keeping its tracking refs unchanged', () => {
    const f = fixture();
    try {
      const fork = path.join(f.dir, 'fork.git'), shallow = path.join(f.dir, 'shallow');
      git(f.dir, 'clone', '-q', '--bare', f.local, fork);
      git(f.dir, 'clone', '-q', '--depth=1', 'file://' + fork, shallow);
      expect(git(shallow, 'rev-parse', '--is-shallow-repository')).toBe('true');
      const before = refs(shallow);
      const result = resolveBase({ upstream: f.upstream }, { cwd: shallow, env: {}, log: () => {} });
      expect(result.commit).toBe(f.common);
      expect(refs(shallow)).toBe(before);
      expect(git(shallow, 'diff', '--name-only', result.commit, 'HEAD')).toBe('feature-only');
    } finally { cleanup(f); }
  });
  it('fetches past the first shallow window when upstream advanced far beyond the fork', () => {
    const f = fixture();
    try {
      for (let i = 0; i < 80; i++) git(f.seed, 'commit', '--allow-empty', '-qm', 'advance-' + i);
      git(f.seed, 'push', '-q', f.upstream, 'main');
      const fork = path.join(f.dir, 'fork.git'), shallow = path.join(f.dir, 'shallow');
      git(f.dir, 'clone', '-q', '--bare', f.local, fork);
      git(f.dir, 'clone', '-q', '--depth=1', 'file://' + fork, shallow);
      const before = refs(shallow);
      const result = resolveBase({ upstream: 'file://' + f.upstream }, { cwd: shallow, env: {}, log: () => {} });
      expect(result.commit).toBe(f.common);
      expect(refs(shallow)).toBe(before);
    } finally { cleanup(f); }
  });
  it('fails offline with --base guidance and lets an explicit base work without fetching', () => {
    const f = fixture();
    try {
      const missing = path.join(f.dir, 'missing.git');
      const before = refs(f.local);
      expect(() => resolveBase({ upstream: missing }, { cwd: f.local, env: {}, log: () => {} }))
        .toThrow(/connectivity\/configuration.*--base REV.*offline/);
      const explicit = resolveBase({ base: f.common, upstream: missing }, { cwd: f.local, env: {}, log: () => {} });
      expect(explicit.commit).toBe(f.common);
      expect(refs(f.local)).toBe(before);
    } finally { cleanup(f); }
  });
  it('uses complete local ancestry after advertising the current upstream tip', () => {
    const f = fixture();
    try {
      git(f.local, 'fetch', '--no-tags', '--refmap=', f.upstream, 'main');
      fs.writeFileSync(path.join(f.local, '.git/FETCH_HEAD'), 'sentinel');
      const before = refs(f.local);
      expect(resolveBase({ upstream: f.upstream }, { cwd: f.local, env: {}, log: () => {} }).commit).toBe(f.common);
      expect(refs(f.local)).toBe(before);
      expect(fs.readFileSync(path.join(f.local, '.git/FETCH_HEAD'), 'utf8')).toBe('sentinel');
    } finally { cleanup(f); }
  });
  it('keeps existing tags even when the checkout enables automatic pruning', () => {
    const f = fixture();
    try {
      git(f.local, 'tag', 'local-only-tag', f.common);
      git(f.local, 'config', 'fetch.prune', 'true');
      git(f.local, 'config', 'fetch.pruneTags', 'true');
      const before = refs(f.local);
      expect(resolveBase({ upstream: f.upstream }, { cwd: f.local, env: {}, log: () => {} }).commit).toBe(f.common);
      expect(refs(f.local)).toBe(before);
      expect(git(f.local, 'tag')).toBe('local-only-tag');
    } finally { cleanup(f); }
  });
  it('refuses unrelated history rather than selecting the upstream tip', () => {
    const f = fixture();
    try {
      const other = path.join(f.dir, 'other'); fs.mkdirSync(other);
      git(other, 'init', '-q'); git(other, 'symbolic-ref', 'HEAD', 'refs/heads/main');
      git(other, 'config', 'user.name', 'Test'); git(other, 'config', 'user.email', 'test@example.invalid');
      fs.writeFileSync(path.join(other, 'x'), 'unrelated'); git(other, 'add', '.'); git(other, 'commit', '-qm', 'unrelated');
      expect(() => resolveBase({ upstream: other }, { cwd: f.local, env: {}, log: () => {} }))
        .toThrow(/complete common ancestor.*--base REV/);
    } finally { cleanup(f); }
  });
});


it('names a missing explicit base reference', () => {
  const f = fixture();
  try {
    expect(() => resolveBase({ base: 'missing-reference' }, { cwd: f.local, log: () => {} }))
      .toThrow(/missing-reference/);
  } finally { cleanup(f); }
});
