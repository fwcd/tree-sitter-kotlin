'use strict';

const fs = require('fs');
const path = require('path');
const { createParser } = require('./runtime');
const { confined, sha256, positive } = require('../safety');
const { parseText } = require('../cross-validation/diff-execute');
const { compareInput } = require('../cross-validation/diff-classify');
const { runOracleAsync } = require('../psi-oracle/oracle');

async function checkFiles({ root, files, config, out, timeoutMs = 120000, parseTimeoutMs = 10000, jobs = 2 }) {
  jobs = positive(jobs, 'jobs', 4);
  if (!files.length) throw new Error('No indexed Kotlin inputs selected');
  if (new Set(files).size !== files.length) throw new Error('Duplicate selected input paths');
  fs.mkdirSync(out, { recursive: true });
  const rows = new Array(files.length), workers = Math.min(jobs, Math.ceil(files.length / 1000));
  await Promise.all(Array.from({ length: workers }, async (_, worker) => {
    const parser = createParser(undefined, parseTimeoutMs);
    for (let shard = worker; shard < Math.ceil(files.length / 1000); shard += workers) {
      const start = shard * 1000, batch = files.slice(start, start + 1000);
      batch.forEach(file => confined(root, file));
      const dumpRoot = path.join(out, 'psi-' + shard);
      const refs = await runOracleAsync(batch, { root, out: dumpRoot, config, timeoutMs });
      if (refs.length !== batch.length) throw new Error('Incomplete PSI oracle results');
      refs.forEach((psi, i) => {
        if (psi.path !== batch[i] || psi.failure) throw new Error(`PSI oracle failure: ${psi.path}: ${psi.failure || 'misaligned output'}`);
        const bytes = fs.readFileSync(confined(root, psi.path)), original = bytes.toString('utf8');
        const text = psi.crlf ? original.replace(/\r\n?/g, '\n') : original;
        const tree = parseText(parser, text), dump = fs.readFileSync(confined(dumpRoot, psi.dump), 'utf8');
        try {
          const result = compareInput({ text, tree, psi, dump });
          rows[start + i] = { path: psi.path, sha256: sha256(bytes), psiErrors: psi.psiErrors,
            nativeError: tree.rootNode.hasError, ...result,
            match: result.verdict === 'ok' && !tree.rootNode.hasError && psi.psiErrors === 0 };
        } finally { tree.delete?.(); }
      });
    }
  }));
  const mismatches = rows.filter(row => !row.match);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(rows, null, 2) + '\n');
  return { exitCode: mismatches.length ? 1 : 0, files: rows.length, mismatches, rows };
}
module.exports = { checkFiles };
