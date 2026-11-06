import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '../..');
const { withHome } = require('./home');
const state = require('./state');
const { fingerprint, main: extract } = require('./corpus');
const temporary = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psi-r2-'));
const invoke = (script, args, env = {}) =>
  spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, ...env },
  });
const output = (result) => result.stdout + result.stderr;

describe('corpus semantics and baseline claims', () => {
  it('keeps generated JetBrains :error inputs PSI-positive', () => {
    const dir = temporary();
    try {
      const source = path.join(dir, 'source');
      fs.mkdirSync(path.join(source, 'jetbrains'), { recursive: true });
      fs.writeFileSync(
        path.join(source, 'jetbrains/Case.txt'),
        '===\nKnown grammar gap\n:error\n===\nval x=1\n---\n',
      );
      const out = path.join(dir, 'out');
      extract([source, out]);
      const claims = JSON.parse(fs.readFileSync(path.join(out, 'cases.json'), 'utf8'));
      const claim = Object.values(claims)[0];
      expect(claim).toMatchObject({ error: true, psiClean: true });
      const row = {
        path: 'a.kt',
        sha256: claim.inputSha256,
        psiErrors: 0,
        claim,
        results: {
          base: { verdict: 'A', hasError: true, treeHash: 'x' },
          head: { verdict: 'A', hasError: true, treeHash: 'x' },
        },
      };
      expect(state.gate([row], 'head', { base: 'base', baseClaims: claims }).failures).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
  it('reports old genuine discrepancies separately but fails a new claim', () => {
    const claim = {
      file: 'case.txt',
      name: 'Positive case',
      inputSha256: 'old',
      error: false,
      psiClean: true,
    };
    const row = {
      path: 'a.kt',
      sha256: 'old',
      psiErrors: 1,
      claim,
      results: {
        base: { verdict: 'B', hasError: false, treeHash: 'x' },
        head: { verdict: 'B', hasError: false, treeHash: 'x' },
      },
    };
    const baseline = { a: claim };
    const result = state.gate([row], 'head', { base: 'base', baseClaims: baseline });
    expect(result.failures).toEqual([]);
    expect(result.existingClaims).toHaveLength(1);
    row.claim = { ...claim, inputSha256: 'new' };
    row.sha256 = 'new';
    expect(fingerprint(row.claim)).not.toBe(fingerprint(claim));
    expect(state.gate([row], 'head', { base: 'base', baseClaims: baseline }).failures[0].kind).toBe(
      'corpus-claim',
    );
  });
});

describe('safety and actionable CLI failures', () => {
  it('preserves an unowned oracle export directory before any extraction', () => {
    const dir = temporary();
    try {
      fs.writeFileSync(path.join(dir, 'keep.txt'), 'sentinel');
      const result = invoke('tools/vendor-fixtures.js', [
        '--source-repo',
        '/nonexistent-source',
        '--oracle-corpus',
        dir,
      ]);
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/unmarked output/);
      expect(output(result)).not.toMatch(/\n\s+at /);
      expect(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('sentinel');
      const link = path.join(dir, 'linked-output');
      fs.symlinkSync(dir, link, 'dir');
      const linked = invoke('tools/vendor-fixtures.js', [
        '--source-repo',
        '/nonexistent-source',
        '--oracle-corpus',
        link,
      ]);
      expect(linked.status).toBe(1);
      expect(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('sentinel');
      const debug = invoke(
        'tools/vendor-fixtures.js',
        ['--source-repo', '/nonexistent-source', '--oracle-corpus', dir],
        { PSI_DEBUG: '1' },
      );
      expect(output(debug)).toMatch(/\n\s+at /);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
  it('checks home ownership before Java or installation', () => {
    const dir = temporary();
    try {
      fs.writeFileSync(path.join(dir, 'keep.txt'), 'sentinel');
      const result = invoke('tools/psi-gate/main.js', ['quick', '--home', dir], {
        PSI_JAVA: '/missing-java',
      });
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/not an owned PSI cache/);
      expect(output(result)).not.toMatch(/Installing/);
      expect(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('sentinel');
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
  it('locks one home and releases the lock on failure', async () => {
    const dir = temporary();
    let release;
    try {
      const first = withHome(
        dir,
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      await expect(withHome(dir, () => {})).rejects.toThrow(/Another PSI run/);
      release();
      await first;
      await expect(
        withHome(dir, () => {
          throw new Error('failure');
        }),
      ).rejects.toThrow('failure');
      expect(fs.existsSync(path.join(dir, '.run.lock'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
  it('has minimizer help and rejects invalid limits before reading a run', () => {
    const help = invoke('tools/cross-validation/minimize.js', ['--help']);
    expect(help.status).toBe(0);
    expect(output(help)).toMatch(/--failing/);
    for (const limit of ['NaN', '0', '-1']) {
      const result = invoke('tools/cross-validation/minimize.js', [
        '--run',
        'missing',
        '--limit',
        limit,
      ]);
      expect(result.status).toBe(1);
      expect(output(result)).toMatch(/--limit must be an integer/);
    }
  });
});

it('reclaims the lock of a SIGKILLed owner', async () => {
  const { spawn } = require('child_process');
  const dir = temporary();
  const module = path.join(ROOT, 'tools/psi-gate/home.js');
  const child = spawn(process.execPath, [
    '-e',
    "require(process.argv[1]).withHome(process.argv[2],()=>new Promise(()=>{console.log('ready');setInterval(()=>{},1000)}))",
    module,
    dir,
  ]);
  try {
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
    });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
    expect(fs.existsSync(path.join(dir, '.run.lock'))).toBe(true);
    await withHome(dir, () => {});
    expect(fs.existsSync(path.join(dir, '.run.lock'))).toBe(false);
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true });
  }
});
it('rejects snapshots and historical grammar selection in the v2 launcher', () => {
  const { argumentsOf } = require('./main');
  for (const flag of ['--expected', '--base', '--upstream'])
    expect(() => argumentsOf(['quick', flag, 'snapshot.json'])).toThrow(/removed/);
});
