/**
 * Pinned manifest of the vendored JetBrains fixture set.
 *
 * `npm run cross-validate` used to exit 0 against an empty fixtures directory:
 * no fixtures meant no failures meant success. Gating on it bought nothing. The
 * manifest closes that hole by stating up front exactly which fixtures must be
 * present, so a missing, truncated or half-vendored tree is a hard failure
 * rather than a quiet pass.
 *
 * @module manifest
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { FIXTURES_DIR, listFixtureFiles, listFixtureNames, fixturePaths } = require('./fixture-files');

const MANIFEST_PATH = path.join(__dirname, 'fixtures.manifest.json');
const VERSION_FILE = path.join(__dirname, '.fixtures-version');
const SCHEMA_VERSION = 3;
const { METADATA_FILE, goldenHasPsiError, verifyGoldenFormat } = require('../psi-fixture-sources');
const { CONTEXT_EXCLUSIONS_DIR, contextExclusion, exclusionPaths, verifyContextExclusion, requiredContextIds } = require('../psi-fixture-context');

/**
 * @typedef {object} Manifest
 * @property {number} schemaVersion
 * @property {string} fixturesCommit - JetBrains/kotlin commit the set was cut from.
 * @property {number} pairs - Expected number of .kt/.txt fixture pairs.
 * @property {number} files - Expected number of files (2 x pairs).
 * @property {number} subdirectories - Directories below the root holding fixtures.
 * @property {string} contentHash - Digest over every fixture's name and bytes.
 * @property {string[]} fixtures - Every fixture name, sorted.
 */

/**
 * Read the pinned JetBrains commit recorded by the vendoring script.
 * @returns {string} Commit hash, or '' when unknown.
 */
function readFixturesCommit() {
  if (!fs.existsSync(VERSION_FILE)) return '';
  return fs.readFileSync(VERSION_FILE, 'utf-8').trim();
}

/**
 * Digest the fixture set: every name and every byte, in sorted order.
 *
 * Counts alone would not notice a fixture that was silently truncated or
 * re-vendored from a different commit while keeping its name.
 *
 * @param {string[]} names - Fixture names, sorted.
 * @param {string} [dir] - Fixtures root.
 * @returns {string} Hex sha256.
 */
function computeContentHash(names, dir = FIXTURES_DIR) {
  const hash = crypto.createHash('sha256');
  for (const name of names) {
    const { ktFile, psiFile } = fixturePaths(name, dir);
    hash.update(name);
    hash.update('\0');
    for (const file of [ktFile, psiFile]) {
      hash.update(fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0));
      hash.update('\0');
    }
  }
  const metadataPath = path.join(dir, METADATA_FILE);
  const exclusions = fs.existsSync(metadataPath)
    ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')).contextExclusions || [] : [];
  if (exclusions.length) {
    hash.update('fixture-context-exclusions-v1\0');
    for (const record of [...exclusions].sort((a, b) => a.id.localeCompare(b.id))) {
      hash.update(JSON.stringify(record)); hash.update('\0');
      const { ktFile, psiFile } = exclusionPaths(record, dir);
      for (const file of [ktFile, psiFile]) {
        hash.update(fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0)); hash.update('\0');
      }
    }
  }
  return hash.digest('hex');
}

/**
 * Build a manifest describing the fixture tree currently on disk.
 * @param {string} [dir] - Fixtures root.
 * @returns {Manifest}
 */
function buildManifest(dir = FIXTURES_DIR) {
  const names = listFixtureNames(dir);
  const metadataPath = path.join(dir, METADATA_FILE);
  const metadata = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) : null;
  const subdirectories = new Set(
    names.filter(n => n.includes('/')).map(n => n.slice(0, n.lastIndexOf('/'))),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    fixturesCommit: readFixturesCommit(),
    pairs: names.length,
    positiveInventoryPairs: names.length + (metadata?.contextExclusions?.length || 0),
    files: listFixtureFiles('.kt', dir).length + listFixtureFiles('.kts', dir).length + listFixtureFiles('.txt', dir).length,
    subdirectories: subdirectories.size,
    contentHash: computeContentHash(names, dir),
    fixtures: names,
    psiValidOnly: true,
    contextExclusions: metadata?.contextExclusions || [],
    ...(metadata ? { sourceRoots: metadata.sourceRoots, sources: metadata.sources, rejected: metadata.rejected } : {}),
  };
}

/**
 * Load the pinned manifest.
 * @param {string} [manifestPath]
 * @returns {Manifest}
 */
function loadManifest(manifestPath = MANIFEST_PATH) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Fixture manifest not found: ${manifestPath}\n` +
      'Run: npm run vendor-fixtures',
    );
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (![1, 2, SCHEMA_VERSION].includes(manifest.schemaVersion)) {
    throw new Error(
      `Fixture manifest schemaVersion ${manifest.schemaVersion} is not supported ` +
      `(expected ${SCHEMA_VERSION})`,
    );
  }
  return manifest;
}

/**
 * Write a manifest to disk, newline-terminated and stably ordered.
 * @param {Manifest} manifest
 * @param {string} [manifestPath]
 */
function writeManifest(manifest, manifestPath = MANIFEST_PATH) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * Verify the fixture tree on disk against a pinned manifest.
 *
 * Checks, in order of how badly they break a run: the directory exists and is
 * non-empty; every fixture is paired; no fixture file is empty; the set of
 * names matches exactly; and the bytes hash to the pinned digest.
 *
 * @param {Manifest} manifest - Pinned expectations.
 * @param {string} [dir] - Fixtures root.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], actual: object }}
 */
function verifyFixtures(manifest, dir = FIXTURES_DIR) {
  const errors = [];
  const warnings = [];
  if (manifest.schemaVersion >= 2 && manifest.psiValidOnly !== true) errors.push('Positive manifests must select PSI-valid fixtures only');
  const exclusions = manifest.contextExclusions || [];
  if (manifest.schemaVersion >= 3 && manifest.positiveInventoryPairs !== manifest.pairs + exclusions.length) {
    errors.push('Positive inventory must equal compared pairs plus context exclusions');
  }
  if (manifest.schemaVersion >= 3 && manifest.sourceRoots?.length
      && JSON.stringify(exclusions.map(record => record.id).sort()) !== JSON.stringify(requiredContextIds(manifest.sourceRoots))) {
    errors.push('Required fixture policy exclusions are missing or changed');
  }

  if (!fs.existsSync(dir)) {
    return {
      ok: false,
      errors: [`Fixtures directory does not exist: ${dir}. Run: npm run vendor-fixtures`],
      warnings,
      actual: { pairs: 0, files: 0 },
    };
  }

  const ktFiles = [...listFixtureFiles('.kt', dir), ...listFixtureFiles('.kts', dir)];
  const txtFiles = new Set(listFixtureFiles('.txt', dir));
  const names = listFixtureNames(dir);
  const actual = { pairs: names.length, files: ktFiles.length + txtFiles.size };
  if (manifest.schemaVersion >= 3) {
    actual.positiveInventoryPairs = names.length + exclusions.length;
    actual.contextExcluded = exclusions.length;
    if (exclusions.length) warnings.push(`${names.length} grammar comparisons from ${actual.positiveInventoryPairs} retained PSI pairs; ${exclusions.length} audited fixture policy exclusions (${exclusions.map(record => record.id).join(', ')})`);
  }

  if (names.length === 0) {
    return {
      ok: false,
      errors: [`Fixtures directory is empty: ${dir}. Run: npm run vendor-fixtures`],
      warnings,
      actual,
    };
  }

  // Pairing.
  const unpaired = ktFiles.filter(f => !txtFiles.has(f.replace(/\.kts?$/, '.txt')));
  if (unpaired.length > 0) {
    errors.push(
      `${unpaired.length} .kt fixture(s) have no sibling .txt golden: ` +
      `${unpaired.slice(0, 5).join(', ')}${unpaired.length > 5 ? ', …' : ''}`,
    );
  }

  // Non-empty goldens.
  //
  // Only the .txt side is checked. A PSI dump always contains at least a
  // `KtFile:` line, so an empty one means a truncated or failed copy. An empty
  // .kt is legitimate — JetBrains ships `EmptyFile.kt` precisely to test the
  // empty-source case — so flagging it would fail the gate against a correctly
  // vendored tree. Truncation of a .kt is caught by the content hash instead.
  const emptyGoldens = [];
  for (const name of names) {
    const { ktFile, psiFile } = fixturePaths(name, dir);
    if (fs.existsSync(psiFile) && fs.statSync(psiFile).size === 0) {
      emptyGoldens.push(path.relative(dir, psiFile));
    }
    if (manifest.psiValidOnly && fs.existsSync(psiFile)) {
      const golden = fs.readFileSync(psiFile, 'utf8');
      if (goldenHasPsiError(golden)) errors.push(`PSI-invalid fixture in positive set: ${name}`);
      try { verifyGoldenFormat(golden, path.basename(ktFile)); }
      catch (error) { errors.push(error.message); }
      const source = manifest.sources?.[name];
      if (source && fs.existsSync(ktFile)) {
        const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
        if (source.extension !== path.extname(ktFile) || source.vendoredSha256 !== digest(fs.readFileSync(ktFile))
            || source.goldenSha256 !== digest(fs.readFileSync(psiFile))) errors.push(`Fixture provenance mismatch: ${name}`);
        if (manifest.schemaVersion >= 3) {
          try {
            if (contextExclusion(name, source, fs.readFileSync(ktFile), fs.readFileSync(psiFile))) {
              errors.push(`Context-excluded fixture reintroduced into comparison set: ${name}`);
            }
          } catch (error) { errors.push(error.message); }
        }
      }
    }
  }
  if (emptyGoldens.length > 0) {
    errors.push(
      `${emptyGoldens.length} PSI golden(s) are empty: ` +
      `${emptyGoldens.slice(0, 5).join(', ')}${emptyGoldens.length > 5 ? ', …' : ''}`,
    );
  }
  if (manifest.sources) {
    const recorded = Object.keys(manifest.sources).sort();
    if (JSON.stringify(recorded) !== JSON.stringify([...manifest.fixtures].sort())) errors.push('Source provenance does not cover the exact fixture set');
    const metadataPath = path.join(dir, METADATA_FILE);
    if (!fs.existsSync(metadataPath)) errors.push('Fixture import provenance is missing');
    else {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (metadata.commit !== manifest.fixturesCommit || !metadata.psiValidOnly
          || JSON.stringify(metadata.sourceRoots) !== JSON.stringify(manifest.sourceRoots)
          || JSON.stringify(metadata.sources) !== JSON.stringify(manifest.sources)
          || JSON.stringify(metadata.contextExclusions || []) !== JSON.stringify(exclusions)
          || JSON.stringify(metadata.rejected) !== JSON.stringify(manifest.rejected)) errors.push('Fixture import provenance differs from the manifest');
    }
  }

  // Retained context inputs must remain complete, exact and unscored. Their
  // original bytes and the reason/chunk ranges are included in contentHash.
  const contextDir = path.join(dir, CONTEXT_EXCLUSIONS_DIR);
  const excludedIds = new Set();
  const expectedArtifacts = [];
  for (const record of exclusions) {
    if (excludedIds.has(record.id) || names.includes(record.id)) errors.push(`Ambiguous context exclusion: ${record.id}`);
    excludedIds.add(record.id);
    try {
      const { ktFile, psiFile } = verifyContextExclusion(record, dir);
      verifyGoldenFormat(fs.readFileSync(psiFile, 'utf8'), path.basename(ktFile));
      if (goldenHasPsiError(fs.readFileSync(psiFile, 'utf8'))) errors.push(`PSI-invalid context exclusion: ${record.id}`);
      expectedArtifacts.push(path.relative(contextDir, ktFile).split(path.sep).join('/'), path.relative(contextDir, psiFile).split(path.sep).join('/'));
    } catch (error) { errors.push(error.message); }
  }
  const actualArtifacts = [];
  const walkArtifacts = (relative = '') => {
    for (const entry of fs.readdirSync(path.join(contextDir, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walkArtifacts(name); else actualArtifacts.push(name);
    }
  };
  if (fs.existsSync(contextDir)) walkArtifacts();
  if (JSON.stringify(actualArtifacts.sort()) !== JSON.stringify(expectedArtifacts.sort())) {
    errors.push('Retained context fixture artifacts differ from the manifest');
  }

  // Exact set.
  const expected = new Set(manifest.fixtures);
  const present = new Set(names);
  const missing = manifest.fixtures.filter(n => !present.has(n));
  const extra = names.filter(n => !expected.has(n));
  if (missing.length > 0) {
    errors.push(
      `${missing.length} fixture(s) in the manifest are missing from disk: ` +
      `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`,
    );
  }
  if (extra.length > 0) {
    errors.push(
      `${extra.length} fixture(s) on disk are not in the manifest: ` +
      `${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ', …' : ''}`,
    );
  }

  if (names.length !== manifest.pairs) {
    errors.push(`Expected ${manifest.pairs} fixture pairs, found ${names.length}`);
  }

  // Content. Only meaningful once the name sets agree.
  if (missing.length === 0 && extra.length === 0) {
    let contentHash;
    try { contentHash = computeContentHash(names, dir); actual.contentHash = contentHash; }
    catch (error) { errors.push(error.message); }
    if (contentHash && manifest.contentHash && contentHash !== manifest.contentHash) {
      errors.push(
        'Fixture content hash does not match the manifest — the tree was ' +
        're-vendored from a different commit or edited in place ' +
        `(expected ${manifest.contentHash.slice(0, 12)}…, got ${contentHash.slice(0, 12)}…)`,
      );
    }
  }

  const commit = readFixturesCommit();
  if (manifest.fixturesCommit && commit && commit !== manifest.fixturesCommit) {
    warnings.push(
      `.fixtures-version is ${commit.slice(0, 12)}… but the manifest was cut at ` +
      `${manifest.fixturesCommit.slice(0, 12)}…`,
    );
  }

  return { ok: errors.length === 0, errors, warnings, actual };
}

module.exports = {
  MANIFEST_PATH,
  SCHEMA_VERSION,
  buildManifest,
  loadManifest,
  writeManifest,
  verifyFixtures,
  computeContentHash,
  readFixturesCommit,
};
