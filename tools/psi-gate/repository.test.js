import { it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
const { inspectRepository, indexFiles, selectFiles, fetchRepositories } = require('./repository');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-repo-v2-')), root = path.join(dir, 'source');
  fs.mkdirSync(root); git(root, 'init', '-q'); git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(root, 'a.kt'), 'val a=1\n');
  fs.writeFileSync(path.join(root, 'excluded.kt'), 'val e=1\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'pin');
  return { dir, root, rev: git(root, 'rev-parse', 'HEAD') };
}
it('ignores untracked files and lists only indexed includes/excludes', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'untracked.kt'), 'val =');
    expect(inspectRepository(f.root, f.rev).commit).toBe(f.rev);
    expect(indexFiles(f.root)).toEqual(['a.kt', 'excluded.kt']);
    expect(selectFiles(f.root, { excludes: ['excluded.kt'] })).toMatchObject({ files: ['a.kt'], excluded: ['excluded.kt'] });
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
it('fails any modified or staged tracked file with its filename, and refuses the wrong pin', () => {
  const f = fixture();
  try {
    expect(() => inspectRepository(f.root, '0'.repeat(40))).toThrow(/differs/);
    fs.writeFileSync(path.join(f.root, 'a.kt'), 'val a=2\n');
    expect(() => inspectRepository(f.root)).toThrow(/a.kt/);
    git(f.root, 'add', 'a.kt');
    expect(() => inspectRepository(f.root)).toThrow(/a.kt/);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
it('acquires multiple pinned repositories and verifies cached dirty state', async () => {
  const f = fixture();
  try {
    const repo = { url: f.root, rev: f.rev, includes: ['**/*.kt'], excludes: [] };
    const home = path.join(f.dir, 'cache');
    const [a, b] = await fetchRepositories([{ ...repo, name: 'a' }, { ...repo, name: 'b' }], home);
    expect(a.commit).toBe(f.rev); expect(b.commit).toBe(f.rev); expect(a.root).not.toBe(b.root);
    fs.writeFileSync(path.join(a.root, 'a.kt'), 'val broken=');
    await expect(fetchRepositories([{ ...repo, name: 'a' }], home)).rejects.toThrow(/a.kt/);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
}, 30000);
