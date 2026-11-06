'use strict';

const path = require('path');
const { canonical, inside, positive } = require('../safety');
const ROOT = path.resolve(__dirname, '../..');

const HELP = `Usage: npm run psi-gate -- quick|full|update-expected [options] or repo FOLDER [options]
  quick                  Generated snippets against the upstream merge-base
  repo FOLDER            Check tracked Kotlin inputs in a clean local Git checkout
  full                   Also check corpus assertions, Kotlin and single-site mutations
  update-expected        Record base observations, not count allowances
  --base REV             Explicit local base (default: merge-base with upstream)
  --upstream REMOTE|URL  Override upstream, or PSI_GATE_UPSTREAM
  --upstream-branch NAME Override branch, or PSI_GATE_UPSTREAM_BRANCH
  --git-timeout-ms N     Per-Git-call timeout, or PSI_GATE_GIT_TIMEOUT_MS (default 180000)
  --corpora LIST          Comma-separated snippets,corpus,mutations,kotlin,idea
  --expected FILE        Snapshot to compare, or destination for update-expected
  --home DIR             Owned cache/report directory (default local/psi-gate)
  --jobs N               1..4 oracle workers (default 2)
  --parse-timeout-ms N   Native per-file timeout (default 10000, max 60000)
  --timeout-ms N         Oracle timeout (default 120000)
  --fresh                Discard marked run results, never source directories
  --strict               Require conformance; known base differences also fail
The gate installs its separate LOCKED runtime; project dependencies are not changed.
Requires Node 22+, JDK 17+, git, curl, tar, Python and native build tools.
IDEA inputs require IDEA_ROOT and an exact 40-character IDEA_REV.
`;
function argumentsOf(argv) {
  const args = [...argv],
    command = args.shift() || 'quick';
  if (!['quick', 'full', 'update-expected', 'repo'].includes(command))
    throw new Error(`Unknown job ${command}; use --help`);
  const folder = command === 'repo' ? args.shift() : null;
  if (command === 'repo' && (!folder || folder.startsWith('--'))) throw new Error('repo requires a local checkout folder');
  const options = {
    command,
    repoRoot: folder ? path.resolve(folder) : null,
    jobs: 2,
    timeoutMs: 120000,
    parseTimeoutMs: 10000,
    home: path.join(ROOT, 'local/psi-gate'),
    corpora: command === 'repo' ? ['repo'] : command === 'full' ? ['snippets', 'corpus', 'mutations', 'kotlin'] : ['snippets'],
  };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--fresh' || flag === '--strict') {
      options[flag.slice(2)] = true;
      continue;
    }
    const value = args.shift();
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--base') options.base = value;
    else if (flag === '--upstream') options.upstream = value;
    else if (flag === '--upstream-branch') options.upstreamBranch = value;
    else if (flag === '--git-timeout-ms') options.gitTimeoutMs = positive(value, flag, 3600000);
    else if (flag === '--corpora') options.corpora = value.split(',');
    else if (flag === '--expected') options.expected = path.resolve(value);
    else if (flag === '--home') options.home = path.resolve(value);
    else if (flag === '--jobs') options.jobs = positive(value, flag, 4);
    else if (flag === '--parse-timeout-ms') options.parseTimeoutMs = positive(value, flag, 60000);
    else if (flag === '--timeout-ms') options.timeoutMs = positive(value, flag);
    else throw new Error(`Unknown option ${flag}; use --help`);
  }
  if (
    !options.corpora.length ||
    new Set(options.corpora).size !== options.corpora.length ||
    options.corpora.some((c) => !['snippets', 'corpus', 'mutations', 'kotlin', 'idea', ...(command === 'repo' ? ['repo'] : [])].includes(c))
  )
    throw new Error('Choose distinct supported corpora (see --help)');
  if (command === 'repo' && (options.corpora.length !== 1 || options.corpora[0] !== 'repo'))
    throw new Error('repo checks its folder; --corpora cannot replace it');
  if (options.command === 'update-expected' && !options.expected)
    throw new Error('update-expected requires --expected FILE');
  if (options.expected && options.command !== 'update-expected')
    throw new Error(
      'The launcher measures a base; --expected cannot override it. Use the direct psi-diff runner with --expect and no base.',
    );
  if (options.expected && options.corpora.length !== 1)
    throw new Error('Use one --corpora NAME with an expected snapshot');
  if (options.repoRoot && (inside(canonical(options.home), canonical(options.repoRoot)) ||
      inside(canonical(options.repoRoot), canonical(options.home))))
    throw new Error('--home and the input repository must be separate');
  if (inside(canonical(options.home), canonical(ROOT)))
    throw new Error('--home must not contain the source checkout');
  return options;
}

module.exports = { HELP, argumentsOf };
