'use strict';

const fs = require('fs');
const path = require('path');
const nodes = require('../../src/node-types.json');
const psi = require('./fuzz-psi-types.json');
const nativeTypes = nodes.filter(n => n.named).map(n => n.type);
const leaf = /^(PsiElement|PsiWhiteSpace|PsiComment)(?:\(([^)]*)\))?\('(.*)'\)$/s;
const floatNode = 'FLOAT_CONSTANT@KtConstantExpressionElementType';

/** Raw element coverage, before normalization; recovery stays distinguishable. */
function observe(root, dump) {
  const nt = new Set(), np = new Set(), pt = new Set(['kotlin.FILE']), pp = new Set();
  const pending = [root];
  while (pending.length) {
    const n = pending.pop();
    if (n.isNamed && n.type !== 'ERROR') nt.add(n.type);
    for (const c of n.namedChildren) {
      if (n.type !== 'ERROR' && c.type !== 'ERROR') np.add(n.type + ' > ' + c.type);
      pending.push(c);
    }
  }
  const stack = [{ indent: -1, type: 'kotlin.FILE' }];
  for (const line of dump.split('\n').slice(1)) {
    const text = line.trim(), indent = line.length - line.trimStart().length;
    if (!text || text === '<empty list>') continue;
    while (stack.length > 1 && stack.at(-1).indent >= indent) stack.pop();
    const token = leaf.exec(text);
    let type;
    if (token) {
      type = token[1] === 'PsiWhiteSpace' ? 'WHITE_SPACE' : token[2];
      if (type === 'FLOAT_CONSTANT') type += '@KtToken';
    } else if (/^[A-Z][A-Z_0-9]*$/.test(text) || text === 'KDoc') {
      type = text === 'FLOAT_CONSTANT' ? floatNode : text;
    } else continue;
    pt.add(type); pp.add(stack.at(-1).type + ' > ' + type);
    if (!token) stack.push({ indent, type });
  }
  return { nativeTypes: [...nt].sort(), nativePairs: [...np].sort(), psiTypes: [...pt].sort(), psiPairs: [...pp].sort() };
}

class Coverage {
  constructor() {
    this.files = 0; this.nativeRejected = 0; this.features = new Map();
    this.views = Object.fromEntries(['all', 'nativeClean', 'generated', 'mutated', 'corpus'].map(name => [name,
      Object.fromEntries(['nativeTypes', 'nativePairs', 'psiTypes', 'psiPairs'].map(k => [k, new Map()]))]));
    this.intended = { nativeTypes: new Set(nativeTypes), nativePairs: new Set(),
      psiTypes: new Set([...psi.composites, ...psi.tokens].filter(t => !Object.hasOwn(psi.notEmitted, t))), psiPairs: new Set() };
  }
  add(result, origin = {}) {
    if (!result.accepted) return;
    this.files++;
    if (origin.kind === 'generated') this.features.set(origin.feature, (this.features.get(origin.feature) || 0) + 1);
    this.nativeRejected += result.nativeRejected ? 1 : 0;
    const selected = ['all', ...(result.nativeRejected ? [] : ['nativeClean']),
      origin.kind === 'generated' ? 'generated' : origin.kind?.startsWith('mutation') ? 'mutated' : 'corpus'];
    for (const view of selected) for (const [kind, values] of Object.entries(result.coverage))
      for (const value of values) this.views[view][kind].set(value, (this.views[view][kind].get(value) || 0) + 1);
  }
  target(origin) {
    for (const kind of Object.keys(this.intended))
      for (const value of origin[kind] || []) this.intended[kind].add(value);
  }
  weight(types = [], pairs = []) {
    const v = this.views.generated;
    return 1 + types.reduce((sum, type) => sum + 8 / (1 + (v.nativeTypes.get(type) || 0)), 0) +
      pairs.reduce((sum, pair) => sum + 4 / (1 + (v.nativePairs.get(pair) || 0)), 0);
  }
  snapshot() {
    const views = {};
    for (const [name, v] of Object.entries(this.views)) {
      const parentCounts = {};
      for (const pair of v.nativePairs.keys()) {
        const [parent, child] = pair.split(' > ');
        (parentCounts[child] ||= new Set()).add(parent);
      }
      const nativeMissing = nativeTypes.filter(t => !v.nativeTypes.has(t));
      const composites = psi.composites.filter(t => !Object.hasOwn(psi.notEmitted, t)), tokens = psi.tokens.filter(t => !Object.hasOwn(psi.notEmitted, t));
      views[name] = { summary: { nativeTypes: v.nativeTypes.size, nativeTotal: nativeTypes.length,
        psiComposites: composites.filter(t => v.psiTypes.has(t)).length, psiCompositeTotal: composites.length,
        psiTokens: tokens.filter(t => v.psiTypes.has(t)).length, psiTokenTotal: tokens.length,
        nativePairs: v.nativePairs.size, psiPairs: v.psiPairs.size },
        missing: { nativeTypes: nativeMissing, psiComposites: composites.filter(t => !v.psiTypes.has(t)),
          psiTokens: tokens.filter(t => !v.psiTypes.has(t)) }, ...Object.fromEntries(Object.entries(v).map(([kind, map]) => [kind,
        Object.fromEntries([...map].sort(([a], [b]) => a.localeCompare(b)))])),
        nativeParentContexts: Object.fromEntries(Object.entries(parentCounts).map(([type, parents]) => [type, [...parents].sort()])) };
    }
    return { schemaVersion: 1, compiler: psi.compiler, files: this.files, nativeRejected: this.nativeRejected,
      notEmitted: psi.notEmitted, generatedFeatures: Object.fromEntries([...this.features].sort(([a],[b])=>a.localeCompare(b))),
      universes: { nativeTypes, psiComposites: psi.composites, psiTokens: psi.tokens },
      intended: Object.fromEntries(Object.entries(this.intended).map(([k, set]) => [k, [...set].sort()])), views };
  }
  write(directory) { fs.writeFileSync(path.join(directory, 'coverage.json'), JSON.stringify(this.snapshot(), null, 2) + '\n'); }
}

module.exports = { observe, Coverage };
