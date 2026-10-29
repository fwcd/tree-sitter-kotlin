#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { grammarRoot } = require('./grammar-root');
const { listFixtureNames, fixturePaths, FIXTURES_DIR } = require('./cross-validation/fixture-files');
const binding = require('./cross-validation/binding-errors');
const { goldenHasPsiError, verifyGoldenFormat } = require('./psi-fixture-sources');

function generate({ fixturesDir = FIXTURES_DIR, root = grammarRoot(), output, parser } = {}) {
  if (!root) throw new Error('Set KOTLIN_GRAMMAR_ROOT to the LOCAL grammar branch being updated');
  output ||= path.join(root, 'test/corpus/jetbrains');
  if (!parser) {
    const loaded = binding.load(root);
    if (loaded.error) throw new Error(`Parser binding unavailable: ${loaded.error}`);
    parser = loaded.parser;
  }
  const names = listFixtureNames(fixturesDir);
  if (!names.length) throw new Error('No positive PSI fixtures found');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(output), '.jetbrains-corpus-'));
  const report = { schemaVersion: 1, positivePairs: names.length, generated: [], gaps: [], detector: 'binding' };
  try {
    for (const id of names) {
      const { ktFile, psiFile } = fixturePaths(id, fixturesDir);
      const golden = fs.readFileSync(psiFile, 'utf8');
      verifyGoldenFormat(golden, path.basename(ktFile));
      if (goldenHasPsiError(golden)) throw new Error(`PSI-invalid fixture in positive corpus: ${id}`);
      const source = fs.readFileSync(ktFile, 'utf8');
      const bufferSize = Math.max(32 * 1024, Buffer.byteLength(source, 'utf8') * 2 + 1024);
      const tree = parser.parse(source, undefined, { bufferSize });
      if (tree.rootNode.hasError) {
        report.gaps.push({ id, source: ktFile, reason: 'TS_PARSE_ERROR' });
        continue;
      }
      const choose = (character, minimum) => character.repeat(Math.max(minimum,
        ...source.split('\n').map(line => line.trim()).filter(line => line && [...line].every(c => c === character)).map(line => line.length + 1)));
      const header = choose('=', 18), divider = choose('-', 3);
      const file = path.join(staging, ...id.split('/')) + '.txt';
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${header}\nJetBrains PSI: ${id}\n${header}\n\n${source}\n${divider}\n\n${tree.rootNode.toString()}\n`);
      report.generated.push(id);
    }
    if (!report.generated.length) throw new Error('No positive fixture parsed successfully; corpus was not replaced');
    let backup;
    if (fs.existsSync(output)) {
      const directory = path.join(root, 'build/jetbrains-corpus-backups'); fs.mkdirSync(directory, { recursive: true });
      backup = path.join(directory, `${Date.now()}-${process.pid}`); fs.renameSync(output, backup);
    }
    try { fs.renameSync(staging, output); }
    catch (error) { if (backup) fs.renameSync(backup, output); throw error; }
    report.output = output;
    try { report.grammarCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
    const artifacts = path.join(root, 'build'); fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, 'jetbrains-corpus-report.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); }
}

function main(args) {
  const report = generate({ fixturesDir: args[0] ? path.resolve(args[0]) : FIXTURES_DIR });
  console.log(JSON.stringify({ positivePairs: report.positivePairs, generated: report.generated.length,
    grammarGaps: report.gaps.length, detector: report.detector, output: report.output }, null, 2));
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { generate };
