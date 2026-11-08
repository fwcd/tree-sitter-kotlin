import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const state = require('./state');
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psi-runtime-'));
  it('identifies runtime source and binary bytes, not just package version', () => {
    const dir = root(),
      sdk = path.join(dir, 'node_modules/tree-sitter');
    fs.mkdirSync(path.join(sdk, 'build/Release'), { recursive: true });
    fs.writeFileSync(
      path.join(sdk, 'package.json'),
      JSON.stringify({ name: 'tree-sitter', version: '0.25.1', main: 'index.js' }),
    );
    fs.writeFileSync(path.join(sdk, 'index.js'), 'first');
    fs.writeFileSync(path.join(sdk, 'build/Release/runtime.node'), 'binary');
    try {
      const first = state.runtimeIdentity(dir);
      fs.writeFileSync(path.join(sdk, 'index.js'), 'changed');
      expect(state.runtimeIdentity(dir)).not.toBe(first);
      const second = state.runtimeIdentity(dir);
      fs.writeFileSync(path.join(sdk, 'build/Release/runtime.node'), 'other binary');
      expect(state.runtimeIdentity(dir)).not.toBe(second);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
