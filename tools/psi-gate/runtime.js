'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { run, javaExecutable, sha256 } = require('../safety');

function prerequisites(options) {
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Install Node.js 22+ before running the PSI gate');
  if (
    options.corpora.includes('idea') &&
    (!process.env.IDEA_ROOT || !/^[0-9a-f]{40}$/i.test(process.env.IDEA_REV || ''))
  ) {
    throw new Error('Set IDEA_ROOT to an IntelliJ checkout and IDEA_REV to its full pinned commit');
  }
  javaExecutable();
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const compiler = process.env.CXX || (process.platform === 'win32' ? 'cl' : 'c++');
  const probes = [
    {
      command: 'git',
      args: ['--version'],
      pattern: /git version (\d+)\.(\d+)/,
      minimum: [2, 20],
      hint: 'Install git 2.20+',
    },
    {
      command: 'curl',
      args: ['--version'],
      pattern: /curl (\d+)\.(\d+)/,
      minimum: [7, 20],
      hint: 'Install curl 7.20+',
    },
    { command: 'tar', args: ['--version'], hint: 'Install tar' },
    {
      command: python,
      args: ['--version'],
      pattern: /Python (\d+)\.(\d+)/,
      minimum: [3, 8],
      hint: 'Install Python 3.8+',
    },
    {
      command: compiler,
      args: process.platform === 'win32' ? ['/?'] : ['--version'],
      pattern:
        process.platform === 'win32'
          ? /Compiler Version (\d+)\.(\d+)/i
          : /(?:clang version|(?:gcc|g\+\+|c\+\+).*?)\s+(\d+)\.(\d+)/i,
      minimum: process.platform === 'win32' ? [19, 20] : [8, 0],
      hint: 'Install a C++17 compiler (GCC/Clang 8+, MSVC 19.20+)',
    },
  ];
  if (process.platform !== 'win32')
    probes.push({ command: 'make', args: ['--version'], hint: 'Install make' });
  for (const probe of probes) {
    const result = spawnSync(probe.command, probe.args, { timeout: 10000, encoding: 'utf8' });
    if (result.error || result.signal || result.status !== 0) {
      throw new Error(
        `${probe.hint}; ${probe.command} probe failed (${result.status ?? result.error?.code})`,
      );
    }
    if (probe.pattern) {
      const version = probe.pattern.exec((result.stdout || '') + (result.stderr || ''));
      if (
        !version ||
        Number(version[1]) < probe.minimum[0] ||
        (Number(version[1]) === probe.minimum[0] && Number(version[2]) < probe.minimum[1])
      ) {
        throw new Error(`${probe.hint}; ${probe.command} is too old or its version is unsupported`);
      }
    }
  }
}
function runtime() {
  const lock = fs.readFileSync(path.join(__dirname, 'package-lock.json'));
  const receipt = path.join(__dirname, 'node_modules/.psi-lock');
  if (!fs.existsSync(receipt) || fs.readFileSync(receipt, 'utf8') !== sha256(lock)) {
    console.log(
      'Installing the separate pinned PSI runtime (project node_modules is untouched)...',
    );
    // npm's CLI is supplied when this entry point is invoked through npm run.
    const npm = process.env.npm_execpath;
    if (!npm)
      throw new Error('Run this tool with npm run psi-gate so its pinned runtime can be installed');
    run(process.execPath, [npm, 'ci', '--prefix', __dirname, '--no-audit', '--no-fund'], {
      timeout: 300000,
    });
    fs.writeFileSync(receipt, sha256(lock));
  }
  const version = require(path.join(__dirname, 'node_modules/tree-sitter/package.json')).version;
  if (version !== '0.25.1')
    throw new Error('PSI runtime is corrupt; remove tools/psi-gate/node_modules and rerun');
}

module.exports = { prerequisites, runtime };
