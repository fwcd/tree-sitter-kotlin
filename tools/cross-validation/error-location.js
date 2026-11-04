'use strict';

function leafLabel(node) {
  let leaf = node;
  while (leaf.childCount > 0) leaf = leaf.child(0);
  if (leaf === node && node.type === 'ERROR') return '∅';
  // A keyword inside an ERROR node may carry another token's type; its text
  // is what a reader recognises.
  return leaf.isNamed ? leaf.type : JSON.stringify(leaf.text);
}

/**
 * First ERROR or MISSING node in document order, descending only into
 * subtrees that report an error.
 *
 * @returns {{ node: object, missing: boolean }|null}
 */
function firstTsError(root) {
  let node = root;
  for (;;) {
    let next = null;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.isMissing) return { node: child, missing: true };
      if (child.type === 'ERROR') return { node: child, missing: false };
      if (child.hasError) {
        next = child;
        break;
      }
    }
    if (!next) return node === root ? null : { node, missing: false };
    node = next;
  }
}

function namedAncestorType(node) {
  let current = node;
  while (current && !current.isNamed) current = current.parent;
  return current ? current.type : 'source_file';
}

module.exports = { firstTsError, leafLabel, namedAncestorType };
