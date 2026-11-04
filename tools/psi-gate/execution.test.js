import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
const require=createRequire(import.meta.url);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const { isFetched }=require('../psi-oracle/fetch');
const { listInputs }=require('../cross-validation/diff-run');
const invoke = (root,out,extra=[],env={}) => spawnSync(process.execPath,
  [path.join(ROOT,'tools/cross-validation/diff-run.js'),'--corpus','audit','--root',root,'--out',out,...extra],
  {cwd:ROOT,encoding:'utf8',timeout:30000,env:{...process.env,...env}});
const output = run => run.stderr+run.stdout;
it('rejects an empty or missing input inventory before starting workers',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'psi-empty-'));
  try {
    const run=invoke(dir,path.join(dir,'report'));expect(run.status).toBe(1);expect(output(run)).toMatch(/empty run/);
    fs.writeFileSync(path.join(dir,'list'),'missing.kt\n');
    expect(()=>listInputs({root:dir,list:path.join(dir,'list')})).toThrow(/Missing/);
  }finally{fs.rmSync(dir,{recursive:true});}
});
const available=isFetched() && fs.existsSync(path.join(ROOT,'build/Release/tree_sitter_kotlin_binding.node'));
describe.skipIf(!available)('actual oracle and worker failures',()=>{
  it('rejects edited cached inputs, incomplete reports and incorrect corpus claims',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'psi-execution-')),input=path.join(dir,'input'),out=path.join(dir,'run');
    fs.mkdirSync(input);const file=path.join(input,'a.kt');fs.writeFileSync(file,'val x=1\n');
    try {
      let run=invoke(input,out);expect(output(run)).toContain('PASS');expect(run.status).toBe(0);
      fs.writeFileSync(file,'val typeof=1\n');run=invoke(input,out);expect(run.status).toBe(1);expect(output(run)).toMatch(/stale/);
      run=invoke(input,out,['--fresh']);expect(run.status).toBe(1);expect(output(run)).toMatch(/difference/);
      fs.rmSync(path.join(out,'shards/00000.jsonl.sha256'));
      run=invoke(input,out,['--report-only']);expect(run.status).toBe(1);
      fs.writeFileSync(file,'fun f() {}\n');fs.writeFileSync(path.join(input,'cases.json'),JSON.stringify({'a.kt':{name:'wrong claim',error:true}}));
      run=invoke(input,out,['--fresh']);expect(run.status).toBe(1);expect(output(run)).toMatch(/corpus-claim/);
    } finally {fs.rmSync(dir,{recursive:true});}
  },30000);
  it('fails invalid UTF-8, a worker startup crash, and a timed-out oracle',()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'psi-crash-')),input=path.join(dir,'input');fs.mkdirSync(input);
    fs.writeFileSync(path.join(input,'a.kt'),Buffer.from([0xff]));
    try {
      let run=invoke(input,path.join(dir,'invalid'));expect(run.status).toBe(1);expect(output(run)).toMatch(/oracle-failure/);
      fs.writeFileSync(path.join(input,'a.kt'),'val x=1\n');
      run=invoke(input,path.join(dir,'worker'),['--grammar','head='+dir]);expect(run.status).toBe(1);expect(output(run)).toMatch(/Worker .*failed/);
      run=invoke(input,path.join(dir,'timeout'),['--timeout-ms','1']);expect(run.status).toBe(1);expect(output(run)).toMatch(/failed|complete/);
    }finally{fs.rmSync(dir,{recursive:true});}
  },30000);
});
