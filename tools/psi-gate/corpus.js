// The inputs of the tree-sitter corpus (`test/corpus/**/*.txt`) as `.kt` files, so the PSI
// differential checks each case's claim against Kotlin's parser: a case without `:error` claims
// the input is Kotlin, a case with `:error` claims it is not. Through `diff-run.js --expect`, a
// case PSI contradicts — `B` for a clean case, `A` for an error case — fails the gate unless the
// registry names the difference. Usage: node tools/psi-gate/corpus.js CORPUS_DIR OUTPUT_DIR
// writes OUTPUT_DIR/<corpus file>/<NNNN>.kt and OUTPUT_DIR/cases.json (file → case name, error).
'use strict';
const fs = require('fs');
const path = require('path');

const HEADER = /^={3,}\s*$/;
const DIVIDER = /^-{3,}\s*$/;

/**
 * The cases of one corpus file.
 *
 * @param {string} text
 * @returns {Array<{ name: string, error: boolean, input: string }>}
 */
function parseCorpus(text) {
  const lines = text.split('\n');
  const cases = [];
  let i = 0;
  while (i < lines.length) {
    if (!HEADER.test(lines[i])) { i++; continue; }
    const head = [];
    for (i++; i < lines.length && !HEADER.test(lines[i]); i++) head.push(lines[i]);
    const input = [];
    for (i++; i < lines.length && !DIVIDER.test(lines[i]); i++) input.push(lines[i]);
    while (i < lines.length && !HEADER.test(lines[i])) i++;
    const attributes = head.filter(line => line.startsWith(':')).map(line => line.trim());
    cases.push({
      name: head.filter(line => !line.startsWith(':')).join(' ').trim(),
      error: attributes.includes(':error'),
      input: input.join('\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n',
    });
  }
  return cases;
}

function main([corpus, output]) {
  const files = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.txt')) files.push(p);
    }
  };
  walk(corpus);
  fs.rmSync(output, { recursive: true, force: true });
  const index = {};
  for (const file of files.sort()) {
    const rel = path.relative(corpus, file).replace(/\.txt$/, '');
    parseCorpus(fs.readFileSync(file, 'utf8')).forEach(({ name, error, input }, n) => {
      const out = path.join(rel, `${String(n).padStart(4, '0')}.kt`);
      fs.mkdirSync(path.join(output, rel), { recursive: true });
      fs.writeFileSync(path.join(output, out), input);
      index[out] = { file: path.relative(path.dirname(corpus), file), name, error };
    });
  }
  fs.writeFileSync(path.join(output, 'cases.json'), JSON.stringify(index, null, 2) + '\n');
  console.error(`corpus: ${Object.keys(index).length} cases of ${files.length} files`);
}

module.exports = { parseCorpus };

if (require.main === module) main(process.argv.slice(2));
