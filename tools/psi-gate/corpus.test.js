import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseCorpus } = require('./corpus');

describe('parseCorpus', () => {
  it('reads each case with its name, its :error attribute and its input', () => {
    const text = [
      '==================',
      'A clean case',
      '==================',
      '',
      'val x = 1',
      '',
      '---',
      '',
      '(source_file)',
      '',
      '==================',
      'An error case',
      ':error',
      '==================',
      '',
      'val = 1',
      '---',
      '',
    ].join('\n');
    expect(parseCorpus(text)).toEqual([
      { name: 'A clean case', error: false, input: 'val x = 1\n' },
      { name: 'An error case', error: true, input: 'val = 1\n' },
    ]);
  });
});

it('recognizes ERROR and MISSING expected CSTs without an error attribute', () => {
  for (const expected of ['(source_file (ERROR))', '(source_file (MISSING "}"))']) {
    const text = '===\nCase\n===\nval x=1\n---\n' + expected;
    expect(parseCorpus(text)[0].error).toBe(true);
  }
});

it('shares the generated corpus namespace with its importer', () => {
  const { CORPUS_NAMESPACE, corpusDirectory } = require('../vendor-jetbrains-tests');
  const fs = require('fs'),
    os = require('os'),
    path = require('path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-namespace-'));
  try {
    const source = corpusDirectory(root);
    expect(path.basename(source)).toBe(CORPUS_NAMESPACE);
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'case.txt'), '===\nKnown gap\n:error\n===\nval x=1\n---\n');
    const output = path.join(root, 'output');
    require('./corpus').main([path.dirname(source), output]);
    const claims = JSON.parse(fs.readFileSync(path.join(output, 'cases.json'), 'utf8'));
    expect(Object.values(claims)[0]).toMatchObject({ error: true, psiClean: true });
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
