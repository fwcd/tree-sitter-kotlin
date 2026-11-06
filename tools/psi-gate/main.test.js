import { it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { argumentsOf, prerequisites } = require('./main');
const { normalizeTs } = require('../cross-validation/normalizer');
const { Node } = require('../cross-validation/models');
it('rejects removed relative options and invalid v2 inputs before work', () => {
  expect(() => argumentsOf(['quick', '--jobs', '0'])).toThrow(/integer/);
  for (const option of ['--corpora', '--base', '--expected', '--promote'])
    expect(() => argumentsOf(['quick', option, 'x'])).toThrow(/removed/);
  expect(() => argumentsOf(['fuzz', '--seed', 'x', '--promote'])).toThrow(/removed/);
  expect(() => argumentsOf(['repo'])).toThrow(/Git folder/);
});
it('requires an explicit mapping for unknown grammar nodes', () => {
  expect(() => normalizeTs(new Node('unrecognized_new_rule'))).toThrow(/Unknown tree-sitter node/);
});

it('resets an interrupted native parser before the next input', () => {
  let reset = false;
  const parser = {
    parse: () => null,
    getTimeoutMicros: () => 1000,
    reset: () => {
      reset = true;
    },
  };
  expect(() => require('../cross-validation/diff-execute').parseText(parser, 'val x=1')).toThrow(
    /Native parser timed out/,
  );
  expect(reset).toBe(true);
});

it('uses installed bindings without probing a separate compiler or JVM for quick', () => {
  const oldCompiler = process.env.CXX, oldJava = process.env.PSI_JAVA;
  process.env.CXX = '/missing-compiler'; process.env.PSI_JAVA = '/missing-java';
  try {
    expect(() => prerequisites({ java: false })).not.toThrow();
    expect(() => require('./runtime').createParser()).not.toThrow();
    expect(() => prerequisites()).toThrow(/Java|java|JRE/);
  } finally {
    if (oldCompiler === undefined) delete process.env.CXX; else process.env.CXX = oldCompiler;
    if (oldJava === undefined) delete process.env.PSI_JAVA; else process.env.PSI_JAVA = oldJava;
  }
});
