import { it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
const { inspectRepository, indexFiles, selectFiles, fetchRepositories, runGit } = require('./repository');
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
    const logs = [];
    const [a, b] = await fetchRepositories([{ ...repo, name: 'a' }, { ...repo, name: 'b' }], home, {log: line => logs.push(line)});
    expect(logs.some(line => line.includes('fetching '))).toBe(true);
    expect(logs.some(line => line.includes('2 selected, 0 excluded') && line.includes(f.rev))).toBe(true);
    logs.length = 0;
    await fetchRepositories([{ ...repo, name: 'b' }], home, {log: line => logs.push(line)});
    expect(logs.some(line => line.includes('checking cached checkout'))).toBe(true);
    expect(a.commit).toBe(f.rev); expect(b.commit).toBe(f.rev); expect(a.root).not.toBe(b.root);
    fs.writeFileSync(path.join(a.root, 'a.kt'), 'val broken=');
    await expect(fetchRepositories([{ ...repo, name: 'a' }], home)).rejects.toThrow(/a.kt/);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
}, 30000);

it('recovers an incomplete cache on retry while preserving untracked files', async () => {
  const f = fixture();
  try {
    const repo={url:f.root,rev:f.rev,name:'partial',includes:['**/*.kt'],excludes:[]};
    const home=path.join(f.dir,'home'),cache=path.join(home,'repos','partial-'+require('../safety').sha256(repo.url+'\0'+repo.rev).slice(0,16));
    fs.mkdirSync(cache,{recursive:true});git(cache,'init','-q');fs.writeFileSync(path.join(cache,'keep.txt'),'untracked work');
    const logs=[];const [result]=await fetchRepositories([repo],home,{log:text=>logs.push(text)});
    expect(result.commit).toBe(f.rev);expect(result.files).toEqual(['a.kt','excluded.kt']);
    expect(fs.readFileSync(path.join(cache,'keep.txt'),'utf8')).toBe('untracked work');
    expect(logs.join(' ')).toContain('resuming incomplete');
  } finally {fs.rmSync(f.dir,{recursive:true});}
});
it('refuses indexed work in incomplete caches and gives a concrete fresh-home command', async () => {
  const f=fixture();
  try {
    const repo={url:f.root,rev:f.rev,name:'dirty-partial'},home=path.join(f.dir,'home');
    const cache=path.join(home,'repos',repo.name+'-'+require('../safety').sha256(repo.url+'\0'+repo.rev).slice(0,16));
    fs.mkdirSync(cache,{recursive:true});git(cache,'init','-q');fs.writeFileSync(path.join(cache,'own.kt'),'val userWork=1');git(cache,'add','own.kt');
    await expect(fetchRepositories([repo],home)).rejects.toThrow(/indexed work.*recovery refused[\s\S]*full --home/);
    expect(fs.readFileSync(path.join(cache,'own.kt'),'utf8')).toBe('val userWork=1');
  } finally {fs.rmSync(f.dir,{recursive:true});}
});
it('keeps a Git fetch timeout typed with its actual limit', async () => {
  const f=fixture();
  try {
    const dir=path.join(f.dir,'fetch');fs.mkdirSync(dir);git(dir,'init','-q');
    const upload=path.join(f.dir,'slow-upload');fs.writeFileSync(upload,'#!/bin/sh\nsleep 2\n');fs.chmodSync(upload,0o755);
    await expect(runGit(['fetch','--upload-pack='+upload,f.root,f.rev],dir,150))
      .rejects.toMatchObject({code:'PSI_GIT_TIMEOUT',exitCode:2,message:'Git fetch timed out after 150 ms'});
  } finally {fs.rmSync(f.dir,{recursive:true});}
});
