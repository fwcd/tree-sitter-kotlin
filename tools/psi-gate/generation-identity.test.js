import {it, expect} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync, spawnSync} from 'child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const build = require('../../bindings/node/build');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: 'pipe'});
it('rejects committed grammar-only changes on first install and in both gate commands', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-generation-')), root = path.join(dir, 'repo');
  try {
    git(dir, 'clone', '--quiet', '--shared', ROOT, root);
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    const file = path.join(root, 'grammar.js'), before = fs.readFileSync(file, 'utf8');
    expect(before).toContain("field('consequence'");
    fs.writeFileSync(file, before.replaceAll("field('consequence'", "field('generation_regression'"));
    git(root, 'add', 'grammar.js'); git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      'commit', '-qm', 'Committed grammar-only change');
    expect(git(root, 'status', '--porcelain').trim()).toBe('');
    expect(fs.existsSync(path.join(root, 'build/node-binding-source.json'))).toBe(false);
    const java = path.join(dir, 'java');
    fs.writeFileSync(java, '#!/usr/bin/env node\nconsole.error(\'openjdk version "17.0.1"\');\n'); fs.chmodSync(java, 0o755);
    for (const args of [['run', 'install'], ['run', 'psi-gate', '--', 'quick'], ['run', 'psi-gate', '--', 'full']]) {
      const result = spawnSync('npm', args, {cwd: root, encoding: 'utf8', timeout: 30000,
        env: {...process.env, PSI_JAVA: java}});
      expect(result.status, result.stdout + result.stderr).toBe(args[1] === 'install' ? 1 : 3);
      expect(result.stdout + result.stderr).toMatch(/Generated parser does not match.*npm run generate/);
    }
    fs.writeFileSync(file, before + '\n// correctly generated source change\n');
    await build.generate(root); await build.install(root);
    expect(build.fresh(root)).toBe(true);
    const result = spawnSync('npm', ['run', 'psi-gate', '--', 'quick'], {cwd: root, encoding: 'utf8', timeout: 30000,
      env: {...process.env, PSI_JAVA: '/unavailable-java'}});
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally { fs.rmSync(dir, {recursive: true}); }
}, 180000);
it('detects changed generated outputs and generator pins, not only grammar.js', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-generated-files-'));
  try {
    fs.mkdirSync(path.join(dir, 'bindings/node'), {recursive: true}); fs.mkdirSync(path.join(dir, 'src'));
    for (const file of ['grammar.js', 'package.json', 'bindings/node/generation.json',
      'src/parser.c', 'src/grammar.json', 'src/node-types.json']) fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    expect(() => build.assertGenerated(dir)).not.toThrow();
    fs.appendFileSync(path.join(dir, 'src/parser.c'), '\n// changed output\n');
    expect(() => build.assertGenerated(dir)).toThrow(/npm run generate/);
    fs.copyFileSync(path.join(ROOT, 'src/parser.c'), path.join(dir, 'src/parser.c'));
    const file = path.join(dir, 'bindings/node/generation.json'), value = JSON.parse(fs.readFileSync(file));
    value.generatorVersion = '0.0.0'; fs.writeFileSync(file, JSON.stringify(value));
    expect(() => build.assertGenerated(dir)).toThrow(/pinned generator/);
  } finally { fs.rmSync(dir, {recursive: true}); }
});
