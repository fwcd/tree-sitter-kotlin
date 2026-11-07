import {it,expect} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),ROOT=path.resolve(import.meta.dirname,'../..');
const {sha256}=require('../safety'),{knownInputs}=require('./fuzz-findings');
it('resolves every native ledger ID while sharing all identical same-mode inputs',()=>{
 const dir=path.join(ROOT,'tools/psi-gate/grammar-bugs'),entries=JSON.parse(fs.readFileSync(path.join(dir,'ledger.json')));
 expect(entries).toHaveLength(93);expect(new Set(entries.map(e=>e.file)).size).toBe(71);
 for(const e of entries){expect(sha256(fs.readFileSync(path.join(dir,e.file)))).toBe(e.sourceSha256);expect(sha256(fs.readFileSync(path.join(dir,e.expected)))).toBe(e.expectedSha256);}
 const groups=knownInputs(null,dir),nativeIds=groups.flatMap(g=>g.ids).filter(id=>id.startsWith('g-'));
 expect(nativeIds.sort()).toEqual(entries.map(e=>e.id).sort());
 expect(new Set(groups.map(g=>sha256(Buffer.from(g.input.text))+':'+g.input.extension)).size).toBe(groups.length);
});
it('a must-match alias prevents historical duplicates from becoming a waiver',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'psi-alias-'));
 try{
  const dir=path.join(root,'known'),corpus=path.join(root,'tools/psi-gate/corpus');fs.mkdirSync(dir);fs.mkdirSync(corpus,{recursive:true});
  const text='class C\n';fs.writeFileSync(path.join(dir,'known.kt'),text);fs.writeFileSync(path.join(dir,'psi.json'),'{}');
  fs.writeFileSync(path.join(dir,'ledger.json'),JSON.stringify([{id:'g-example',file:'known.kt',expected:'psi.json',sourceSha256:sha256(text),expectedSha256:sha256('{}')}]));
  fs.writeFileSync(path.join(corpus,'same.kt'),text);execFileSync('git',['init','--quiet',root]);execFileSync('git',['-C',root,'add','tools/psi-gate/corpus/same.kt']);
  const groups=knownInputs(root,dir);expect(groups).toHaveLength(1);expect(groups[0].mustMatch).toBe(true);expect(groups[0].ids).toEqual(['g-example','corpus:tools/psi-gate/corpus/same.kt']);
 }finally{fs.rmSync(root,{recursive:true});}
});
