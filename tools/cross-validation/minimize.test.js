import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { candidatesOf, reduce, tokenize, minimizeText } = require('./minimize');

describe('candidatesOf', () => {
  it('deletes halves, quarters and single units, never everything', () => {
    const candidates = candidatesOf(['a', 'b', 'c', 'd']).map(units => units.join(''));
    expect(candidates).toContain('cd');
    expect(candidates).toContain('ab');
    expect(candidates).toContain('acd');
    expect(candidates).not.toContain('');
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe('reduce', () => {
  it('keeps only the units the property needs', async () => {
    const units = 'abcdefghijklmnop'.split('');
    const holds = candidates => Promise.resolve(candidates.map(units => units.includes('c') && units.includes('m')));
    expect((await reduce(units, holds)).join('')).toBe('cm');
  });

  it('returns the input when no deletion keeps the property', async () => {
    const units = ['x', 'y'];
    expect(await reduce(units, candidates => Promise.resolve(candidates.map(() => false)))).toEqual(units);
  });
});

describe('tokenize', () => {
  it('round-trips the text and keeps backticked names and strings whole', () => {
    const text = 'fun f() { `if`@ while (x.y) { "a b" } }\n';
    const tokens = tokenize(text);
    expect(tokens.join('')).toBe(text);
    expect(tokens).toContain('`if`');
    expect(tokens).toContain('"a b"');
  });
});

describe('minimizeText', () => {
  it('reduces lines, then tokens', async () => {
    const text = 'fun a() {}\nfun f() { x.this }\nval y = 2\n';
    const holds = texts => Promise.resolve(texts.map(t => /\.this/.test(t)));
    expect(await minimizeText(text, holds)).toBe('.this\n');
  });
});
