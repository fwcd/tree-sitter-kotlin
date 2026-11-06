'use strict';

const fs = require('fs');
const path = require('path');
const { OracleServer } = require('../psi-oracle/oracle');
const { loadParsers, parseText, firstTsError, psiLayout, lexicalFacts } = require('../cross-validation/diff-run');
const { compareWithPsi } = require('../cross-validation/pipeline');
const { parsePsi } = require('../cross-validation/parser-psi');
const { normalizePsi } = require('../cross-validation/normalizer');
const { sha256, confined } = require('../safety');
const { BudgetExceeded, remaining } = require('./fuzz-budget');
const { observe } = require('./fuzz-coverage');

function shape(node) {
  if (!node) return null;
  const result = [node.name, node.children.map(shape)];
  if (node.literal !== undefined) result.push({ literal: node.literal });
  return result;
}
function namedSignature(diff) {
  const direction = diff.kind === 'child_count_mismatch'
    ? Number(diff.actual) > Number(diff.expected) ? 'more-children' : 'fewer-children' : null;
  return ['named', diff.kind, diff.path.split(' > ').slice(-3),
    direction || diff.expected, direction ? null : diff.actual];
}
function grammarSignature(root) {
  const error = firstTsError(root);
  if (!error) return ['grammar', 'hidden-error'];
  let leaf = error.node;
  while (leaf.childCount) leaf = leaf.child(0);
  return ['grammar', error.node.parent?.type || root.type,
    error.missing ? 'MISSING' : 'ERROR', leaf.type];
}
const signatureId = (signature) => sha256(JSON.stringify(signature)).slice(0, 20);

class Inspector {
  constructor({ grammar, runtime, out, timeoutMs = 30000, parseTimeoutMs = 10000 }) {
    grammar = path.resolve(grammar); runtime = path.resolve(runtime);
    this.out = path.resolve(out);
    this.timeoutMs = timeoutMs;
    this.parseTimeoutMs = parseTimeoutMs;
    this.parser = loadParsers([{ label: 'main', root: grammar }], runtime, parseTimeoutMs)[0].parser;
    this.server = new OracleServer();
    this.restartAfterBudget = false;
  }
  async inspect(inputs, { deadline = Infinity } = {}) {
    remaining(deadline);
    if (this.restartAfterBudget) {
      this.server.close();
      this.server = new OracleServer();
      this.restartAfterBudget = false;
      remaining(deadline);
    }
    const root = fs.mkdtempSync(path.join(this.out, '.batch-'));
    try {
      const names = inputs.map((input, i) => {
        remaining(deadline);
        if (!['.kt', '.kts', undefined].includes(input.extension)) throw new Error('Invalid fuzz input extension');
        const name = `input${i}${input.extension || '.kt'}`;
        fs.writeFileSync(path.join(root, name), input.text);
        return name;
      });
      const output = path.join(root, 'psi');
      const entries = await this.server.run(names, {
        root, out: output, timeoutMs: Math.min(this.timeoutMs, remaining(deadline)),
      });
      remaining(deadline);
      if (entries.length !== inputs.length) throw new Error('Incomplete fuzz oracle index');
      return entries.map((psi, i) => {
        remaining(deadline);
        if (psi.path !== names[i] || psi.failure)
          throw new Error(`Fuzz oracle failed: ${psi.failure || 'misaligned index'}`);
        if (psi.psiErrors) return { accepted: false, psiErrors: psi.psiErrors };
        const text = psi.crlf ? inputs[i].text.replace(/\r\n?/g, '\n') : inputs[i].text;
        this.parser.setTimeoutMicros(Math.min(this.parseTimeoutMs, remaining(deadline)) * 1000);
        const tree = parseText(this.parser, text);
        try {
          remaining(deadline);
          const dump = fs.readFileSync(confined(output, psi.dump), 'utf8');
          const rawPsi = parsePsi(dump);
          const cst = lexicalFacts(tree.rootNode), layout = psiLayout(dump, text);
          remaining(deadline);
          const emptyQuest = cst.tokens.filter(token => token.type === 'quest' && token.start === token.end);
          const lostQuest = layout.tokens.filter(token => token.type === 'QUEST' &&
            !cst.tokens.some(native => native.start <= token.start && native.end >= token.end) &&
            emptyQuest.some(native => native.start >= token.end && !text.slice(token.end, native.start).trim()));
          const grammarDefect = tree.rootNode.hasError ? 'native-syntax-rejection'
            : lostQuest.length ? 'empty-quest-span' : null;
          let comparison, normalizerError;
          try {
            comparison = tree.rootNode.hasError
              ? { psiNorm: normalizePsi(rawPsi), tsNorm: null, result: { differences: [] } }
              : compareWithPsi(tree.rootNode.toString(), dump, { nativeRoot: tree.rootNode, source: text });
          } catch (error) {
            normalizerError = String(error.message);
            comparison = { psiNorm: null, tsNorm: null, result: { differences: [] } };
          }
          const classes = tree.rootNode.hasError ? [grammarSignature(tree.rootNode)]
            : lostQuest.length ? [['grammar', 'token-span', 'quest']]
            : normalizerError ? [['normalizer-exception', normalizerError]]
            : comparison.result.differences.map(namedSignature);
          const unique = new Map(classes.map(signature => [signatureId(signature), signature]));
          remaining(deadline);
          return {
            accepted: true, text, nativeRejected: tree.rootNode.hasError, coverage: observe(tree.rootNode, dump), classes: [...unique].map(([id, signature]) => ({ id, signature })),
            grammarError: Boolean(grammarDefect), grammarDefect,
            spanEvidence: lostQuest.length ? { psi: lostQuest, native: emptyQuest } : null,
            expectedPsi: layout.composites.map(node => [node.type, node.depth]), psiDump: dump, expectedNormalized: shape(comparison.psiNorm),
            actualNormalized: shape(comparison.tsNorm), nativeTree: tree.rootNode.toString(),
            differences: comparison.result.differences, normalizerError,
          };
        } finally { tree.delete?.(); }
      });
    } catch (error) {
      if (Date.now() >= deadline) {
        this.restartAfterBudget = Boolean(this.server.failure);
        throw new BudgetExceeded();
      }
      throw error;
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  }
  close() { this.server.close(); }
}

/** Results retain input order regardless of worker scheduling. */
class InspectorPool {
  constructor(options, jobs = 1) {
    this.clients = [];
    try { for (let i = 0; i < jobs; i++) this.clients.push(new Inspector(options)); }
    catch (error) { this.close(); throw error; }
  }
  async inspect(inputs, { deadline = Infinity } = {}) {
    remaining(deadline);
    const output = new Array(inputs.length);
    await Promise.all(this.clients.map(async (client, index) => {
      const slots = inputs.map((input, i) => ({ input, i })).filter(slot => slot.i % this.clients.length === index);
      if (!slots.length) return;
      const results = await client.inspect(slots.map(slot => slot.input), { deadline });
      slots.forEach((slot, i) => { output[slot.i] = results[i]; });
    }));
    remaining(deadline);
    return output;
  }
  close() { this.clients.forEach(client => client.close()); }
}

module.exports = { InspectorPool };
