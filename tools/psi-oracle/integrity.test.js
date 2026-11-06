import { it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
it('refuses cached/downloaded hash mismatches before executing Java', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-integrity-'));
  const oracleDir = path.join(dir, 'tools/psi-oracle');
  fs.mkdirSync(oracleDir, { recursive: true });
  for (const file of ['fetch.js', 'oracle.js'])
    fs.copyFileSync(path.join(import.meta.dirname, file), path.join(oracleDir, file));
  fs.copyFileSync(
    path.join(import.meta.dirname, '../safety.js'),
    path.join(dir, 'tools/safety.js'),
  );
  fs.mkdirSync(path.join(dir, 'tools/psi-gate'));
  fs.copyFileSync(path.join(import.meta.dirname, '../psi-gate/config.js'), path.join(dir, 'tools/psi-gate/config.js'));
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../psigate.toml'), path.join(dir, 'psigate.toml'));
  fs.cpSync(path.join(import.meta.dirname, 'helpers'), path.join(oracleDir, 'helpers'), { recursive: true });
  fs.symlinkSync(path.resolve(import.meta.dirname, '../../node_modules'), path.join(dir, 'node_modules'), 'dir');
  fs.copyFileSync(path.join(import.meta.dirname, '../resource.js'), path.join(dir, 'tools/resource.js'));
  const previousCache = process.env.PSI_ORACLE_CACHE;
  process.env.PSI_ORACLE_CACHE = path.join(dir, 'cache');
  const { jarPaths, isFetched, fetchAll } = require(path.join(oracleDir, 'fetch'));
  const { runOracle } = require(path.join(oracleDir, 'oracle'));
  fs.mkdirSync(path.join(oracleDir, 'lib'));
  for (const file of jarPaths()) fs.writeFileSync(file, 'invalid cached jar');
  fs.writeFileSync(path.join(dir, 'a.kt'), 'val x=1');
  try {
    expect(isFetched()).toBe(false);
    expect(() => runOracle(['a.kt'], { root: dir, out: path.join(dir, 'out') })).toThrow(/pins are missing or corrupt/);
    await expect(
      fetchAll({ log: () => {}, downloadJar: () => Buffer.from('invalid downloaded jar') }),
    ).rejects.toThrow(/SHA-256/);
    await expect(fetchAll({log: () => {}, downloadJar: () => { throw Error('injected connection failure'); }}))
      .rejects.toThrow(/Kotlin jar download failed for org.jetbrains.kotlin:kotlin-compiler-embeddable:2.4.21 \(https:\/\/repo.maven.apache.org/);
    vi.stubGlobal('fetch', async () => { throw new Error('Request was cancelled.'); });
    try {
      await expect(fetchAll({log: () => {}})).rejects.toThrow(/Request was cancelled\. Check HTTPS_PROXY/);
    } finally { vi.unstubAllGlobals(); }
    expect(fs.readFileSync(jarPaths()[0], 'utf8')).toBe('invalid cached jar');
  } finally {
    if (previousCache === undefined) delete process.env.PSI_ORACLE_CACHE;
    else process.env.PSI_ORACLE_CACHE = previousCache;
    fs.rmSync(dir, { recursive: true });
  }
});
