'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { javaExecutable } = require('../safety');
const ROOT = path.resolve(__dirname, '../..');
function prerequisites({ java = true } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install Node.js 22+ before running the PSI gate');
  const git = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (git.error || git.status !== 0) throw new Error('Git is required for index-only PSI gate inputs');
  if (java) javaExecutable();
}
function createParser(root = ROOT, timeoutMs = 10000) {
  try {
    const Parser = require(require.resolve('tree-sitter', { paths: [root] }));
    const parser = new Parser();
    parser.setLanguage(require(path.join(root, 'bindings/node')));
    parser.setTimeoutMicros(timeoutMs * 1000);
    return parser;
  } catch (error) {
    throw new Error(`Current Node binding could not load; run npm install in the grammar repository: ${error.message}`);
  }
}
function runtime() { return createParser(); }
module.exports = { prerequisites, createParser, runtime };
