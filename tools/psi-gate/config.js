'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('smol-toml');
const ROOT = path.resolve(__dirname, '../..');
const HASH = /^[a-f0-9]{64}$/i, REV = /^[a-f0-9]{40}$/i;
function keys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a table`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} key: ${key}`);
}
function strings(value, fallback, label) {
  value ??= fallback;
  if (!Array.isArray(value) || value.some(x => typeof x !== 'string' || !x ||
      path.isAbsolute(x) || x.includes('\\') || x.split('/').includes('..')))
    throw new Error(`${label} must contain relative POSIX globs`);
  return value;
}
function validate(data, filename = path.join(ROOT, 'psigate.toml')) {
  keys(data, ['kotlin-psi', 'repo'], 'config');
  const psi = data['kotlin-psi'];
  keys(psi, ['version', 'jars', 'helper'], 'kotlin-psi');
  if (typeof psi.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-.\w]*)$/.test(psi.version))
    throw new Error('kotlin-psi.version requires an exact version');
  keys(psi.helper, ['version', 'sha256'], 'helper');
  if (typeof psi.helper.version !== 'string' || !/^[\w.-]+$/.test(psi.helper.version) || !HASH.test(psi.helper.sha256 || ''))
    throw new Error('helper requires version and sha256 pins');
  if (!Array.isArray(psi.jars) || !psi.jars.length) throw new Error('kotlin-psi.jars requires coordinate/sha256 pins');
  const seen = new Set();
  const jars = psi.jars.map(jar => {
    keys(jar, ['coordinate', 'sha256'], 'jar');
    if (typeof jar.coordinate !== 'string' || !/^[\w.-]+:[\w.-]+:[\w.-]+$/.test(jar.coordinate) || !HASH.test(jar.sha256 || ''))
      throw new Error('Each jar requires an exact coordinate and sha256');
    const [group, artifact, version] = jar.coordinate.split(':');
    if (seen.has(artifact)) throw new Error(`Duplicate jar name: ${artifact}`);
    seen.add(artifact);
    return { ...jar, group, artifact, version };
  });
  if (!jars.some(jar => jar.artifact === 'kotlin-compiler-embeddable' && jar.version === psi.version))
    throw new Error('kotlin-psi.version must match the pinned compiler jar');
  if (data.repo !== undefined && !Array.isArray(data.repo)) throw new Error('repo must be an array of tables');
  const names = new Set();
  const repos = (data.repo || []).map(repo => {
    keys(repo, ['name', 'url', 'rev', 'includes', 'excludes'], 'repo');
    if (typeof repo.name !== 'string' || !/^[\w.-]+$/.test(repo.name)) throw new Error('repo requires a simple name');
    if (names.has(repo.name)) throw new Error(`Duplicate repo name: ${repo.name}`);
    names.add(repo.name);
    if (typeof repo.url !== 'string' || !repo.url || repo.url.startsWith('-') || /[\r\n\0]/.test(repo.url) || !REV.test(repo.rev || ''))
      throw new Error(`repo ${repo.name} requires url and full commit rev`);
    const includes = strings(repo.includes, ['**/*.kt', '**/*.kts'], 'includes');
    if (!includes.length) throw new Error(`repo ${repo.name} has empty includes`);
    return { ...repo, includes, excludes: strings(repo.excludes, [], 'excludes') };
  });
  return { filename: path.resolve(filename), root: ROOT, psi: { ...psi, jars }, repos };
}
function loadConfig(filename = path.join(ROOT, 'psigate.toml')) {
  return validate(parse(fs.readFileSync(filename, 'utf8')), filename);
}
function helperPath(config = loadConfig()) {
  const psi = config.psi || config;
  return path.join(ROOT, 'tools/psi-oracle/helpers', `psi-oracle-${psi.helper.version}.jar`);
}
module.exports = { loadConfig, validate, helperPath };
