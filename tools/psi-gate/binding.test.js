import {it, expect, beforeAll, afterAll} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const build = require('../../bindings/node/build');
const ROOT = path.resolve(import.meta.dirname, '../..');
let dir, root;
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-binding-')); root = path.join(dir, 'grammar'); fs.mkdirSync(root);
  for (const name of ['src', 'bindings']) fs.cpSync(path.join(ROOT, name), path.join(root, name), {recursive: true});
  for (const name of ['grammar.js', 'binding.gyp', 'package.json']) fs.copyFileSync(path.join(ROOT, name), path.join(root, name));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await build.install(root);
}, 180000);
afterAll(() => { if (dir) fs.rmSync(dir, {recursive: true}); });
it('requires a receipt matching actual source and loaded addon bytes', () => {
  expect(build.fresh(root)).toBe(true);
  const file = path.join(root, 'build/node-binding-source.json'), bytes = fs.readFileSync(file);
  fs.writeFileSync(file, '{}'); expect(() => build.assertFresh(root)).toThrow(/npm install/);
  fs.writeFileSync(file, bytes);
  const addon = path.join(root, JSON.parse(bytes).binary.path), binary = fs.readFileSync(addon);
  fs.appendFileSync(addon, 'changed'); expect(() => build.assertFresh(root)).toThrow(/stale or changed/);
  fs.writeFileSync(addon, binary); expect(build.fresh(root)).toBe(true);
});
it('ordinary install rebuilds changed scanner sources instead of reusing a loadable addon', async () => {
  require('./runtime').createParser(root);
  const file = path.join(root, 'src/scanner.c'); fs.appendFileSync(file, '\n// freshness control\n');
  expect(() => build.assertFresh(root)).toThrow(/npm install/);
  await build.install(root); expect(build.fresh(root)).toBe(true);
  expect(() => require('./runtime').createParser(root)).toThrow(/start a new npm run psi-gate/);
}, 180000);
it('requires generation before certifying a grammar.js edit as built', () => {
  fs.appendFileSync(path.join(root, 'grammar.js'), '\n// grammar change control\n');
  expect(() => build.assertFresh(root)).toThrow(/npm run generate/);
  expect(() => build.install(root)).toThrow(/run npm run generate/);
});
