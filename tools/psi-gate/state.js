'use strict';
const fs = require('fs');
const path = require('path');
const {sha256, inside} = require('../safety');
const REPO = path.resolve(__dirname, '../..');
const hashFile = file => fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
const digest = value => sha256(JSON.stringify(value));
function runtimeIdentity(root) {
  const entry = require.resolve('tree-sitter', { paths: [root] });
  const directory = path.dirname(entry);
  const native = ['build/Release', 'prebuilds'].flatMap((dir) =>
    require('../vendor-fixtures')
      .listFilesRecursive(path.join(directory, dir))
      .filter((file) => file.endsWith('.node'))
      .map((file) => [path.join(dir, file), hashFile(path.join(directory, dir, file))]),
  );
  return digest([hashFile(entry), hashFile(path.join(directory, 'package.json')), native]);
}

function toolIdentity() {
  const start = require.cache[require.resolve('../cross-validation/diff-classify')];
  const seen = new Set();
  const pending = [start];
  const files = [];
  while (pending.length) {
    const module = pending.pop();
    if (!module || seen.has(module.id)) continue;
    seen.add(module.id);
    pending.push(...module.children);
    if (
      inside(path.join(REPO, 'tools'), module.filename) &&
      !module.filename.includes('node_modules')
    ) {
      files.push([path.relative(REPO, module.filename), hashFile(module.filename)]);
    }
  }
  const java = require('../psi-oracle/oracle').SOURCE;
  files.push([path.relative(REPO, java), hashFile(java)]);
  return digest(files.sort((a, b) => a[0].localeCompare(b[0])));
}

module.exports = {hashFile, digest, runtimeIdentity, toolIdentity};
