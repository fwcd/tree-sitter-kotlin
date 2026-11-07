'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');
const {sha256, confined, inside, canonical} = require('../safety');
const {loadConfig} = require('./config');
const {fetchAll} = require('../psi-oracle/fetch');
const {runOracleAsync} = require('../psi-oracle/oracle');
const expected = require('./expectations');
const {inventory, CORPUS} = require('./quick');
const {createParser} = require('./runtime');
const ROOT = path.resolve(__dirname, '../..');
function printAdmission(file, expectation, duplicate) {
  console.log(`${duplicate ? 'Already in corpus' : 'Added'}: ${file}`);
  console.log(`PSI expectation: ${expectation}`);
  if (duplicate) return;
  console.error('Both files are staged. Review them before committing.');
  console.error('After editing the source, refresh its PSI expectation, review the diff, then stage both:');
  console.error('  npm run psi-gate -- regenerate-expectations');
  const quote = value => "'" + value.replace(/'/g, "'\"'\"'") + "'";
  console.error(`  git add -- ${quote(file)} ${quote(expectation)}`);
}

async function run({file, root = ROOT, config = loadConfig(), timeoutMs = 120000, parseTimeoutMs = 10000}) {
  if (!file || !['.kt', '.kts'].includes(path.extname(file))) throw Error('add requires a Kotlin snippet file');
  const bytes = fs.readFileSync(file);
  if (!bytes.length || bytes.length > 1000) throw Error('add expects a nonempty minimized snippet of at most 1000 bytes');
  const sourceSha256 = sha256(bytes), extension = path.extname(file);
  let finding;
  if (fs.existsSync(file + '.json')) {
    finding = JSON.parse(fs.readFileSync(file + '.json', 'utf8'));
    if (finding.schemaVersion !== 1 || finding.sourceSha256 !== sourceSha256 || !finding.reverified ||
        !finding.reduction?.complete || finding.psiErrors !== 0) throw Error('Stale or unverified suspect sidecar');
  }
  await fetchAll({config});
  const relative = CORPUS + '/selected-' + sourceSha256.slice(0, 24) + extension;
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-add-')), input = path.join(stage, path.basename(relative));
  try {
    fs.writeFileSync(input, bytes);
    const out = path.join(stage, 'psi');
    const refs = await runOracleAsync([path.basename(relative)], {root: stage, out, config, timeoutMs});
    if (refs.length !== 1 || refs[0].path !== path.basename(relative)) throw Error('Incomplete add PSI re-verification');
    const dump = fs.readFileSync(confined(out, refs[0].dump), 'utf8');
    const reference = expected.make({relative, bytes, dump, psi: refs[0], config,
      origin: {kind: 'selected-finding', sourceSha256, ...(finding ? {seed: finding.seed, signatures: finding.signatures} : {})}});
    const parser = createParser(root, parseTimeoutMs);
    const result = expected.compare({text: expected.textOf(bytes), parser, expected: reference, timeoutMs: parseTimeoutMs});
    if (result.verdict !== 'ok') throw Error('Snippet still differs from PSI; fix it or retain it in the grammar-bug ledger');
    if (sha256(fs.readFileSync(file)) !== sourceSha256) throw Error('Suspect source changed during re-verification');
    const existing = inventory(root);
    for (const candidate of existing.files) {
      const content = fs.readFileSync(confined(root, candidate));
      if (path.extname(candidate) !== extension || sha256(content) !== sourceSha256) continue;
      const stored = expected.read({root, relative: candidate, config, indexed: existing.indexed, bytes: content});
      if (expected.compare({text: expected.textOf(content), parser, expected: stored, timeoutMs: parseTimeoutMs}).verdict !== 'ok')
        throw Error('Existing corpus duplicate is not a valid must-match assertion');
      const expectation = expected.filename(candidate);
      printAdmission(candidate, expectation, true);
      return {exitCode: 0, duplicate: true, file: candidate, expectation};
    }
    const destination = path.join(root, relative), sidecar = expected.filename(relative);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    if (!inside(canonical(root), canonical(path.dirname(destination)))) throw Error('Corpus directory escapes repository');
    const created = [];
    try {
      // Exclusive creation protects both reviewed files and untracked work.
      fs.writeFileSync(destination, bytes, {flag: 'wx'}); created.push(destination);
      fs.writeFileSync(path.join(root, sidecar), JSON.stringify(reference) + '\n', {flag: 'wx'});
      created.push(path.join(root, sidecar));
      execFileSync('git', ['-C', root, 'add', '--', relative, sidecar], {stdio: ['ignore', 'pipe', 'pipe']});
    } catch (error) {for (const own of created) fs.unlinkSync(own); throw error;}
    printAdmission(relative, sidecar, false);
    return {exitCode: 0, duplicate: false, file: relative, expectation: sidecar, staged: true};
  } finally {fs.rmSync(stage, {recursive: true});}
}
module.exports = {run};
