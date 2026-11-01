#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { runIfMain } = require('./cli');
const { SOURCE_ROOTS, METADATA_FILE, goldenHasPsiError, verifyGoldenFormat, preprocessSource } = require('./psi-fixture-sources');
const { buildManifest, writeManifest } = require('./cross-validation/manifest');
const { contextExclusion, exclusionPaths, requiredContextIds } = require('./psi-fixture-context');

const CROSS_VALIDATION_DIR = path.join(__dirname, 'cross-validation');
const FIXTURES_DIR = path.join(CROSS_VALIDATION_DIR, 'fixtures');
const VERSION_FILE = path.join(CROSS_VALIDATION_DIR, '.fixtures-version');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function git(args, cwd, options = {}) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 180000,
    maxBuffer: 512 * 1024 * 1024, ...options });
}

function listFilesRecursive(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  function walk(relative) {
    for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  walk('');
  return files.sort();
}

function copyFiles(src, destination, extensions = ['.kt', '.kts'], goldenExt = '.txt', options = {}) {
  if (!Array.isArray(extensions)) extensions = [extensions];
  const { namespace = '', suite = 'psi', upstreamRoot = '', profile = 'identity' } = options;
  const files = listFilesRecursive(src), present = new Set(files);
  const stats = { matchedPairs: 0, pairs: 0, files: 0, rejected: [], contextExclusions: [], sources: {},
    unpairedSources: [], skippedGoldens: 0, collisions: [], dirs: 0 };
  const directories = new Set(), basenames = new Map();
  for (const source of files) {
    const extension = path.posix.extname(source);
    if (!extensions.includes(extension)) continue;
    const stem = source.slice(0, -extension.length), golden = stem + goldenExt;
    if (!present.has(golden)) { stats.unpairedSources.push(source); continue; }
    stats.matchedPairs++;
    const raw = fs.readFileSync(path.join(src, source));
    const psi = fs.readFileSync(path.join(src, golden));
    verifyGoldenFormat(psi.toString('utf8'), path.posix.basename(source));
    const id = namespace ? `${namespace}/${stem}` : stem;
    const descriptor = { suite, sourcePath: `${upstreamRoot}/${source}`, goldenPath: `${upstreamRoot}/${golden}`,
      extension, parseKind: extension === '.kts' ? 'script' : 'file', profile,
      sourceSha256: sha256(raw), goldenSha256: sha256(psi) };
    const excluded = contextExclusion(id, descriptor, raw, psi);
    if (excluded) {
      const paths = exclusionPaths(excluded, destination);
      fs.mkdirSync(path.dirname(paths.ktFile), { recursive: true });
      fs.writeFileSync(paths.ktFile, raw); fs.writeFileSync(paths.psiFile, psi);
      stats.contextExclusions.push(excluded);
      continue;
    }
    if (goldenHasPsiError(psi.toString('utf8'))) {
      stats.rejected.push({ id, ...descriptor, reason: 'PsiErrorElement' });
      continue;
    }
    if (stats.sources[id] || fs.existsSync(path.join(destination, id + '.kt'))
        || fs.existsSync(path.join(destination, id + '.kts'))) throw new Error(`Ambiguous fixture ID: ${id}`);
    const processed = Buffer.from(preprocessSource(raw.toString('utf8'), profile));
    descriptor.vendoredSha256 = sha256(processed);
    stats.sources[id] = descriptor;
    const outputStem = path.join(destination, ...id.split('/'));
    fs.mkdirSync(path.dirname(outputStem), { recursive: true });
    fs.writeFileSync(outputStem + extension, processed);
    fs.writeFileSync(outputStem + goldenExt, psi);
    stats.pairs++; stats.files += 2;
    directories.add(path.posix.dirname(id));
    const basename = path.posix.basename(id);
    if (!basenames.has(basename)) basenames.set(basename, []);
    basenames.get(basename).push(id);
  }
  stats.skippedGoldens = files.filter(file => file.endsWith(goldenExt)).length - stats.matchedPairs;
  stats.dirs = [...directories].filter(dir => dir !== '.').length;
  stats.collisions = [...basenames].filter(([, ids]) => ids.length > 1).map(([basename, paths]) => ({ basename, paths }));
  return stats;
}

function checkoutSourceRoots(commit, sourceRepo, source) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('The PSI fixture pin must be a full commit SHA');
  if (sourceRepo) {
    const actual = git(['rev-parse', `${commit}^{commit}`], sourceRepo).trim();
    if (actual !== commit) throw new Error('Local source checkout does not contain the pinned commit');
    const archive = git(['archive', '--format=tar', commit, ...SOURCE_ROOTS.map(root => root.path)], sourceRepo, { encoding: null });
    execFileSync('tar', ['-x', '-C', source], { input: archive });
  } else {
    git(['init'], source);
    git(['remote', 'add', 'origin', 'https://github.com/JetBrains/kotlin.git'], source);
    git(['sparse-checkout', 'init', '--cone'], source);
    git(['sparse-checkout', 'set', ...SOURCE_ROOTS.map(root => root.path)], source);
    git(['fetch', '--depth=1', 'origin', commit], source);
    git(['checkout', 'FETCH_HEAD'], source);
  }
}

/**
 * Every paired input of the pinned roots, PSI-clean or not, as the PSI oracle's
 * golden corpus. The inputs are preprocessed as the importer does; the goldens
 * are the upstream bytes. The comparison fixtures are not touched.
 *
 * @returns {Array<{ id: string, source: string, golden: string, psiError: boolean }>}
 *   Paths relative to `destination`.
 */
function exportOracleCorpus(sourceDir, destination) {
  const entries = [];
  for (const root of SOURCE_ROOTS) {
    const base = path.join(sourceDir, root.path);
    const files = listFilesRecursive(base), present = new Set(files);
    for (const file of files) {
      const extension = path.posix.extname(file);
      if (!root.extensions.includes(extension)) continue;
      const stem = file.slice(0, -extension.length);
      if (!present.has(stem + '.txt')) continue;
      const id = root.namespace ? `${root.namespace}/${stem}` : stem;
      const golden = fs.readFileSync(path.join(base, stem + '.txt'), 'utf8');
      verifyGoldenFormat(golden, path.posix.basename(file));
      const raw = fs.readFileSync(path.join(base, file), 'utf8');
      const text = preprocessSource(raw, root.profile);
      // A spec test expecting a compiler exception never compares its golden.
      const expectsException = root.profile === 'spec-info-v1' && /^ \* EXCEPTION:/m.test(raw);
      const outputStem = path.join(destination, ...id.split('/'));
      fs.mkdirSync(path.dirname(outputStem), { recursive: true });
      fs.writeFileSync(outputStem + extension, text);
      fs.writeFileSync(outputStem + '.txt', golden);
      entries.push({ id, source: id + extension, golden: id + '.txt', psiError: goldenHasPsiError(golden),
        ...(expectsException ? { expectsException: true } : {}) });
    }
  }
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  fs.writeFileSync(path.join(destination, 'corpus.json'), JSON.stringify(entries, null, 2) + '\n');
  return entries;
}

function vendorOracleCorpus({ commit, sourceRepo, destination }) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kotlin-psi-'));
  try {
    const source = path.join(temporary, 'source'); fs.mkdirSync(source);
    checkoutSourceRoots(commit, sourceRepo, source);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    return exportOracleCorpus(source, destination);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function vendor({ commit, sourceRepo, fixturesDir = FIXTURES_DIR }) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('The PSI fixture pin must be a full commit SHA');
  fs.mkdirSync(path.dirname(fixturesDir), { recursive: true });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kotlin-psi-'));
  const staging = fs.mkdtempSync(path.join(path.dirname(fixturesDir), '.fixtures-stage-'));
  let installed = false;
  try {
    const source = path.join(temporary, 'source'); fs.mkdirSync(source);
    checkoutSourceRoots(commit, sourceRepo, source);
    const metadata = { schemaVersion: 2, commit, psiValidOnly: true, sourceRoots: [], sources: {}, rejected: [], contextExclusions: [] };
    for (const root of SOURCE_ROOTS) {
      const stats = copyFiles(path.join(source, root.path), staging, root.extensions, '.txt',
        { ...root, upstreamRoot: root.path });
      if (!stats.matchedPairs || !stats.pairs) throw new Error(`No positive PSI pairs under ${root.path} at ${commit}`);
      Object.assign(metadata.sources, stats.sources); metadata.rejected.push(...stats.rejected);
      metadata.contextExclusions.push(...stats.contextExclusions);
      metadata.sourceRoots.push({ ...root, paired: stats.matchedPairs, imported: stats.pairs,
        rejectedPsiInvalid: stats.rejected.length, excludedContext: stats.contextExclusions.length, unpairedSources: stats.unpairedSources,
        skippedOtherGoldens: stats.skippedGoldens });
    }
    const sorted = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    metadata.sources = Object.fromEntries(Object.entries(metadata.sources).sort(([a], [b]) => sorted(a, b)));
    metadata.rejected.sort((a, b) => sorted(a.id, b.id));
    metadata.contextExclusions.sort((a, b) => sorted(a.id, b.id));
    if (JSON.stringify(metadata.contextExclusions.map(record => record.id)) !== JSON.stringify(requiredContextIds(SOURCE_ROOTS))) {
      throw new Error('Required fixture policy inputs disappeared; review the context policy for this pin');
    }
    fs.writeFileSync(path.join(staging, METADATA_FILE), JSON.stringify(metadata, null, 2) + '\n');
    let backup;
    if (fs.existsSync(fixturesDir)) {
      const backups = path.resolve(CROSS_VALIDATION_DIR, '../../build/fixture-import-backups');
      fs.mkdirSync(backups, { recursive: true });
      backup = path.join(backups, `${Date.now()}-${process.pid}`);
      fs.renameSync(fixturesDir, backup);
    }
    try { fs.renameSync(staging, fixturesDir); installed = true; }
    catch (error) { if (backup) fs.renameSync(backup, fixturesDir); throw error; }
    if (fixturesDir === FIXTURES_DIR) {
      fs.writeFileSync(VERSION_FILE, commit + '\n');
      writeManifest(buildManifest(fixturesDir));
    }
    return metadata;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (!installed) fs.rmSync(staging, { recursive: true, force: true });
  }
}

function main(args) {
  let commit = fs.readFileSync(VERSION_FILE, 'utf8').trim(), sourceRepo, oracleCorpus;
  while (args.length) {
    const value = args.shift();
    if (value === '--source-repo' && args.length) sourceRepo = path.resolve(args.shift());
    else if (value === '--oracle-corpus' && args.length) oracleCorpus = path.resolve(args.shift());
    else if (!value.startsWith('-')) commit = value;
    else throw new Error('Usage: vendor-fixtures [COMMIT] [--source-repo KOTLIN_CHECKOUT] [--oracle-corpus DIR]');
  }
  if (oracleCorpus) {
    const entries = vendorOracleCorpus({ commit, sourceRepo, destination: oracleCorpus });
    const psiError = entries.filter(entry => entry.psiError).length;
    console.log(JSON.stringify({ commit, oracleCorpus, pairs: entries.length, psiError, psiClean: entries.length - psiError }));
    return;
  }
  const report = vendor({ commit, sourceRepo });
  console.log(JSON.stringify({ commit, positivePairs: Object.keys(report.sources).length,
    positiveInventoryPairs: Object.keys(report.sources).length + report.contextExclusions.length,
    excludedContext: report.contextExclusions.map(record => ({ id: record.id, policy: record.policy, reason: record.reason })),
    rejectedPsiInvalid: report.rejected.length, sources: report.sourceRoots }, null, 2));
}

runIfMain(module, main);
module.exports = { vendor, vendorOracleCorpus, exportOracleCorpus, copyFiles, listFilesRecursive };
