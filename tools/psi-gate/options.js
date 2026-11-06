'use strict';
const path = require('path');
const { positive } = require('../safety');
const ROOT = path.resolve(__dirname, '../..');
const HELP = `Usage: npm run psi-gate -- quick|full|repo DIR|regenerate-expectations|add FILE|minimize FILE|coverage|fuzz [options]
  quick                 Current indexed must-match corpus; no Java/network
  full                  Quick plus clean, pinned configured repositories
  repo DIR              Clean external Git checkout; indexed inputs only
  minimize FILE         Reverified per-file reduction; --class ID, --max-seconds N (30)
  coverage              Live PSI type/context measurement; --out DIR (temporary default)
  fuzz                  Search; --seed TEXT, --max-inputs N (400), --max-seconds N (900), --out DIR
  --config FILE         TOML pins and repository scope (default psigate.toml)
  --home DIR            Owned cache/results (default local/psi-gate)
  --jobs N              1..4 oracle workers (default 2)
  --timeout-ms N        Oracle request timeout (default 120000)
  --parse-timeout-ms N  Native parse timeout (default 10000)
Requires Node, Git, the repo's normal npm install, and JRE 17 for live PSI.
The current bindings/node parser is the sole grammar; verdicts are absolute.
`;
const COMMON_HELP = `  --config FILE         TOML pins/repositories (default psigate.toml)
  --home DIR            Owned cache/results (default local/psi-gate)
`;
const ORACLE_HELP = `  --timeout-ms N        Live PSI request timeout (default 120000)
`;
const PARSE_HELP = `  --parse-timeout-ms N  Native per-file timeout (default 10000; maximum 60000)
`;
const COMMAND_HELP = {
  quick: `Usage: npm run psi-gate -- quick [options]
Check current indexed must-match snippets against stored PSI expectations.
Needs Node/Git and the current binding; no Java or network.
` + COMMON_HELP + PARSE_HELP,
  full: `Usage: npm run psi-gate -- full [options]
Run Quick and compare clean pinned configured repositories with live PSI.
` + COMMON_HELP + ORACLE_HELP + PARSE_HELP + '  --jobs N              1..4 oracle workers (default 2)\n',
  repo: `Usage: npm run psi-gate -- repo DIR [options]
Check indexed Kotlin files in a clean Git checkout; untracked files are ignored.
` + COMMON_HELP + ORACLE_HELP + PARSE_HELP + '  --jobs N              1..4 oracle workers (default 2)\n',
  'regenerate-expectations': `Usage: npm run psi-gate -- regenerate-expectations [options]
Regenerate indexed corpus PSI truth using pinned live PSI. Review the diff before staging.
` + COMMON_HELP + ORACLE_HELP,
  coverage: `Usage: npm run psi-gate -- coverage [options]
Measure live-verified corpus type/context coverage.
` + COMMON_HELP + ORACLE_HELP + '  --out DIR             Report directory (default a new temporary directory)\n',
  minimize: `Usage: npm run psi-gate -- minimize FILE [options]
Reduce one PSI-valid mismatch and save a reverified temporary source/sidecar/index.
` + COMMON_HELP + ORACLE_HELP + PARSE_HELP + `  --class ID            Select a mismatch family (default first present family)
  --max-seconds N       Total reduction budget (default 30; maximum 3600)
`,
  add: `Usage: npm run psi-gate -- add FILE [options]
Reverify a matching Kotlin snippet with live PSI, then stage its source and stored PSI expectation.
` + COMMON_HELP + ORACLE_HELP + PARSE_HELP,
  fuzz: `Usage: npm run psi-gate -- fuzz [options]
  --seed TEXT --max-inputs N --max-seconds N  Deterministic, budgeted search
  --out DIR             Untracked suspect folder; default a new OS temp folder
  --sources FILE        Research seed manifest; --corpus DIR --list FILE, --fixtures DIR
  --known-ledger DIR    Read-only known ledger (default committed grammar-bugs)
  --depth N --jobs N --batch-size N  Depth1..8, workers1..2, batches1..64
  --min-rounds N --min-candidates N --min-seconds N  Reduction budgets
  --continuous --stable-window N  Optional search stopping window; never a gate
Stdout lists minimized, PSI-valid suspect paths; index.json records sidecars and budgets.
No classification, corpus writes, promotion, base or past-commit comparison.
Use a separate follow-up, then explicit add of a fixed must-match specimen.
` + COMMON_HELP + ORACLE_HELP + PARSE_HELP
};
function commandHelp(command) {
  if (!command || command.startsWith('-')) return HELP;
  if (!COMMAND_HELP[command]) throw Error(`Unknown PSI gate command: ${command}`);
  return COMMAND_HELP[command];
}
function argumentsOf(argv) {
  const removed = argv.find(flag =>
    ['--base', '--upstream', '--upstream-branch', '--expected', '--strict', '--corpora', '--promote'].includes(flag));
  if (removed) throw new Error(`${removed} was removed: PSI gate v2 checks the current grammar with absolute verdicts`);
  const args = [...argv], command = args.shift() || 'quick';
  if (!['quick', 'full', 'repo', 'regenerate-expectations', 'add', 'minimize', 'coverage', 'fuzz'].includes(command))
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
    else if (flag === '--out' && command === 'coverage') options.out = path.resolve(value);
    else if (flag === '--max-seconds' && command === 'minimize') options.maxSeconds = positive(value, flag, 3600);
    else if (flag === '--class' && command === 'minimize') options.classId = value;
    else if (flag === '--jobs') options.jobs = positive(value, flag, command === 'fuzz' ? 2 : 4);
    else if (flag === '--timeout-ms') options.timeoutMs = positive(value, flag);
    else if (flag === '--parse-timeout-ms') options.parseTimeoutMs = positive(value, flag, 60000);
    else throw new Error(`Unknown PSI gate option: ${flag}`);
  }
  return options;
}
module.exports = { HELP, commandHelp, argumentsOf };
