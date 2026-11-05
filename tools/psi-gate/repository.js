'use strict';

const fs = require('fs');
const path = require('path');
const { run, canonical, confined, resetOutput, sha256 } = require('../safety');
const digest = value => sha256(JSON.stringify(value));

function unmarked(root) {
  const files = run('git', ['-C', root, 'ls-files', '-z', '--', '*.kt', '*.kts'])
    .split('\0')
    .filter(Boolean);
  const markup =
    /<(?:\/?(?:caret\w*|before|after|change|selection|error|warning|weak_warning|info|lineMarker|EOLError|EOLWarning|spot|symbolName|fold|inlineHint|hint|ref|cursor|block|html|inject|rainbow|TYPO|text_attr|caretMarker|expr)\b|rename\b)|<!\w*(?:[:(][^>]*)?!>|<!>/;
  return files
    .filter((file) => {
      const data = fs.readFileSync(confined(root, file), 'utf8');
      return !markup.test(data) && !/^\/\/ FILE: \S+\.(?!kts?\s*$)\w+\s*$/m.test(data);
    })
    .sort();
}

function inspectRepository(input) {
  const root = canonical(input);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error('Repository folder is missing or is not a directory');
  let top, commit;
  try {
    top = canonical(run('git', ['-C', root, 'rev-parse', '--show-toplevel']).trim());
    commit = run('git', ['-C', root, 'rev-parse', '--verify', 'HEAD^{commit}']).trim();
  } catch {
    throw new Error('repo requires a local Git checkout with a commit');
  }
  const dirty = run('git', ['-C', top, 'status', '--porcelain', '--untracked-files=no']).trim();
  const untracked = run('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '--', '*.kt', '*.kts']).trim();
  if (dirty || untracked)
    throw new Error('Input repository has uncommitted changes or untracked Kotlin files; commit them or use a clean checkout');
  return { root, top, commit };
}

/** Snapshot source bytes in the owned cache so later reductions remain reproducible. */
function snapshotRepository(input, home) {
  const repository = inspectRepository(input);
  const files = unmarked(repository.root);
  if (!files.length) throw new Error('No Kotlin inputs remain after the repository markup filter');
  const sources = files.map(file => ({ path: file, sha256: sha256(fs.readFileSync(confined(repository.root, file))) }));
  const inputHash = digest(sources);
  const tracked = run('git', ['-C', repository.root, 'ls-files', '-z', '--', '*.kt', '*.kts']).split('\0').filter(Boolean);
  const info = { ...repository, inputHash, files: files.length, markupExcluded: tracked.filter(file => !files.includes(file)) };
  const directory = path.join(home, 'repositories', digest([repository.root, repository.commit, inputHash]));
  const root = path.join(directory, 'inputs'), receipt = path.join(directory, 'repository.json');
  if (!fs.existsSync(receipt)) {
    resetOutput(directory, repository.root);
    fs.mkdirSync(root);
    for (const file of files) {
      const target = confined(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(confined(repository.root, file), target);
    }
    fs.writeFileSync(path.join(root, '.source-revision'), repository.commit + '\n');
    fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(info) + '\n');
    fs.writeFileSync(receipt, JSON.stringify(info, null, 2) + '\n');
  }
  if (digest(JSON.parse(fs.readFileSync(receipt, 'utf8'))) !== digest(info) ||
      fs.readFileSync(path.join(root, '.source-revision'), 'utf8').trim() !== repository.commit ||
      digest(JSON.parse(fs.readFileSync(path.join(root, 'provenance.json'), 'utf8'))) !== digest(info))
    throw new Error('Repository snapshot metadata is corrupt; use a new --home');
  if (sources.some(source => !fs.existsSync(confined(root, source.path)) ||
      sha256(fs.readFileSync(confined(root, source.path))) !== source.sha256))
    throw new Error('Repository snapshot cache is corrupt or inputs changed; use a new --home');
  const current = inspectRepository(repository.root);
  if (current.commit !== repository.commit) throw new Error('Input repository changed while creating its snapshot; rerun');
  const list = path.join(directory, 'inputs.list');
  fs.writeFileSync(list, files.join('\n') + '\n');
  return { root, repository: info, extra: ['--list', list] };
}

function annotateReport(out, repository) {
  const file = path.join(out, 'report.md');
  const text = fs.readFileSync(file, 'utf8');
  const line = text.indexOf('\n');
  const header = `\n\n## Repository input\n\nCheckout: ${repository.root}\n\nCommit: ${repository.commit}\n\n` +
    `Input content SHA-256: ${repository.inputHash}\n\n` +
    `Kotlin inputs: ${repository.files}; markup-filter exclusions: ${repository.markupExcluded.length}.\n\n`;
  fs.writeFileSync(file, text.slice(0, line) + header + text.slice(line + 1));
  const metaFile = path.join(out, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  if (meta.identity.context.inputs !== repository.inputHash || meta.files !== repository.files)
    throw new Error('Repository report input identity does not match its snapshot');
  meta.repository = repository;
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
}

module.exports = { unmarked, inspectRepository, snapshotRepository, annotateReport };
