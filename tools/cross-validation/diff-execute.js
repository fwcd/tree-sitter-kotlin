'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { confined } = require('../safety');
const { listFilesRecursive } = require('../vendor-fixtures');
const REPO_ROOT = path.resolve(__dirname, '../..');

function loadParsers(grammars, runtime = REPO_ROOT, parseTimeoutMs = 10000) {
  const Parser = require(require.resolve('tree-sitter', { paths: [runtime] }));
  return grammars.map(({ label, root }) => {
    if (path.resolve(root) === REPO_ROOT) require('../../bindings/node/build').assertFresh(root);
    const language = require(path.join(root, 'bindings', 'node'));
    const parser = new Parser();
    parser.setLanguage(language);
    parser.setTimeoutMicros(parseTimeoutMs * 1000);
    return { label, root, parser };
  });
}

function parseText(parser, text) {
  const bufferSize = Math.max(32 * 1024, Buffer.byteLength(text, 'utf8') * 2 + 1024);
  const started = process.hrtime.bigint();
  const tree = parser.parse(text, undefined, { bufferSize });
  const limit = parser.getTimeoutMicros();
  if (!tree || (limit && Number(process.hrtime.bigint() - started) / 1000 >= limit)) {
    parser.reset();
    throw new Error('Native parser timed out; increase --parse-timeout-ms for large inputs');
  }
  return tree;
}

/** True when `root` is the top of a git work tree, not a directory inside one. */
function isGitTop(root) {
  try {
    const top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return fs.realpathSync(top) === fs.realpathSync(root);
  } catch {
    return false;
  }
}

function listInputs({ root, list, exclude }) {
  let files;
  if (list) {
    files = fs.readFileSync(list, 'utf8').split('\n').filter(Boolean);
  } else if (isGitTop(root)) {
    files = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', '*.kt', '*.kts'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } else {
    files = listFilesRecursive(root).filter((file) => /\.kts?$/.test(file));
  }
  if (exclude) {
    const re = new RegExp(exclude);
    files = files.filter((file) => !re.test(file));
  }
  if (new Set(files).size !== files.length) throw new Error('Input list contains duplicates');
  for (const file of files) {
    if (!/\.kts?$/.test(file) || !fs.existsSync(confined(root, file)))
      throw new Error(`Missing or unsupported input: ${file}`);
  }
  return files.sort();
}

module.exports = {loadParsers, parseText, listInputs};
