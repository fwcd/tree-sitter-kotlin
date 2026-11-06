import {it, expect, beforeAll, afterAll} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const require = createRequire(import.meta.url);
const quick = require('./quick');
const expectations = require('./expectations');
const ROOT = path.resolve(import.meta.dirname, '../..');
const relative = 'tools/psi-gate/corpus/catalog-constructor.kt';
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, expectations.filename(relative)), 'utf8'));
const config = {psi: fixture.oracle};
let directory, parser, broken;
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {stdio: ['ignore', 'pipe', 'pipe']});
function repository() {
  const root = fs.mkdtempSync(path.join(directory, 'repo-')); git(root, 'init', '--quiet');
  fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
  for (const file of [relative, expectations.filename(relative)]) fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
  git(root, 'add', relative, expectations.filename(relative)); return root;
}
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-quick-')); parser = quick.nativeParser(ROOT);
  const setup = require('./test-prerequisites').variantBuild(ROOT);
  if (setup.missing.length) throw Error('Quick regression build prerequisites: ' + setup.missing.join(', '));
  const root = path.join(directory, 'hidden-class'); fs.mkdirSync(root);
  for (const name of ['src', 'bindings']) fs.cpSync(path.join(ROOT, name), path.join(root, name), {recursive: true});
  for (const name of ['package.json', 'binding.gyp']) fs.copyFileSync(path.join(ROOT, name), path.join(root, name));
  fs.mkdirSync(path.join(root, 'node_modules'));
  for (const name of ['node-addon-api', 'node-gyp-build'])
    fs.cpSync(setup.dependencies[name], path.join(root, 'node_modules', name), {recursive: true});
  const file = path.join(root, 'src/parser.c'), text = fs.readFileSync(file, 'utf8');
  const needle = '[sym_class_declaration] = {\n    .visible = true,';
  if (!text.includes(needle)) throw Error('Missing native class visibility marker');
  fs.writeFileSync(file, text.replace(needle, '[sym_class_declaration] = {\n    .visible = false,'));
  execFileSync(process.execPath, [setup.nodeGyp, 'rebuild'], {cwd: root, timeout: 120000, stdio: 'pipe'});
  broken = require('../cross-validation/diff-execute').loadParsers([{label: 'broken', root}], ROOT)[0].parser;
}, 180000);
afterAll(() => { if (directory) fs.rmSync(directory, {recursive: true}); });

it('checks indexed must-match fixtures and ignores an untracked new source', async () => {
  const root = repository();
  fs.writeFileSync(path.join(root, quick.CORPUS, 'untracked.kt'), 'not valid Kotlin');
  const result = await quick.run({root, config, parser, home: path.join(root, 'report')});
  expect(result.exitCode).toBe(0); expect(result.counts.selected).toBe(1);
  git(root, 'add', quick.CORPUS + '/untracked.kt');
  const staged = await quick.run({root, config, parser, home: path.join(root, 'report')});
  expect(staged.exitCode).toBe(1); expect(staged.counts.selected).toBe(2);
  expect(staged.rows.find(row => row.path.endsWith('/untracked.kt')).error).toContain('not in the Git index');
});
it('uses current unstaged working-tree content, without a clean-check prerequisite', async () => {
  const root = repository();
  fs.appendFileSync(path.join(root, relative), 'val changed=1\n');
  const result = await quick.run({root, config, parser, home: path.join(root, 'report')});
  expect(result.exitCode).toBe(1); expect(result.rows[0].error).toContain('Stale PSI source identity');
});
it('rejects stale oracle and comparison identities', async () => {
  const root = repository();
  const changed = {psi: {...config.psi, helper: {...config.psi.helper, version: 'changed'}}};
  expect((await quick.run({root, config: changed, parser, home: path.join(root, 'report')})).rows[0].error)
    .toContain('Stale PSI oracle identity');
  const file = path.join(root, expectations.filename(relative)), data = JSON.parse(fs.readFileSync(file));
  data.normalization.digest = '0'.repeat(64); fs.writeFileSync(file, JSON.stringify(data));
  expect((await quick.run({root, config, parser, home: path.join(root, 'report')})).rows[0].error)
    .toContain('Stale normalization identity');
});
it('rejects a real rebuilt grammar that drops the snippet class node', async () => {
  const root = repository();
  expect((await quick.run({root, config, parser, home: path.join(root, 'report')})).exitCode).toBe(0);
  const result = await quick.run({root, config, parser: broken, home: path.join(root, 'report')});
  expect(result.exitCode).toBe(1); expect(result.rows[0].verdict).toBe('C');
});
it('runs with invalid Java paths and does not load the oracle or downloader', () => {
  const root = repository(), program = `
    const q=require(${JSON.stringify(path.join(ROOT, 'tools/psi-gate/quick'))});
    q.run({root:${JSON.stringify(root)},config:${JSON.stringify(config)},parser:q.nativeParser(${JSON.stringify(ROOT)}),
      home:${JSON.stringify(path.join(root, 'report'))}}).then(r=>{
      if(r.exitCode||Object.keys(require.cache).some(p=>p.endsWith('/psi-oracle/oracle.js')||p.endsWith('/psi-oracle/fetch.js')))
        process.exitCode=1;
    }).catch(e=>{console.error(e);process.exitCode=1;});`;
  expect(() => execFileSync(process.execPath, ['-e', program], {cwd: ROOT,
    env: {...process.env, JAVA: '/nonexistent', JAVA_HOME: '/nonexistent'}, stdio: 'pipe'})).not.toThrow();
});
it('refuses PSI-invalid regeneration before writing any reference', async () => {
  const root = repository(), file = path.join(root, expectations.filename(relative)), original = fs.readFileSync(file);
  const oracle = async (files, options) => {
    fs.mkdirSync(options.out, {recursive: true}); fs.writeFileSync(path.join(options.out, 'bad.psi'), 'KtFile: invalid.kt\n');
    return [{path: files[0], dump: 'bad.psi', psiErrors: 1}];
  };
  await expect(quick.regenerate({root, config, home: path.join(root, 'report'), oracle})).rejects.toThrow('PSI-invalid');
  expect(fs.readFileSync(file)).toEqual(original);
});
