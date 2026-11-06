'use strict';

const fs = require('fs');
const path = require('path');
const { sha256, confined, canonical } = require('../safety');
const { reduce } = require('../cross-validation/minimize');
const { tokenize } = require('./mutate');
const { BudgetExceeded, remaining } = require('./fuzz-budget');

function comparisonIdentity() {
  return sha256(JSON.stringify([
    require('./state').toolIdentity(),
    ['fuzz.js', 'fuzz-compare.js', 'fuzz-state.js', 'fuzz-budget.js', 'fuzz-generate.js', 'fuzz-declarations.js', 'fuzz-grammar.js', 'fuzz-coverage.js', 'fuzz-psi-types.json', 'mutate.js'].map(name =>
      sha256(fs.readFileSync(path.join(__dirname, name)))),
    sha256(fs.readFileSync(path.join(__dirname, '../cross-validation/minimize.js'))),
    sha256(fs.readFileSync(path.join(__dirname, '../../src/grammar.json'))),
    sha256(fs.readFileSync(path.join(__dirname, '../../src/node-types.json'))),
  ]));
}
function identity({ grammar, runtime }) {
  return sha256(JSON.stringify([
    sha256(fs.readFileSync(path.join(grammar, 'build/Release/tree_sitter_kotlin_binding.node'))),
    comparisonIdentity(), require('./state').runtimeIdentity(runtime),
    ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'LANG', 'LC_ALL', 'NODE_OPTIONS'].map(name => [name, process.env[name] || '']),
    process.version,
  ]));
}

/** Reproduction means PSI-clean and the exact selected class is still present. */
async function minimize(input, id, inspector, {
  candidates = 32, rounds = 20, seconds = 20, deadline: outer = Infinity,
} = {}) {
  const deadline = Math.min(outer, Date.now() + seconds * 1000);
  let best;
  const holds = async (texts) => {
    remaining(deadline);
    const results = await inspector.inspect(texts.map(text => ({ text, extension: input.extension })), { deadline });
    remaining(deadline);
    return results.map((result, i) => {
      const accepted = result.accepted && result.classes.some(c => c.id === id);
      if (accepted && (!best || Buffer.byteLength(texts[i]) < Buffer.byteLength(best.text)))
        best = { text: texts[i], result };
      return accepted;
    });
  };
  const finish = exhausted => ({ ...best, exhausted, extension: input.extension || '.kt',
    originalBytes: Buffer.byteLength(input.text) });
  try {
    if (!(await holds([input.text]))[0]) throw new Error('Fuzz representative no longer reproduces');
    const options = { maxCandidates: candidates, maxRounds: rounds };
    const lexical = tokenize(input.text);
    let previous = 0;
    const pieces = [];
    for (const token of lexical) {
      if (token.start > previous) pieces.push(input.text.slice(previous, token.start));
      pieces.push(token.text); previous = token.end;
    }
    if (previous < input.text.length) pieces.push(input.text.slice(previous));
    // Lexer gaps contain trivia only. Removing whole comments avoids breaking KDoc
    // delimiters; strings/characters and essential comments remain opaque units.
    const withoutComments = pieces.map(piece => {
      if (piece.startsWith('/*') || piece.trimStart().startsWith('/*') || piece.trimStart().startsWith('//'))
        return '\n'.repeat((piece.match(/\n/g) || []).length) || ' ';
      return piece;
    }).join('');
    let text = input.text;
    if ((await holds([withoutComments]))[0]) text = withoutComments;
    if (!text.includes('/*')) {
      const lines = await reduce(text.split('\n'), batches => holds(batches.map(x => x.join('\n'))), options);
      text = lines.join('\n');
    }
    const units = tokenize(text);
    const tokens = [];
    previous = 0;
    for (const token of units) {
      if (token.start > previous) tokens.push(text.slice(previous, token.start));
      tokens.push(token.text); previous = token.end;
    }
    if (previous < text.length) tokens.push(text.slice(previous));
    const reduced = await reduce(tokens, batches => holds(batches.map(x => x.join(''))), options);
    text = reduced.join('');
    // Keep quote delimiters intact while shrinking literal payloads. Comments are
    // never split, including comments embedded in interpolation expressions.
    for (let pass = 0; pass < 8; pass++) {
      remaining(deadline);
      const literals = tokenize(text).filter(token => ['string', 'char'].includes(token.kind))
        .sort((a, b) => (b.end - b.start) - (a.end - a.start));
      let changed = false;
      for (const token of literals) {
        const quote = token.text.startsWith('"""') ? '"""' : token.text[0];
        if (!token.text.endsWith(quote)) continue;
        const payload = token.text.slice(quote.length, -quote.length);
        if (!payload || payload.includes('/*') || payload.includes('//')) continue;
        const prefix = text.slice(0, token.start + quote.length), suffix = text.slice(token.end - quote.length);
        const shrunk = await reduce(Array.from(payload), batches => holds(batches.map(x => prefix + x.join('') + suffix)), options);
        if (shrunk.join('').length < payload.length) {
          text = prefix + shrunk.join('') + suffix; changed = true; break;
        }
      }
      if (!changed) break;
    }
    remaining(deadline);
    const [result] = await inspector.inspect([{ text: best.text, extension: input.extension }], { deadline });
    remaining(deadline);
    if (!result.accepted || !result.classes.some(c => c.id === id))
      throw new Error('Minimized fuzz representative failed its final reproduction check');
    best.result = result;
    return finish(false);
  } catch (error) {
    if (!(error instanceof BudgetExceeded) || !best) throw error;
    // Retain only a candidate actually verified before the deadline. No final
    // inspection is started after expiry; bounded results cannot be promoted.
    return finish(true);
  }
}

function ownedDirectory(directory) {
  const marker = path.join(directory, '.psi-fuzz-bugs');
  const catalogOwned = canonical(directory) === canonical(path.join(__dirname, 'grammar-bugs')) &&
    fs.existsSync(path.join(directory, 'catalog-ledger.json'));
  if (fs.existsSync(directory) && (fs.lstatSync(directory).isSymbolicLink() ||
      (fs.readdirSync(directory).length && !catalogOwned && (!fs.existsSync(marker) ||
        fs.readFileSync(marker, 'utf8') !== 'psi-fuzz-bugs-v1\n'))))
    throw new Error('Grammar-bug directory is not owned; choose a new --bugs directory');
  fs.mkdirSync(directory, { recursive: true });
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, 'psi-fuzz-bugs-v1\n', { flag: 'wx' });
}
function readLedger(directory) {
  ownedDirectory(directory);
  const file = path.join(directory, 'ledger.json');
  const entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  for (const entry of entries) {
    if (sha256(fs.readFileSync(confined(directory, entry.file))) !== entry.sourceSha256)
      throw new Error(`Corrupt grammar-bug source: ${entry.id}`);
    if (sha256(fs.readFileSync(confined(directory, entry.expected))) !== entry.expectedSha256)
      throw new Error(`Corrupt grammar-bug expectation: ${entry.id}`);
  }
  return entries;
}
function readGrammarInput(directory, entry) {
  if (entry.sourceEncoding !== undefined && entry.sourceEncoding !== 'json')
    throw new Error(`Invalid grammar-bug input encoding: ${entry.id}`);
  const source = fs.readFileSync(confined(directory, entry.file), 'utf8');
  const text = entry.sourceEncoding === 'json' ? JSON.parse(source) : source;
  const extension = entry.extension || path.extname(entry.file);
  if (typeof text !== 'string' || !['.kt', '.kts'].includes(extension))
    throw new Error(`Invalid grammar-bug input encoding: ${entry.id}`);
  return { text, extension };
}
function writeGrammarBug(directory, representative, { seed, revision, signature, origin, promote = false, deadline = Infinity }) {
  remaining(deadline);
  if (canonical(directory) === canonical(path.join(__dirname, 'grammar-bugs'))) {
    if (!promote) throw new Error('Writing the tracked grammar corpus requires --promote; use a local --bugs directory');
    if (representative.exhausted !== false || Buffer.byteLength(representative.text) > 1000)
      throw new Error('Promotion requires a completed reduction of at most 1000 bytes; increase the reduction budget');
  }
  if (!representative.result.grammarError || !representative.result.accepted)
    throw new Error('Only PSI-clean confirmed native defects belong in the grammar-bug ledger');
  const entries = readLedger(directory);
  const id = 'g-' + sha256(JSON.stringify([
    signature, representative.result.expectedPsi, representative.result.nativeTree,
  ])).slice(0, 20);
  const previous = entries.find(entry => entry.id === id);
  if (previous) return { id, added: false };
  const extension = representative.extension || '.kt';
  const encoded = /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(representative.text);
  const file = id + extension + (encoded ? '.json' : '');
  const sourceText = encoded ? JSON.stringify(representative.text) + '\n' : representative.text;
  const sameInput = entries.find(entry => entry.sourceSha256 === sha256(sourceText) &&
    JSON.stringify(entry.signature) === JSON.stringify(signature));
  if (sameInput) return { id: sameInput.id, added: false };
  // Provenance contains repo/pin/relative path or generated seed, never input roots.
  const { root: _root, ...provenance } = origin || {};
  const expectedText = JSON.stringify({ compiler: '2.4.21', psi: representative.result.expectedPsi }) + '\n';
  const expected = 'psi-' + sha256(expectedText).slice(0, 20) + '.expected.json';
  const ensure = (relative, text) => {
    const target = confined(directory, relative);
    if (fs.existsSync(target)) {
      if (sha256(fs.readFileSync(target)) !== sha256(text))
        throw new Error(`Conflicting orphan grammar case: ${relative}; inspect it before retrying`);
    } else fs.writeFileSync(target, text, { flag: 'wx' });
  };
  remaining(deadline);
  ensure(file, sourceText);
  ensure(expected, expectedText);
  entries.push({ id, file, expected, sourceSha256: sha256(sourceText),
    ...(encoded ? { sourceEncoding: 'json', extension } : {}), timeBoundReached: representative.exhausted,
    expectedSha256: sha256(expectedText), signature, observed: { defect: representative.result.grammarDefect, spans: representative.result.spanEvidence }, likelyGrammarArea: signature[1],
    firstSeenSeed: seed, grammarRevision: revision, provenance });
  const ledger = path.join(canonical(directory), 'ledger.json');
  fs.writeFileSync(ledger + '.tmp', JSON.stringify(entries, null, 2) + '\n');
  fs.renameSync(ledger + '.tmp', ledger);
  return { id, added: true };
}

function acquireLock(lock) {
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  let fd;
  try { fd = fs.openSync(lock, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const before = fs.lstatSync(lock);
    if (before.isSymbolicLink()) throw new Error('Unexpected symlink in fuzz lock');
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid fuzz lock; inspect it before retrying');
    try { process.kill(pid, 0); throw new Error(`Another fuzz process owns ${lock}`); }
    catch (owner) { if (owner.code !== 'ESRCH') throw owner; }
    const now = fs.lstatSync(lock);
    if (before.ino !== now.ino || before.mtimeMs !== now.mtimeMs) throw new Error('Fuzz lock changed; retry');
    fs.unlinkSync(lock);
    fd = fs.openSync(lock, 'wx');
  }
  fs.writeSync(fd, String(process.pid));
  return () => { fs.closeSync(fd); fs.unlinkSync(lock); };
}
function saveGrammarBug(directory, representative, metadata) {
  ownedDirectory(directory);
  const release = acquireLock(path.join(directory, '.ledger.lock'));
  try { return writeGrammarBug(directory, representative, metadata); }
  finally { release(); }
}

module.exports = { acquireLock, comparisonIdentity, identity, minimize, readLedger, readGrammarInput, saveGrammarBug };
