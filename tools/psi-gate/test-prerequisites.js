'use strict';

const fs = require('fs');
const path = require('path');

/** Resolve the exact packages used by variant builds, for both guard and builder. */
function variantBuild(root, configuredGyp = process.env.npm_config_node_gyp) {
  const paths = [path.join(root, 'tools/psi-gate'), root];
  const dependencies = {};
  const missing = [];
  for (const name of ['node-addon-api', 'node-gyp-build']) {
    try {
      dependencies[name] = path.dirname(require.resolve(name, { paths }));
    } catch {
      missing.push(`npm install (${name})`);
    }
  }
  let nodeGyp = configuredGyp;
  if (!nodeGyp || !fs.existsSync(nodeGyp)) {
    try {
      nodeGyp = require.resolve('node-gyp/bin/node-gyp.js', { paths });
    } catch {
      missing.push('npm run test:tools (npm supplies node-gyp)');
    }
  }
  return { dependencies, nodeGyp, missing };
}

module.exports = { variantBuild };
