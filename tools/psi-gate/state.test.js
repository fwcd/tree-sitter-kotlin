import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const state = require('./state');
const { sha256, confined, resetOutput } = require('../safety');
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psi-state-'));
const result = (verdict, key = 'A same bucket', treeHash = 'same') => ({ verdict, key, treeHash });
const record = (name, base, head) => ({ path: name, sha256: 'source', psiErrors: 0, results: { base, head } });

describe('per-input gating', () => {
  it('fails a count swap, even when one old failure is fixed', () => {
    const records = [record('fixed.kt',result('A'),result('ok')),record('regressed.kt',result('ok'),result('A'))];
    expect(state.gate(records,'head',{base:'base'}).failures.map(f => f.path)).toEqual(['regressed.kt']);
  });
  it('does not hide changed recovery behind the same first error', () => {
    const r = record('a.kt', result('both-error'), result('both-error', 'A same bucket', 'different'));
    expect(state.gate([r], 'head', {base:'base'}).failures[0].kind).toBe('changed-recovery');
  });
  it('fails oracle/harness failures on either grammar, and cannot snapshot them', () => {
    for (const failure of ['oracle-failure','harness-error']) {
      const records = [record('a.kt',result(failure),result('ok'))];
      expect(state.gate(records,'head',{base:'base'}).failures[0].kind).toBe(failure);
      expect(() => state.snapshot({context:{}},records,'base',{})).toThrow(/execution failure/);
    }
  });
  it('does not hide an incorrect :error claim behind identical clean parsers', () => {
    const r = record('a.kt',result('ok'),result('ok')); r.claim = {name:'incorrect error expectation',error:true};
    expect(state.gate([r],'head',{base:'base'}).failures[0].kind).toBe('corpus-claim');
    expect(() => state.snapshot({context:{}},[r],'head',{})).toThrow(/assertion mismatch/);
  });
  it('preserves unchanged gaps only in regression mode; changed trees and conformance fail', () => {
    const r = record('a.kt',result('A'),result('A'));
    expect(state.gate([r],'head',{base:'base'}).failures).toEqual([]);
    expect(state.gate([r],'head',{base:'base',conformance:true}).failures).toHaveLength(1);
    r.results.head.treeHash='different';
    expect(state.gate([r],'head',{base:'base'}).failures).toHaveLength(1);
  });
  it('uses only exact source/signature snapshots and rejects changed input identity', () => {
    const r = record('a.kt',result('A'),result('A'));
    const snap = state.snapshot({context:{inputs:'pinned'}},[r],'base',{});
    expect(state.gate([r],'head',{expected:snap}).failures).toEqual([]);
    r.sha256='changed';
    expect(state.gate([r],'head',{expected:snap}).failures).toHaveLength(1);
    const dir=root(), file=path.join(dir,'expected.json');fs.writeFileSync(file,JSON.stringify(snap));
    try { expect(() => state.loadExpected(file,{inputs:'other'})).toThrow(/does not match/); }
    finally {fs.rmSync(dir,{recursive:true});}
  });
});
describe('complete cache and confined output', () => {
  it('identifies runtime source and binary bytes, not just package version', () => {
    const dir=root(), sdk=path.join(dir,'node_modules/tree-sitter');fs.mkdirSync(path.join(sdk,'build/Release'),{recursive:true});
    fs.writeFileSync(path.join(sdk,'package.json'),JSON.stringify({name:'tree-sitter',version:'0.25.1',main:'index.js'}));
    fs.writeFileSync(path.join(sdk,'index.js'),'first');fs.writeFileSync(path.join(sdk,'build/Release/runtime.node'),'binary');
    try { const first=state.runtimeIdentity(dir);fs.writeFileSync(path.join(sdk,'index.js'),'changed');expect(state.runtimeIdentity(dir)).not.toBe(first);
      const second=state.runtimeIdentity(dir);fs.writeFileSync(path.join(sdk,'build/Release/runtime.node'),'other binary');expect(state.runtimeIdentity(dir)).not.toBe(second);
    }finally{fs.rmSync(dir,{recursive:true});}
  });
  it('rejects partial, corrupted and misaligned shard inventories', () => {
    const dir=root();fs.mkdirSync(path.join(dir,'shards'));
    const r=record('a.kt',result('ok'),result('ok'));
    const current={sources:[{path:'a.kt',sha256:'source'}],shardSize:1,grammars:[{label:'base'},{label:'head'}]};
    const file=path.join(dir,'shards/00000.jsonl');
    const write = rows => {const bytes=rows.map(r=>JSON.stringify(r)).join('\n')+'\n';fs.writeFileSync(file,bytes);fs.writeFileSync(file+'.sha256',sha256(bytes));};
    try {
      expect(() => state.complete(dir,current)).toThrow(/partial/);
      write([r]);expect(state.complete(dir,current)).toHaveLength(1);
      fs.appendFileSync(file,'bad');expect(() => state.complete(dir,current)).toThrow(/Corrupt/);
      write([]);expect(() => state.complete(dir,current)).toThrow(/Partial/);
      write([{...r,path:'different.kt'}]);expect(() => state.complete(dir,current)).toThrow(/Misaligned/);
    } finally {fs.rmSync(dir,{recursive:true});}
  });
  it('rejects traversal and symlink escape without touching the outside file', () => {
    const dir=root(), outside=root();fs.writeFileSync(path.join(outside,'a.kt'),'safe');
    try {
      expect(() => confined(dir,'../outside/a.kt')).toThrow(/Unsafe/);
      fs.symlinkSync(outside,path.join(dir,'escape'),'dir');
      expect(() => confined(dir,'escape/a.kt')).toThrow(/escapes/);
      expect(fs.readFileSync(path.join(outside,'a.kt'),'utf8')).toBe('safe');
    } finally {fs.rmSync(dir,{recursive:true});fs.rmSync(outside,{recursive:true});}
  });
  it('never deletes an unmarked directory or overlapping source', () => {
    const dir=root();fs.writeFileSync(path.join(dir,'keep.txt'),'keep');
    try {
      expect(() => resetOutput(dir)).toThrow(/unmarked/);
      expect(() => resetOutput(dir,dir)).toThrow(/separate/);
      expect(fs.readFileSync(path.join(dir,'keep.txt'),'utf8')).toBe('keep');
    } finally {fs.rmSync(dir,{recursive:true});}
  });
});
