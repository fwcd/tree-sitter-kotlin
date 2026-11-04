/**
 * Downloads the Kotlin 2.4.21 PSI parser and its runtime dependencies from
 * Maven Central into `tools/psi-oracle/lib/`, verifying each jar against a
 * pinned SHA-256. A jar already present with the right hash is kept.
 *
 * The set is the runtime closure of `kotlin-compiler-embeddable:2.4.21` as its
 * POM declares it; the compiler jar bundles the IntelliJ core it needs.
 *
 * @module psi-oracle/fetch
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { run } = require('../safety');
const path = require('path');
const os = require('os');
const CACHE_DIR =
  process.env.PSI_ORACLE_CACHE || path.join(os.homedir(), '.cache', 'kotlin-psi-oracle');

const MAVEN = 'https://repo.maven.apache.org/maven2';
const LIB_DIR = path.join(__dirname, 'lib');

/** Pinned artifacts: group, artifact, version, SHA-256 of the jar. */
const JARS = [
  [
    'org.jetbrains.kotlin',
    'kotlin-compiler-embeddable',
    '2.4.21',
    'ef19419c765e7ac8404465fa026ca8fc4dbb8a822de0fc79aa53c8dce29f1d02',
  ],
  [
    'org.jetbrains.kotlin',
    'kotlin-stdlib',
    '2.4.21',
    'bd8250210584cb659847dce9cda660f8e9906e5def7fbebcea93dc6dcb6a88a3',
  ],
  [
    'org.jetbrains.kotlin',
    'kotlin-script-runtime',
    '2.4.21',
    'a658cf5902a1525a06c264a5e42b437e97a6679ddeef8ca641246f270cf6a013',
  ],
  [
    'org.jetbrains.kotlin',
    'kotlin-reflect',
    '1.6.10',
    '3277ac102ae17aad10a55abec75ff5696c8d109790396434b496e75087854203',
  ],
  [
    'org.jetbrains.kotlin',
    'kotlin-daemon-embeddable',
    '2.4.21',
    '7b3ef24674e5bcffcadfc4e43202ea314194939ecbcdd90a4770b2f1b04e0d07',
  ],
  [
    'org.jetbrains.kotlin',
    'kotlin-build-tools-api',
    '2.4.21',
    'c5cd6a49bd072b529ae10809111c16a7aa0f92147e95d288354017fd65799461',
  ],
  [
    'org.jetbrains.kotlinx',
    'kotlinx-coroutines-core-jvm',
    '1.8.0',
    '9860906a1937490bf5f3b06d2f0e10ef451e65b95b269f22daf68a3d1f5065c5',
  ],
  [
    'org.jetbrains',
    'annotations',
    '13.0',
    'ace2a10dc8e2d5fd34925ecac03e4988b2c0f851650c94b8cef49ba1bd111478',
  ],
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function download(url) {
  // curl honors standard proxy settings on supported development platforms.
  const proxy =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.npm_config_https_proxy ||
    process.env.npm_config_proxy;
  const env = { ...process.env, ...(proxy ? { https_proxy: proxy } : {}) };
  try {
    return run(
      'curl',
      [
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--max-time',
        '120',
        '--retry',
        '2',
        '--retry-delay',
        '2',
        '--retry-max-time',
        '60',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        url,
      ],
      { encoding: null, timeout: 125000, env },
    );
  } catch (error) {
    throw new Error(
      `${error.message}. Check HTTPS_PROXY/npm proxy settings; for HTTP429 wait and retry, or use a verified PSI_ORACLE_CACHE.`,
    );
  }
}

/** @returns {string[]} Absolute paths of the pinned jars, in classpath order. */
function jarPaths() {
  return JARS.map(([, artifact, version]) => path.join(LIB_DIR, `${artifact}-${version}.jar`));
}

/** Never put an unverified cached jar on the classpath. */
function isFetched() {
  return jarPaths().every(
    (file, i) => fs.existsSync(file) && fs.statSync(file).isFile() && sha256(file) === JARS[i][3],
  );
}

async function fetchAll({ log = console.error, downloadJar = download } = {}) {
  fs.mkdirSync(LIB_DIR, { recursive: true });
  for (const [group, artifact, version, expected] of JARS) {
    const file = path.join(LIB_DIR, `${artifact}-${version}.jar`);
    if (fs.existsSync(file) && sha256(file) === expected) continue;
    const cached = path.join(CACHE_DIR, `${artifact}-${version}.jar`);
    if (fs.existsSync(cached) && sha256(cached) === expected) {
      fs.copyFileSync(cached, file);
      continue;
    }
    const url = `${MAVEN}/${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
    log(`fetching ${url}`);
    const bytes = await downloadJar(url);
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected) {
      throw new Error(`${artifact}-${version}.jar: SHA-256 ${actual}, expected ${expected}`);
    }
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    fs.renameSync(temporary, file);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cachedTemporary = `${cached}.${process.pid}.tmp`;
    fs.writeFileSync(cachedTemporary, bytes, { flag: 'wx' });
    fs.renameSync(cachedTemporary, cached);
  }
  return jarPaths();
}

module.exports = { JARS, LIB_DIR, fetchAll, isFetched, jarPaths };

if (require.main === module) {
  fetchAll().then(
    (files) => console.log(`${files.length} jars verified in ${LIB_DIR}`),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
