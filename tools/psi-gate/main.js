#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { runIfMain } = require('../cli');
const { inside } = require('../safety');
const state = require('./state');
const diff = require('../cross-validation/diff-run');
const { assertHome, withHome } = require('./home');
const { HELP, argumentsOf } = require('./options');
const { prerequisites, runtime } = require('./runtime');
const { grammar, revision, prepareGrammar } = require('./build');
const { checkoutKotlin, corpusPlan, baseCorpus } = require('./inputs');
const { unmarked, inspectRepository, annotateReport } = require('./repository');
const ROOT = path.resolve(__dirname, '../..');

/** Failed runs leave the last successful report intact. */
function publishReport(home, corpus, result, report) {
  const destination = path.join(home, corpus + (result.exitCode ? '.failed.md' : '.md'));
  fs.copyFileSync(report, destination);
  console.log(
    (result.exitCode ? 'Failed report: ' : 'Latest report: ') +
      (inside(ROOT, path.resolve(destination))
        ? path.relative(ROOT, destination)
        : path.resolve(destination)),
  );
  return destination;
}

async function runJob(options) {
  runtime();
  await require('../psi-oracle/fetch').fetchAll();
  const baseRevision = revision(options.base, options);
  const head = grammar(ROOT, options.home),
    base = grammar(ROOT, options.home, baseRevision);
  let kotlin;
  if (options.corpora.some((c) => c === 'kotlin' || c === 'mutations'))
    kotlin = checkoutKotlin(options.home);
  let failed = false;
  for (const corpus of options.corpora) {
    const { root, extra, repository, reportContext } = corpusPlan(corpus, options, kotlin, baseRevision);
    const out = path.join(options.home, 'runs', corpus);
    const args = [
      '--corpus',
      corpus,
      '--root',
      root,
      '--grammar',
      'head=' + head,
      '--grammar',
      'base=' + base,
      '--runtime',
      __dirname,
      '--out',
      out,
      '--jobs',
      String(options.jobs),
      '--timeout-ms',
      String(options.timeoutMs),
      '--parse-timeout-ms',
      String(options.parseTimeoutMs),
      ...extra,
    ];
    if (options.fresh) args.push('--fresh');
    if (options.strict) args.push('--strict');
    if (options.expected)
      args.push(
        options.command === 'update-expected' ? '--update-expected' : '--expect',
        options.expected,
      );
    const parsed = diff.parseArgs(args);
    const content = state.digest(state.identity(parsed, diff.listInputs(parsed)));
    args[args.indexOf('--out') + 1] = path.join(out, content);
    const latest = path.join(options.home, corpus + '.md');
    let result;
    try {
      result = await diff.main(args, reportContext);
    } catch (error) {
      console.error(`${corpus}: execution failed; previous report preserved at ${latest}`);
      throw error;
    }
    if (repository) annotateReport(path.join(out, content), repository);
    publishReport(options.home, corpus, result, path.join(out, content, 'report.md'));
    if (result.exitCode) failed = true;
  }
  return { exitCode: failed ? 1 : 0 };
}
async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return { exitCode: 0 };
  }
  const options = argumentsOf(argv);
  if (options.command === 'repo') inspectRepository(options.repoRoot);
  assertHome(options.home);
  prerequisites(options);
  return withHome(options.home, () => runJob(options));
}

module.exports = { prepareGrammar, main, argumentsOf, prerequisites, unmarked, baseCorpus, publishReport };
runIfMain(module, main);
