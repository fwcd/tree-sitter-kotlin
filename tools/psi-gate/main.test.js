import { it, expect } from 'vitest';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const { argumentsOf, prerequisites }=require('./main');
const { parseArgs }=require('../cross-validation/diff-run');
const { normalizeTs }=require('../cross-validation/normalizer');
const { Node }=require('../cross-validation/models');
it('checks invalid arguments and missing IDEA prerequisites before work',()=>{
  expect(()=>argumentsOf(['quick','--jobs','0'])).toThrow(/integer/);
  expect(()=>argumentsOf(['quick','--corpora','unknown'])).toThrow(/supported/);
  expect(()=>parseArgs(['--corpus','x','--root','.','--grammar','bad'])).toThrow(/LABEL=DIR/);
  expect(()=>argumentsOf(['update-expected'])).toThrow(/requires/);
  const oldRoot=process.env.IDEA_ROOT, oldRev=process.env.IDEA_REV;
  delete process.env.IDEA_ROOT;delete process.env.IDEA_REV;
  try {expect(()=>prerequisites({corpora:['idea']})).toThrow(/IDEA_ROOT/);}
  finally {if(oldRoot)process.env.IDEA_ROOT=oldRoot;if(oldRev)process.env.IDEA_REV=oldRev;}
});
it('requires an explicit mapping for unknown grammar nodes',()=>{
  expect(()=>normalizeTs(new Node('unrecognized_new_rule'))).toThrow(/Unknown tree-sitter node/);
});
