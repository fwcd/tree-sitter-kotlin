'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { loadConfig, helperPath } = require('../psi-gate/config');
const CACHE_DIR = process.env.PSI_ORACLE_CACHE || path.join(os.homedir(), '.cache/kotlin-psi-oracle');
const LIB_DIR = path.join(__dirname, 'lib');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function jarPaths(config = loadConfig()) {
  return (config.psi || config).jars.map(jar => path.join(LIB_DIR, `${jar.artifact}-${jar.version}.jar`));
}
function verifyHelper(config = loadConfig()) {
  const file = helperPath(config);
  if (!fs.existsSync(file) || digest(fs.readFileSync(file)) !== (config.psi || config).helper.sha256.toLowerCase())
    throw new Error(`Oracle helper ${(config.psi || config).helper.version} is missing or its SHA-256 differs from psigate.toml`);
  return file;
}
function isFetched(config = loadConfig()) {
  try { verifyHelper(config); } catch { return false; }
  return jarPaths(config).every((file, i) => fs.existsSync(file) &&
    digest(fs.readFileSync(file)) === (config.psi || config).jars[i].sha256.toLowerCase());
}
async function download(url) {
  let dispatcher;
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.npm_config_https_proxy || process.env.npm_config_proxy;
  if (proxy) dispatcher = new (require('undici').ProxyAgent)(proxy);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let current = url;
        for (let redirects = 0; redirects < 6; redirects++) {
          if (new URL(current).protocol !== 'https:') throw new Error('Oracle downloads require HTTPS');
          const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(120000), dispatcher });
          if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
            current = new URL(response.headers.get('location'), current).href; continue;
          }
          if (!response.ok) throw new Error(`Oracle download HTTP ${response.status}`);
          return Buffer.from(await response.arrayBuffer());
        }
        throw new Error('Too many oracle download redirects');
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  } finally { await dispatcher?.close(); }
}
async function fetchAll({ config = loadConfig(), log = console.error, downloadJar = download } = {}) {
  verifyHelper(config);
  fs.mkdirSync(LIB_DIR, { recursive: true });
  await Promise.all((config.psi || config).jars.map(async jar => {
    const name = `${jar.artifact}-${jar.version}.jar`, file = path.join(LIB_DIR, name), expected = jar.sha256.toLowerCase();
    if (fs.existsSync(file) && digest(fs.readFileSync(file)) === expected) return;
    const cached = path.join(CACHE_DIR, name);
    if (fs.existsSync(cached) && digest(fs.readFileSync(cached)) === expected) { fs.copyFileSync(cached, file); return; }
    const url = `https://repo.maven.apache.org/maven2/${jar.group.replace(/\./g, '/')}/${jar.artifact}/${jar.version}/${name}`;
    log(`Fetching ${jar.coordinate}`);
    const bytes = await downloadJar(url);
    if (digest(bytes) !== expected) throw new Error(`SHA-256 mismatch for ${jar.coordinate}`);
    const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, file);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cacheTemporary = `${cached}.${process.pid}.tmp`; fs.writeFileSync(cacheTemporary, bytes); fs.renameSync(cacheTemporary, cached);
  }));
  return jarPaths(config);
}
module.exports = { LIB_DIR, CACHE_DIR, fetchAll, isFetched, jarPaths, verifyHelper };
Object.defineProperty(module.exports, 'JARS', { get: () => loadConfig().psi.jars.map(j =>
  [j.group, j.artifact, j.version, j.sha256]) });
if (require.main === module) fetchAll().then(files => console.log(`${files.length} pinned jars verified`), error => {
  console.error(error.message); process.exitCode = 1;
});
