import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isFetched } = require('./fetch');
const { runOracle } = require('./oracle');
const { verifyCorpus, DEFAULT_CORPUS } = require('./verify');

const hasJava = (() => {
  try { require('child_process').execFileSync('java', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();
const MISSING = 'PSI oracle jars or java missing; run npm run psi-oracle:fetch';

describe.skipIf(!isFetched() || !hasJava)('PSI oracle', () => {
  it('reports Kotlin 2.4.21 verdicts and offsets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-oracle-test-'));
    try {
      fs.writeFileSync(path.join(root, 'reserved.kt'), 'val typeof = 1\n');
      fs.writeFileSync(path.join(root, 'selector.kt'), 'fun f() { x.this }\n');
      fs.writeFileSync(path.join(root, 'script.kts'), 'fun a() {} @A fun b() {}\n');
      const out = path.join(root, 'out');
      const [reserved, selector, script] = runOracle(['reserved.kt', 'selector.kt', 'script.kts'], { root, out });
      expect(reserved).toMatchObject({ path: 'reserved.kt', psiErrors: 1, firstError: { offset: 4, line: 1, column: 5 } });
      expect(selector).toMatchObject({ psiErrors: 0, firstError: null });
      expect(script.psiErrors).toBe(0);
      const dump = fs.readFileSync(path.join(out, selector.dump), 'utf8');
      expect(dump).toMatch(/^KtFile: selector\.kt\n/);
      expect(dump).toContain('THIS_EXPRESSION');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60000);

  it.skipIf(!fs.existsSync(path.join(DEFAULT_CORPUS, 'corpus.json')))('reproduces a sample of the pinned goldens', () => {
    const report = verifyCorpus(DEFAULT_CORPUS, { sample: 25 });
    expect(report.mismatches).toEqual([]);
    expect(report.total).toBeGreaterThan(20);
  }, 60000);
});

describe.skipIf(isFetched() && hasJava)('PSI oracle (unavailable)', () => {
  it.skip(MISSING, () => {});
});
