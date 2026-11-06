'use strict';
const path = require('path');
const { positive } = require('../safety');
const ROOT = path.resolve(__dirname, '../..');
const HELP = `Usage: npm run psi-gate -- quick|full|repo DIR|regenerate-expectations|add FILE|minimize FILE|fuzz [options]
  quick                 Current indexed must-match corpus; no Java/network
  full                  Quick plus clean, pinned configured repositories
  repo DIR              Clean external Git checkout; indexed inputs only
  --config FILE         TOML pins and repository scope (default psigate.toml)
  --home DIR            Owned cache/results (default local/psi-gate)
  --jobs N              1..4 oracle workers (default 2)
  --timeout-ms N        Oracle request timeout (default 120000)
  --parse-timeout-ms N  Native parse timeout (default 10000)
Requires Node, Git, the repo's normal npm install, and JRE 17 for live PSI.
The current bindings/node parser is the sole grammar; verdicts are absolute.
`;
function argumentsOf(argv) {
  const removed = argv.find(flag =>
    ['--base', '--upstream', '--upstream-branch', '--expected', '--strict', '--corpora', '--promote'].includes(flag));
  if (removed) throw new Error(`${removed} was removed: PSI gate v2 checks the current grammar with absolute verdicts`);
  const args = [...argv], command = args.shift() || 'quick';
  if (!['quick', 'full', 'repo', 'regenerate-expectations', 'add', 'minimize', 'fuzz'].includes(command))
    throw new Error(`Unknown PSI gate command: ${command}`);
  const options = { command, home: path.join(ROOT, 'local/psi-gate'), configFile: path.join(ROOT, 'psigate.toml'),
    jobs: 2, timeoutMs: 120000, parseTimeoutMs: 10000, forward: [] };
  if (command === 'repo' || command === 'add' || command === 'minimize') {
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`${command} requires a ${command === 'repo' ? 'Git folder' : 'snippet file'}`);
    options[command === 'repo' ? 'repoRoot' : 'file'] = path.resolve(value);
  }
  while (args.length) {
    const flag = args.shift();
    if (command === 'fuzz' && !['--config', '--home', '--jobs', '--timeout-ms', '--parse-timeout-ms'].includes(flag)) {
      options.forward.push(flag, ...args); break;
    }
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--config') options.configFile = path.resolve(value);
    else if (flag === '--home') options.home = path.resolve(value);
    else if (flag === '--max-seconds' && command === 'minimize') options.maxSeconds = positive(value, flag, 3600);
    else if (flag === '--class' && command === 'minimize') options.classId = value;
    else if (flag === '--jobs') options.jobs = positive(value, flag, 4);
    else if (flag === '--timeout-ms') options.timeoutMs = positive(value, flag);
    else if (flag === '--parse-timeout-ms') options.parseTimeoutMs = positive(value, flag, 60000);
    else throw new Error(`Unknown PSI gate option: ${flag}`);
  }
  return options;
}
module.exports = { HELP, argumentsOf };
