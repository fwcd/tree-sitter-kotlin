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
const { jarPaths, isFetched, verifyHelper } = require('./fetch');
const { loadConfig } = require('../psi-gate/config');
const { confined, javaExecutable, positive } = require('../safety');
const {resourceError} = require('../resource');
const JVM = ['-Xss64m', '-Xmx1g'];

const SOURCE = path.join(__dirname, 'PsiOracle.java');

/**
 * @typedef {{ path: string, dump: string, psiErrors?: number, crlf?: boolean,
 *   firstError?: { offset: number, line: number, column: number, message: string } | null,
 *   failure?: string }} OracleEntry
 */

function javaArgs(listFile, { root, out, trim, config = loadConfig() }) {
  const args = [...JVM, '-cp', [...jarPaths(config), verifyHelper(config)].join(path.delimiter), 'PsiOracle',
    '--list', listFile, '--root', root, '--out', out];
  if (trim) args.push('--trim');
  return args;
}

function readIndex(out) {
  const entries = fs.readFileSync(path.join(out, 'index.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  entries.forEach(entry => { confined(out, entry.dump); });
  return entries;
}

function prepare(files, options, verify = true) {
  if (/[\r\n\t\0]/.test(options.root + options.out)) throw new Error('Root/output paths cannot contain control characters');
  if (!files.length || new Set(files).size !== files.length) throw new Error('Oracle inputs must be nonempty and unique');
  files.forEach(file => confined(options.root, file));
  if (verify && !isFetched(options.config)) throw new Error('PSI oracle pins are missing or corrupt; run npm run psi-oracle:fetch');
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
    execFileSync(javaExecutable(), javaArgs(listFile, options), { timeout: positive(options.timeoutMs || 120000, 'timeout-ms'), killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'inherit'] });
    return readIndex(options.out);
  } finally {
    fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
  }
}

/** Asynchronous `runOracle`, for running several shards at once. */
function runOracleAsync(files, options) {
  const java = javaExecutable();
  const listFile = prepare(files, options);
  return new Promise((resolve, reject) => {
    execFile(java, javaArgs(listFile, options), { timeout: positive(options.timeoutMs || 120000, 'timeout-ms'), killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 }, (error, _stdout, stderr) => {
      fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
      if (error) reject(error.killed ? resourceError('PSI oracle request timed out', 'PSI_ORACLE_TIMEOUT') :
        new Error(`PsiOracle failed: ${stderr || error.message}`));
      else { try { resolve(readIndex(options.out)); } catch (failure) { reject(failure); } }
    });
  });
}

/**
 * One long-lived oracle JVM for many small batches, as the minimizer needs:
 * start-up is paid once and the parser stays warm.
 */
class OracleServer {
  constructor({ config = loadConfig() } = {}) {
    if (!isFetched(config)) throw new Error('PSI oracle pins are missing or corrupt; run npm run psi-oracle:fetch');
    this.child = spawn(javaExecutable(), [...JVM, '-cp', [...jarPaths(config), verifyHelper(config)].join(path.delimiter), 'PsiOracle', '--serve'],
      { stdio: ['pipe', 'pipe', 'inherit'] });
    this.pending = [];
    this.queue = Promise.resolve();
    this.failure = null;
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
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
    this.child.on('exit', code => this.fail(new Error(`PsiOracle server exited ${code}`)));
  }

  fail(error) {
    this.failure = error;
    for (const waiter of this.pending.splice(0)) waiter.reject(error);
  }

  /** Same contract as `runOracle`. */
  run(files, options) {
    const work = this.queue.then(() => this.runOnce(files, options));
    this.queue = work.catch(() => {});
    return work;
  }

  async runOnce(files, options) {
    if (this.failure) throw this.failure;
    const listFile = prepare(files, options, false);
    const timer = setTimeout(() => { this.fail(resourceError('PSI oracle request timed out', 'PSI_ORACLE_TIMEOUT')); this.child.kill('SIGKILL'); }, positive(options.timeoutMs || 120000, 'timeout-ms'));
    try {
      await new Promise((resolve, reject) => {
        this.pending.push({ resolve, reject });
        this.child.stdin.write(`${listFile}\t${path.resolve(options.root)}\t${path.resolve(options.out)}\n`);
      });
      return readIndex(options.out);
    } finally {
      clearTimeout(timer);
      fs.rmSync(path.dirname(listFile), { recursive: true, force: true });
    }
  }

  close() {
    this.child.kill();
    this.fail(new Error('PSI oracle closed'));
  }
}

module.exports = { runOracle, runOracleAsync, readIndex, OracleServer, SOURCE };
