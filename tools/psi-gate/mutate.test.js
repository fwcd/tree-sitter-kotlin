import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { tokenize, mutantsOf, pick, generator } = require('./mutate');

const SOURCE = [
  'package a.b',
  'import c.d',
  '',
  'fun f(x: X) {',
  '    loop@ while (x.ok) { break@loop }',
  "    val c = 'a'",
  '    g(); h()',
  '    x?.y',
  '}',
  '',
].join('\n');

const byDir = (mutants, dir) => mutants.filter(mutant => mutant.dir === dir).map(mutant => mutant.text);

describe('tokenize', () => {
  it('keeps a range a number and records lines', () => {
    expect(tokenize('1..2').map(t => t.text)).toEqual(['1', '..', '2']);
    expect(tokenize("a\n'b'").map(t => [t.kind, t.line])).toEqual([['word', 1], ['char', 2]]);
  });
});

describe('mutantsOf', () => {
  const mutants = mutantsOf(SOURCE, { perFile: 100 });

  it('changes one place per mutant', () => {
    for (const text of byDir(mutants, 'comment-between-tokens')) expect(text.split('/*c*/')).toHaveLength(2);
    for (const text of byDir(mutants, 'break-before')) expect(text.split('\n')).toHaveLength(SOURCE.split('\n').length + 1);
  });

  it('puts keywords only in selectors of expressions, not of the header', () => {
    const selectors = byDir(mutants, 'keyword-selector/fun');
    expect(selectors).toContain(SOURCE.replace('x.ok', 'x.fun'));
    expect(selectors).toContain(SOURCE.replace('x?.y', 'x?.fun'));
    expect(selectors.some(text => text.includes('a.fun') || text.includes('c.fun'))).toBe(false);
  });

  it('covers the trivia, names, separators, modifiers, literals and bodies of the operators', () => {
    expect(byDir(mutants, 'trivia-after/space')).toContain(SOURCE.replace('break@loop', 'break@ loop'));
    expect(byDir(mutants, 'backtick-name')).toContain(SOURCE.replace('loop@ while', '`loop`@ while'));
    expect(byDir(mutants, 'parenthesize')).toContain(SOURCE.replace('x?.y', '(x)?.y'));
    expect(byDir(mutants, 'double-semi')).toContain(SOURCE.replace('g(); h()', 'g();; h()'));
    expect(byDir(mutants, 'join-lines/double-semi').some(text => text.includes('h();; x?.y'))).toBe(true);
    expect(byDir(mutants, 'modifier-run/9x3')).toContain(SOURCE.replace('    val c',
      '    private private private\n    private private private\n    private private private\n    val c'));
    expect(byDir(mutants, 'char-content/0')).toContain(SOURCE.replace("'a'", "'\\q'"));
    expect(byDir(mutants, 'drop-body')).toContain('package a.b\nimport c.d\n\nfun f(x: X)\n');
    expect(byDir(mutants, 'unicode-latin')).toHaveLength(1);
  });

  it('picks sites by a seeded generator, the same each run', () => {
    expect(mutantsOf(SOURCE, { perFile: 1, rel: 'a.kt' })).toEqual(mutantsOf(SOURCE, { perFile: 1, rel: 'a.kt' }));
    expect(pick([1, 2, 3, 4, 5], 2, generator('s'))).toHaveLength(2);
    expect(pick([1, 2], 5, generator('s'))).toEqual([1, 2]);
  });
});
