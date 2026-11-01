/**
 * Runs `PsiOracle.java` on a list of files and reads its index.
 *
 * One JVM parses the whole list; start-up costs about two seconds, so callers
 * pass shards of a few thousand files rather than one file at a time.
 *
 * @module psi-oracle/oracle
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');
const { jarPaths, isFetched } = require('./fetch');

const SOURCE = path.join(__dirname, 'PsiOracle.java');

/**
 * @typedef {{ path: string, dump: string, psiErrors?: number, crlf?: boolean,
 *   firstError?: { offset: number, line: number, column: number, message: string } | null,
 *   failure?: string }} OracleEntry
 */

function javaArgs(listFile, { root, out, trim }) {
  const args = ['-Xss512m', '-Xmx4g', '-cp', jarPaths().join(path.delimiter), SOURCE,
    '--list', listFile, '--root', root, '--out', out];
  if (trim) args.push('--trim');
  return args;
}

function readIndex(out) {
  return fs.readFileSync(path.join(out, 'index.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function prepare(files, options) {
  if (!isFetched()) throw new Error('PSI oracle jars are missing; run npm run psi-oracle:fetch');
  fs.mkdirSync(options.out, { recursive: true });
  const listFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'psi-oracle-')), 'files.txt');
  fs.writeFileSync(listFile, files.join('\n') + '\n');
  return listFile;
}

/**
 * Parse files synchronously.
 *
 * @param {string[]} files - Paths relative to `root`.
 * @param {{ root: string, out: string, trim?: boolean }} options - `out`
 *   receives `<path>.psi.txt` dumps and `index.jsonl`.
 * @returns {OracleEntry[]} In input order.
 */
function runOracle(files, options) {
  const listFile = prepare(files, options);
  try {
    execFileSync('java', javaArgs(listFile, options), { stdio: ['ignore', 'ignore', 'inherit'] });
    return readIndex(options.out);
  } finally {
    fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
  }
}

/** Asynchronous `runOracle`, for running several shards at once. */
function runOracleAsync(files, options) {
  const listFile = prepare(files, options);
  return new Promise((resolve, reject) => {
    execFile('java', javaArgs(listFile, options), { maxBuffer: 64 * 1024 * 1024 }, (error, _stdout, stderr) => {
      fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
      if (error) reject(new Error(`PsiOracle failed: ${stderr || error.message}`));
      else resolve(readIndex(options.out));
    });
  });
}

/**
 * One long-lived oracle JVM for many small batches, as the minimizer needs:
 * start-up is paid once and the parser stays warm.
 */
class OracleServer {
  constructor() {
    if (!isFetched()) throw new Error('PSI oracle jars are missing; run npm run psi-oracle:fetch');
    this.child = spawn('java', ['-Xss512m', '-Xmx4g', '-cp', jarPaths().join(path.delimiter), SOURCE, '--serve'],
      { stdio: ['pipe', 'pipe', 'inherit'] });
    this.pending = [];
    this.buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk;
      let newline;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        this.buffer = this.buffer.slice(newline + 1);
        this.pending.shift()?.resolve();
      }
    });
    this.child.on('exit', code => {
      for (const waiter of this.pending.splice(0)) waiter.reject(new Error(`PsiOracle server exited ${code}`));
    });
  }

  /** Same contract as `runOracle`. */
  async run(files, options) {
    const listFile = prepare(files, options);
    try {
      await new Promise((resolve, reject) => {
        this.pending.push({ resolve, reject });
        this.child.stdin.write(`${listFile}\t${path.resolve(options.root)}\t${path.resolve(options.out)}\n`);
      });
      return readIndex(options.out);
    } finally {
      fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
    }
  }

  close() {
    this.child.stdin.end();
  }
}

module.exports = { runOracle, runOracleAsync, readIndex, OracleServer };
