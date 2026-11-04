'use strict';

// Extract corpus inputs and their CST expectations. :error is a grammar expectation;
// generated JetBrains tests remain PSI-positive even when the grammar rejects them.
const fs = require('fs');
const path = require('path');
const { resetOutput, sha256 } = require('../safety');
const { runIfMain } = require('../cli');
const { CORPUS_NAMESPACE } = require('../vendor-jetbrains-tests');

const HEADER = /^={3,}\s*$/;
const DIVIDER = /^-{3,}\s*$/;

/** Read source and ERROR/MISSING expectations from a tree-sitter corpus file. */
function parseCorpus(text) {
  const lines = text.split('\n');
  const cases = [];
  let i = 0;
  while (i < lines.length) {
    if (!HEADER.test(lines[i])) {
      i++;
      continue;
    }
    const head = [];
    for (i++; i < lines.length && !HEADER.test(lines[i]); i++) head.push(lines[i]);
    if (i === lines.length) throw new Error('Unterminated corpus case header');
    const input = [];
    for (i++; i < lines.length && !DIVIDER.test(lines[i]); i++) input.push(lines[i]);
    if (i === lines.length) throw new Error('Corpus case is missing its expected-CST divider');
    const expected = [];
    for (i++; i < lines.length && !HEADER.test(lines[i]); i++) expected.push(lines[i]);
    const attributes = head.filter((line) => line.startsWith(':')).map((line) => line.trim());
    cases.push({
      name: head
        .filter((line) => !line.startsWith(':'))
        .join(' ')
        .trim(),
      error: attributes.includes(':error') || /\(\s*(?:ERROR|MISSING)\b/.test(expected.join('\n')),
      input: input.join('\n').replace(/^\n+/, '').replace(/\n+$/, '') + '\n',
    });
  }
  return cases;
}

/** Stable across insertion/reordering of other cases; binds claims to exact source. */
function fingerprint(claim) {
  return sha256(
    JSON.stringify([claim.file, claim.name, claim.inputSha256, claim.error, claim.psiClean]),
  );
}

function main([corpus, output]) {
  if (!corpus || !output) throw new Error('Usage: corpus.js SOURCE_DIR OUTPUT_DIR');
  resetOutput(output, corpus);
  const files = require('../vendor-fixtures')
    .listFilesRecursive(corpus)
    .filter((file) => file.endsWith('.txt'));
  const index = {};
  for (const relative of files) {
    const rel = relative.replace(/\.txt$/, '');
    parseCorpus(fs.readFileSync(path.join(corpus, relative), 'utf8')).forEach(
      ({ name, error, input }, n) => {
        const out = path.join(rel, `${String(n).padStart(4, '0')}.kt`);
        fs.mkdirSync(path.join(output, rel), { recursive: true });
        fs.writeFileSync(path.join(output, out), input);
        index[out] = {
          file: relative,
          name,
          error,
          psiClean: relative.split(path.sep)[0] === CORPUS_NAMESPACE || !error,
          inputSha256: sha256(input),
        };
      },
    );
  }
  fs.writeFileSync(path.join(output, 'cases.json'), JSON.stringify(index, null, 2) + '\n');
  console.error(`corpus: ${Object.keys(index).length} cases of ${files.length} files`);
}

module.exports = { parseCorpus, fingerprint, main };
runIfMain(module, main);
