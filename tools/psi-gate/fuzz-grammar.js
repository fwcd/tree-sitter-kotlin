'use strict';

const grammar = require('../../src/grammar.json');
const named = new Set(require('../../src/node-types.json').filter(n => n.named).map(n => n.type));

function references(node, out = new Set()) {
  if (node.type === 'SYMBOL') out.add(node.name);
  if (node.content) references(node.content, out);
  for (const child of node.members || []) references(child, out);
  return out;
}
const graph = Object.assign(Object.create(null),
  Object.fromEntries(Object.entries(grammar.rules).map(([name, node]) => [name, [...references(node)]])));
function descendants(name, depth = 3, seen = new Set()) {
  if (!depth || seen.has(name)) return seen;
  seen.add(name);
  for (const child of graph[name] || []) descendants(child, depth - 1, seen);
  return seen;
}

/** Render actual grammar combinators; Kotlin-specific terminals/context slots are supplied by the caller. */
function renderer(random, overrides) {
  const choose = items => items[Math.floor(random() * items.length)];
  let active = 0;
  const emit = (name, depth = 2) => {
    if (Object.hasOwn(overrides, name)) return typeof overrides[name] === 'function' ? overrides[name](depth) : overrides[name];
    if (!grammar.rules[name]) throw new Error('No generation production for ' + name);
    if (++active > 40) throw new Error('Recursive generation production: ' + name);
    try { return render(grammar.rules[name], depth); } finally { active--; }
  };
  const render = (node, depth) => {
    if (node.type === 'STRING') return node.value;
    if (node.type === 'BLANK') return '';
    if (node.type === 'SYMBOL') return emit(node.name, depth);
    if (node.type === 'SEQ') return node.members.map(n => render(n, depth)).filter(Boolean).join(' ').replace(/! (is|in)\b/g, '!$1');
    if (node.type === 'CHOICE') return render(choose(node.members), depth);
    if (node.type === 'REPEAT' || node.type === 'REPEAT1') {
      const count = node.type === 'REPEAT1' ? 1 : Math.floor(random() * 2);
      return Array.from({ length: count }, () => render(node.content, depth)).join(' ');
    }
    if (node.content) return render(node.content, depth);
    if (node.type === 'PATTERN') {
      const regex = new RegExp('^(?:' + node.value + ')$');
      const atoms = ['v', 'T', '1', '1.5', '1L', '0x7f', '0b1', ' ', '\n'];
      const atom = atoms.find(value => regex.test(value));
      if (atom !== undefined) return atom;
    }
    throw new Error('Generation requires a Kotlin terminal for ' + node.type);
  };
  return emit;
}

module.exports = { grammar, graph, named, descendants, renderer };
