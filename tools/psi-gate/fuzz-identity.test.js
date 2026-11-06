import { it, expect } from 'vitest';
import { createRequire, Module } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
require('./fuzz');
const { comparisonIdentity } = require('./fuzz-state');

it('invalidates identity for a new reachable sibling and its JSON asset only', () => {
  const directory = fs.mkdtempSync(path.join(import.meta.dirname, '.identity-test-'));
  const entry = require.cache[require.resolve('./fuzz')];
  const helperFile = path.join(directory, 'new-helper.js'), assetFile = path.join(directory, 'asset.json');
  const helper = new Module(helperFile), asset = new Module(assetFile);
  helper.filename = helperFile; asset.filename = assetFile; helper.children.push(asset);
  try {
    const original = comparisonIdentity();
    fs.writeFileSync(helperFile, 'module.exports = 1;\n');
    fs.writeFileSync(assetFile, '{"value":1}\n');
    expect(comparisonIdentity()).toBe(original);
    entry.children.push(helper);
    const linked = comparisonIdentity();
    expect(linked).not.toBe(original);
    fs.writeFileSync(assetFile, '{"value":2}\n');
    expect(comparisonIdentity()).not.toBe(linked);
    entry.children.splice(entry.children.indexOf(helper), 1);
    expect(comparisonIdentity()).toBe(original);
  } finally {
    const index = entry.children.indexOf(helper);
    if (index >= 0) entry.children.splice(index, 1);
    fs.rmSync(directory, { recursive: true });
  }
});
