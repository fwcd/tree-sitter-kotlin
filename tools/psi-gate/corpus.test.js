import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseCorpus } = require('./corpus');

describe('parseCorpus', () => {
  it('reads each case with its name, its :error attribute and its input', () => {
    const text = [
      '==================', 'A clean case', '==================', '', 'val x = 1', '', '---', '', '(source_file)', '',
      '==================', 'An error case', ':error', '==================', '', 'val = 1', '---', '',
    ].join('\n');
    expect(parseCorpus(text)).toEqual([
      { name: 'A clean case', error: false, input: 'val x = 1\n' },
      { name: 'An error case', error: true, input: 'val = 1\n' },
    ]);
  });
});
