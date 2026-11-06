'use strict';
const path = require('path');
const {positive} = require('../safety');
const ROOT = path.resolve(__dirname, '../..');
const OPTIONS = {
  config: ['--config FILE', 'TOML pins/repositories', 'configFile', path.join(ROOT, 'psigate.toml')],
  home: ['--home DIR', 'Owned cache/results', 'home', path.join(ROOT, 'local/psi-gate')],
  oracle: ['--timeout-ms N', 'Live PSI request timeout', 'oracleTimeoutMs', 120000, 3600000],
  native: ['--parse-timeout-ms N', 'Native per-file timeout', 'parseTimeoutMs', 10000, 60000],
  jobs: ['--jobs N', 'Oracle workers', 'jobs', 2, 4],
  out: ['--out DIR', 'Report/suspect directory (default new temporary directory)', 'out'],
  family: ['--class ID', 'Mismatch family (default first present)', 'classId'],
  reduction: ['--max-seconds N', 'Total reduction budget', 'maxSeconds', 30, 3600],
  seed: ['--seed TEXT', 'Deterministic search seed', 'seed', 'psi-search'],
  inputs: ['--max-inputs N', 'Search input limit', 'maxInputs', 400, 10000000],
  search: ['--max-seconds N', 'Whole search budget', 'maxSeconds', 900, 86400],
  sources: ['--sources FILE', 'Pinned source seed manifest', 'sources'],
  corpus: ['--corpus DIR', 'Real source seeds', 'corpus'],
  list: ['--list FILE', 'Exact --corpus relative input list', 'list'],
  fixtures: ['--fixtures DIR', 'Kotlin fixture/source seeds', 'fixtures'],
  known: ['--known-ledger DIR', 'Read-only known ledger (default committed grammar-bugs)', 'knownLedger'],
  depth: ['--depth N', 'Recursive generation depth', 'depth', 4, 8],
  workers: ['--jobs N', 'Search workers', 'jobs', 2, 2],
  batch: ['--batch-size N', 'Inputs per oracle batch', 'batchSize', 16, 64],
  rounds: ['--min-rounds N', 'Reduction rounds', 'minRounds', 20, 100],
  candidates: ['--min-candidates N', 'Candidates per reduction round', 'minCandidates', 32, 128],
  seconds: ['--min-seconds N', 'Budget per representative', 'minSeconds', 20, 3600],
  continuous: ['--continuous', 'Search until stability/time/explicit input limit', 'continuous'],
  stable: ['--stable-window N', 'Consecutive valid inputs without novelty', 'stableWindow', 5000, 10000000],
};
const COMMANDS = {
  quick: ['quick', 'Check indexed must-match snippets; no Java/network', ['config','home','native']],
  full: ['full', 'Quick plus live PSI on clean pinned repositories', ['config','home','oracle','native','jobs']],
  repo: ['repo DIR', 'Check clean Git/indexed Kotlin files; untracked ignored', ['config','home','oracle','native','jobs']],
  'regenerate-expectations': ['regenerate-expectations', 'Regenerate pinned PSI truth; review and stage the diff', ['config','home','oracle']],
  coverage: ['coverage', 'Measure live-verified native/PSI type and context coverage', ['config','home','oracle','native','out']],
  minimize: ['minimize FILE', 'Reduce one PSI-valid mismatch; keep the verified artifact bundle', ['config','home','oracle','native','family','reduction']],
  add: ['add FILE', 'Reverify a matching case and stage its source/PSI expectation', ['config','home','oracle','native']],
  fuzz: ['fuzz', 'Deterministic search; findings are not a conformance verdict',
    ['config','home','oracle','native','seed','inputs','search','out','sources','corpus','list','fixtures',
      'known','depth','workers','batch','rounds','candidates','seconds','continuous','stable']],
};
const ENVIRONMENT = [
  ['PSI_ORACLE_CACHE', 'Shared SHA-verified Kotlin jar cache'],
  ['PSI_GATE_GIT_TIMEOUT_MS', 'Per Git operation budget in ms (default 180000)'],
  ['PSI_JAVA', 'Java 17+ executable for live PSI'],
  ['PSI_DEBUG=1', 'Show error stack traces'],
  ['PSI_GATE_VERBOSE=1', 'Show complete generator/native build logs'],
  ['HTTPS_PROXY / https_proxy', 'HTTPS proxy (npm proxy settings also supported)'],
  ['CC / CXX / CFLAGS / CXXFLAGS / CPPFLAGS / LDFLAGS', 'Ordinary native build toolchain settings'],
];
function commandHelp(command) {
  const environment = '\nEnvironment:\n' + ENVIRONMENT.map(([name, text]) => `  ${name}  ${text}`).join('\n');
  if (!command || command.startsWith('-')) return 'Usage: npm run psi-gate -- COMMAND [options]\n' +
    Object.values(COMMANDS).map(([usage, summary]) => `  ${usage.padEnd(27)} ${summary}`).join('\n') +
    '\nUse COMMAND --help for its options.' + environment + '\n';
  const spec = COMMANDS[command]; if (!spec) throw Error(`Unknown PSI gate command: ${command}`);
  return `Usage: npm run psi-gate -- ${spec[0]} [options]\n${spec[1]}\n\nOptions:\n` + spec[2].map(id => {
    const [flag, text, , fallback, maximum] = OPTIONS[id];
    const value = typeof fallback === 'number' ? ` (default ${fallback}${maximum ? '; range 1..' + maximum : ''})` : '';
    return `  ${flag.padEnd(23)} ${text}${value}`;
  }).join('\n') + '\n\nExit codes: 0 complete; 1 mismatch/setup failure; 2 resource budget exhausted (incomplete).\n' + environment + '\n';
}
const HELP = commandHelp();
function argumentsOf(argv) {
  const removed = argv.find(flag => ['--base','--upstream','--upstream-branch','--expected','--strict','--corpora','--promote'].includes(flag));
  if (removed) throw Error(`${removed} was removed: PSI gate checks the current grammar with absolute verdicts`);
  const args = [...argv], command = args.shift() || 'quick', spec = COMMANDS[command];
  if (!spec) throw Error(`Unknown PSI gate command: ${command}`);
  const options = {command, configFile: OPTIONS.config[3], home: OPTIONS.home[3], oracleTimeoutMs: 120000,
    parseTimeoutMs: 10000, jobs: 2, forward: []};
  if (spec[0].includes(' ')) {
    const value = args.shift();
    if (!value || value.startsWith('--')) throw Error(`${command} requires a ${command === 'repo' ? 'Git folder' : 'snippet file'}`);
    options[command === 'repo' ? 'repoRoot' : 'file'] = path.resolve(value);
  }
  if (command === 'fuzz') options.forward = [...args];
  while (args.length) {
    const flag = args.shift();
    const id = spec[2].find(id => OPTIONS[id][0].split(' ')[0] === flag);
    if (!id) throw Error(`Unknown ${command} option: ${flag}`);
    if (!OPTIONS[id][0].includes(' ')) {options[OPTIONS[id][2]] = true; continue;}
    const value = args.shift(); if (!value || value.startsWith('--')) throw Error(`${flag} requires a value`);
    const [, , key, , maximum] = OPTIONS[id];
    options[key] = maximum ? positive(value, flag, maximum) :
      ['configFile','home','out','sources','corpus','list','fixtures','knownLedger'].includes(key) ? path.resolve(value) : value;
  }
  return options;
}
module.exports = {HELP, commandHelp, argumentsOf, COMMANDS, OPTIONS};
