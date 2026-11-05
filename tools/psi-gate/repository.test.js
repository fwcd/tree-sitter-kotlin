import { it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url);
const { argumentsOf } = require('./main');
const { inspectRepository, snapshotRepository, annotateReport } = require('./repository');
const { sha256 } = require('../safety');
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-repository-')), root = path.join(dir, 'repo');
  fs.mkdirSync(root); git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/main.kt'), 'fun f() {}\n');
  fs.writeFileSync(path.join(root, 'build.kts'), 'println("build")\n');
  fs.writeFileSync(path.join(root, 'marked.kt'), 'val x = <caret>1\n');
  fs.writeFileSync(path.join(root, 'cases.json'), '{"this is ordinary repository data":true}\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'pinned input');
  return { dir, root, home: path.join(dir, 'home'), commit: git(root, 'rev-parse', 'HEAD') };
}
it('parses the first-class repo folder job and rejects missing/replaced folders', () => {
  expect(argumentsOf(['repo', '/tmp/example'])).toMatchObject({ command: 'repo', repoRoot: '/tmp/example', corpora: ['repo'] });
  expect(() => argumentsOf(['repo'])).toThrow(/folder/);
  expect(() => argumentsOf(['repo', '/tmp/example', '--corpora', 'snippets'])).toThrow(/cannot replace/);
  expect(() => argumentsOf(['repo', '/tmp/example', '--home', '/tmp/example/cache'])).toThrow(/must be separate/);
});
it('rejects missing/non-Git repositories and dirty tracked or untracked Kotlin inputs', () => {
  const f = fixture();
  try {
    expect(() => inspectRepository(path.join(f.dir, 'missing'))).toThrow(/missing/);
    expect(() => inspectRepository(f.dir)).toThrow(/Git checkout/);
    fs.writeFileSync(path.join(f.root, 'src/main.kt'), 'val changed=1');
    expect(() => inspectRepository(f.root)).toThrow(/uncommitted changes/);
    fs.writeFileSync(path.join(f.root, 'src/main.kt'), 'fun f() {}\n');
    fs.writeFileSync(path.join(f.root, 'new.kt'), 'val x=1');
    expect(() => inspectRepository(f.root)).toThrow(/untracked Kotlin/);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
it('snapshots exact tracked bytes without editing the checkout or importing cases.json', () => {
  const f = fixture();
  try {
    const before = git(f.root, 'status', '--porcelain');
    const snapshot = snapshotRepository(f.root, f.home);
    expect(snapshot.repository).toMatchObject({ commit: f.commit, files: 2, markupExcluded: ['marked.kt'] });
    expect(fs.readFileSync(path.join(snapshot.root, 'src/main.kt'), 'utf8')).toBe('fun f() {}\n');
    expect(fs.existsSync(path.join(snapshot.root, 'cases.json'))).toBe(false);
    expect(fs.readFileSync(path.join(snapshot.root, '.source-revision'), 'utf8').trim()).toBe(f.commit);
    expect(git(f.root, 'status', '--porcelain')).toBe(before);
    expect(snapshotRepository(f.root, f.home).root).toBe(snapshot.root);
    const report = path.join(f.dir, 'run');fs.mkdirSync(report);
    fs.writeFileSync(path.join(report, 'report.md'), '# PSI comparison\n\nPASS\n');
    fs.writeFileSync(path.join(report, 'meta.json'), JSON.stringify({ files: 2, identity: { context: { inputs: snapshot.repository.inputHash } } }));
    annotateReport(report, snapshot.repository);
    expect(fs.readFileSync(path.join(report, 'report.md'), 'utf8')).toContain(f.commit);
    expect(JSON.parse(fs.readFileSync(path.join(report, 'meta.json'))).repository.inputHash).toBe(snapshot.repository.inputHash);
    fs.writeFileSync(path.join(snapshot.root, 'src/main.kt'), 'corrupt');
    expect(() => snapshotRepository(f.root, f.home)).toThrow(/cache is corrupt/);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
it('records a new commit/content identity when input changes are committed', () => {
  const f = fixture();
  try {
    const old = snapshotRepository(f.root, f.home);
    fs.writeFileSync(path.join(f.root, 'src/main.kt'), 'fun f() { println(1) }\n');
    git(f.root, 'add', '.');git(f.root, 'commit', '-qm', 'change input');
    const next = snapshotRepository(f.root, f.home);
    expect(next.repository.commit).not.toBe(old.repository.commit);
    expect(next.repository.inputHash).not.toBe(old.repository.inputHash);
    expect(next.root).not.toBe(old.root);
    const files = fs.readFileSync(next.extra[1], 'utf8').trim().split('\n');
    const digest = sha256(JSON.stringify(files.map(file => ({ path: file, sha256: sha256(fs.readFileSync(path.join(next.root, file))) }))));
    expect(digest).toBe(next.repository.inputHash);
  } finally { fs.rmSync(f.dir, { recursive: true }); }
});
