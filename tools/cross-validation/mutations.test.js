import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generateMutations, names, REVIEW_329, NAME_TEMPLATES } = require('./mutations');

describe('mutations', () => {
  const snippets = generateMutations();

  it('gives every snippet a unique id', () => {
    expect(new Set(snippets.map(snippet => snippet.id + snippet.extension)).size).toBe(snippets.length);
  });

  it('fills each name template with every name, typeof and backticked keywords included', () => {
    expect(names()).toEqual(expect.arrayContaining(['typeof', 'interface', 'value', 'out', '`if`', '`x`']));
    for (const [group] of NAME_TEMPLATES) {
      expect(snippets.filter(snippet => snippet.group === group)).toHaveLength(names().length);
    }
    expect(snippets.map(snippet => snippet.text)).toContain('fun f() {\n    `if`@ while (true) {}\n}\n');
    expect(snippets.map(snippet => snippet.text)).toContain('val s = "$`if`"\n');
  });

  it('covers the shapes around the review findings', () => {
    const texts = snippets.map(snippet => snippet.text);
    expect(texts).toContain('fun f() {\n    if (c) fun g() {}\n}\n');
    expect(texts).toContain('fun a() {} @A fun b() {}\n');
    expect(texts).toContain('class C : I by throw x { fun m() {} }\n');
    expect(texts).toContain('class C : I by x<T>\n{ fun m() {} }\n');
    expect(texts).toContain('fun f() {\n    1 < interface I {}\n}\n');
    expect(texts).toContain('fun f() {\n    [val a, b] = p\n}\n');
  });
});

describe('review-329', () => {
  it('holds the thirteen review snippets', () => {
    expect(REVIEW_329).toHaveLength(13);
    expect(REVIEW_329.map(snippet => snippet.text)).toContain('fun f() { class@ foo() }\n');
  });
});
