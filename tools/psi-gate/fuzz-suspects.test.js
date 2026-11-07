import {it, expect, beforeAll, afterAll, vi} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const require = createRequire(import.meta.url), ROOT = path.resolve(import.meta.dirname, '../..');
const fuzz = require('./fuzz'), add = require('./add'), quick = require('./quick');
const config = require('./config').loadConfig();
let directory, variant;
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-suspect-test-'));
  const setup = require('./test-prerequisites').variantBuild(ROOT);
  if (setup.missing.length) throw Error(setup.missing.join(', '));
  variant = path.join(directory, 'hidden-class'); fs.mkdirSync(variant);
  for (const name of ['src', 'bindings']) fs.cpSync(path.join(ROOT, name), path.join(variant, name), {recursive: true});
  for (const name of ['package.json', 'binding.gyp']) fs.copyFileSync(path.join(ROOT, name), path.join(variant, name));
  fs.mkdirSync(path.join(variant, 'node_modules'));
  for (const name of ['node-addon-api', 'node-gyp-build'])
    fs.cpSync(setup.dependencies[name], path.join(variant, 'node_modules', name), {recursive: true});
  const file = path.join(variant, 'src/parser.c'), text = fs.readFileSync(file, 'utf8');
  const needle = '[sym_class_declaration] = {\n    .visible = true,';
  if (!text.includes(needle)) throw Error('No native class marker');
  fs.writeFileSync(file, text.replace(needle, '[sym_class_declaration] = {\n    .visible = false,'));
  execFileSync(process.execPath, [setup.nodeGyp, 'rebuild'], {cwd: variant, timeout: 120000, stdio: 'pipe'});
}, 180000);
afterAll(() => {if (directory) fs.rmSync(directory, {recursive: true});});

it('emits reverified suspect paths/sidecars/index for a real broken grammar without corpus writes', async () => {
  const source = path.join(directory, 'seed'); fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'a.kt'), 'class Broken\n');
  const tracked = execFileSync('git', ['-C', ROOT, 'diff', 'HEAD', '--', 'tools/psi-gate/corpus', 'tools/psi-gate/grammar-bugs']);
  const result = await fuzz.run({...fuzz.argumentsOf([]), root: ROOT, config, grammar: variant, runtime: ROOT,
    fixtures: source, maxInputs: 1, maxSeconds: 40, minSeconds: 10, out: path.join(directory, 'suspects')});
  expect(result.exitCode).toBe(0); expect(result.files.length).toBeGreaterThan(0);
  const index = JSON.parse(fs.readFileSync(result.indexPath));
  expect(index.files).toEqual(result.files);
  expect(index.oracle).toEqual(require('./expectations').oracleIdentity(config));
  for (const finding of result.files) {
    expect(path.isAbsolute(finding.file)).toBe(true); expect(fs.existsSync(finding.file)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(finding.sidecar));
    expect(sidecar).toMatchObject({reverified: true, psiErrors: 0, reduction: {complete: true},
      oracleRef: 'index.json#/oracle', compilationChecked: false});
    expect(sidecar).not.toHaveProperty('oracle');
    const [file, pointer] = sidecar.oracleRef.split('#');
    expect(JSON.parse(fs.readFileSync(path.resolve(path.dirname(finding.sidecar), file)))[pointer.slice(1)])
      .toEqual(index.oracle);
    expect(sidecar).not.toHaveProperty('note');
    expect(sidecar.noteRef).toBe('index.json#/syntaxNote');
    expect(index.syntaxNote).toContain('compilation and type checking were not run');
    expect(sidecar).not.toHaveProperty('kind'); expect(sidecar).not.toHaveProperty('verdict');
  }
  expect(execFileSync('git', ['-C', ROOT, 'diff', 'HEAD', '--', 'tools/psi-gate/corpus', 'tools/psi-gate/grammar-bugs']))
    .toEqual(tracked);
}, 60000);
it('dedupes an exact known problem and refuses search output targeting committed corpus', async () => {
  const source = path.join(directory, 'known-seed'); fs.mkdirSync(source);
  const file = 'catalog-empty-quest-span.kt';
  fs.copyFileSync(path.join(ROOT, 'tools/psi-gate/grammar-bugs', file), path.join(source, file));
  const result = await fuzz.run({...fuzz.argumentsOf([]), root: ROOT, config, fixtures: source, maxInputs: 1,
    maxSeconds: 40, minSeconds: 10, out: path.join(directory, 'known-out')});
  expect(result.files).toEqual([]); expect(result.suppressed.length).toBeGreaterThan(0);
  await expect(fuzz.run({...fuzz.argumentsOf([]), config, out: path.join(ROOT, quick.CORPUS), maxInputs: 1}))
    .rejects.toThrow(/must be separate/);
}, 60000);
function repository() {
  const root = path.join(directory, 'repo');
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', ROOT, root], {stdio: 'pipe'});
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.cpSync(path.join(ROOT, 'build'), path.join(root, 'build'), {recursive: true}); return root;
}
it('adds one selected matching case, stages source/reference and leaves quick green; rejects failures', async () => {
  const root = repository(), source = path.join(directory, 'selected.kt');
  fs.writeFileSync(source, 'fun selectedForCorpus()=12345\n');
  let result;
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  const progress = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    result = await add.run({file: source, root, config});
    const text = output.mock.calls.flat().join('\n');
    expect(text).toContain('Added: ' + result.file);
    expect(text).toContain('PSI expectation: ' + result.expectation);
    const guidance = progress.mock.calls.flat().join('\n');
    expect(guidance).toContain('Both files are staged.');
    expect(guidance).toContain('regenerate-expectations');
    expect(guidance).toContain(`git add -- '${result.file}' '${result.expectation}'`);
  } finally { output.mockRestore(); progress.mockRestore(); }
  expect(result).toMatchObject({exitCode: 0, duplicate: false, staged: true});
  const indexed = execFileSync('git', ['-C', root, 'ls-files', '--', result.file, result.expectation], {encoding: 'utf8'});
  expect(indexed.trim().split('\n')).toHaveLength(2);
  const checked = await quick.run({root, config, home: path.join(directory, 'quick')});
  expect(checked.exitCode).toBe(0);
  expect(await add.run({file: source, root, config})).toMatchObject({duplicate: true,
    file: result.file, expectation: result.expectation});
  const before = execFileSync('git', ['-C', root, 'ls-files', '-s']);
  fs.writeFileSync(source, 'val ref=String? ::plus\n');
  await expect(add.run({file: source, root, config})).rejects.toThrow(/still differs/);
  expect(execFileSync('git', ['-C', root, 'ls-files', '-s'])).toEqual(before);
}, 60000);
it('rejects changed/unverified suspect sidecars before admission', async () => {
  const file = path.join(directory, 'stale.kt'); fs.writeFileSync(file, 'val x=1\n');
  fs.writeFileSync(file + '.json', JSON.stringify({schemaVersion: 1, sourceSha256: '0'.repeat(64),
    reverified: true, psiErrors: 0, reduction: {complete: true}}));
  await expect(add.run({file, config})).rejects.toThrow(/Stale or unverified/);
});
