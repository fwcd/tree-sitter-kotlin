import { it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadConfig, validate } = require('./config');
const config = loadConfig();
const data = () => ({ 'kotlin-psi': { version: config.psi.version, helper: { ...config.psi.helper },
  jars: config.psi.jars.map(({ coordinate, sha256 }) => ({ coordinate, sha256 })) },
  repo: config.repos.map(repo => ({ ...repo })) });
it('loads pinned TOML and the two documented Okio exclusions', () => {
  expect(config.psi.jars).toHaveLength(8);
  expect(config.repos[0].rev).toHaveLength(40);
  expect(config.repos[0].excludes).toHaveLength(2);
});
it('rejects unknown keys, missing pins and duplicate repository/jar names', () => {
  const unknown = data(); unknown['known-failures'] = [];
  expect(() => validate(unknown)).toThrow(/Unknown/);
  const missing = data(); delete missing['kotlin-psi'].helper.sha256;
  expect(() => validate(missing)).toThrow(/sha256/);
  const duplicate = data(); duplicate.repo.push(duplicate.repo[0]);
  expect(() => validate(duplicate)).toThrow(/Duplicate repo/);
  const jars = data(); jars['kotlin-psi'].jars.push(jars['kotlin-psi'].jars[0]);
  expect(() => validate(jars)).toThrow(/Duplicate jar/);
});
it('rejects mismatched compiler versions, malformed revs and non-relative glob scopes', () => {
  const version = data(); version['kotlin-psi'].version = '2.4.99';
  expect(() => validate(version)).toThrow(/match/);
  const revision = data(); revision.repo[0].rev = 'main';
  expect(() => validate(revision)).toThrow(/full commit/);
  const scope = data(); scope.repo[0].excludes = ['../file.kt'];
  expect(() => validate(scope)).toThrow(/relative/);
});
