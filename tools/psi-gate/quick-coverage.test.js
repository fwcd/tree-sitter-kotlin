import {it, expect} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync} from 'child_process';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const {measure} = require('./quick-coverage');
it('rejects incomplete oracle coverage before constructing a native parser', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-coverage-'));
  try {
    execFileSync('git', ['init', '--quiet', dir]);
    const file = 'tools/psi-gate/corpus/a.kt';fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), 'val a=1\n');execFileSync('git', ['-C', dir, 'add', file]);
    await expect(measure({root: dir, out: path.join(dir, 'out'), oracle: async () => []})).rejects.toThrow(/Incomplete/);
  } finally { fs.rmSync(dir, {recursive: true}); }
});
let available = false;
try { available = require('../psi-oracle/fetch').isFetched() && Boolean(require('../safety').javaExecutable()); } catch {}
it.skipIf(!available)('measures live verified must-match sources as type/context sets', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-live-coverage-'));
  try {
    const result = await measure({root: ROOT, out});
    expect(result.sources.length).toBe(require('./quick').inventory(ROOT).files.length);
    expect(result.views.all.summary.nativeTypes).toBeGreaterThan(80);
    expect(result.views.all.summary.psiComposites).toBeGreaterThan(76);
    expect(result.views.all.summary.nativePairs).toBeGreaterThan(0);
    expect(result.views.all.summary.psiPairs).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(path.join(out, 'coverage.json'))).sources).toHaveLength(result.sources.length);
  } finally { fs.rmSync(out, {recursive: true}); }
}, 30000);
