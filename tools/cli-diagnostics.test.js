import {it,expect} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawnSync} from 'child_process';
const require=createRequire(import.meta.url);
const ROOT=path.resolve(import.meta.dirname,'..');
it('labels a legacy usage exit1 as ERROR and an explicitly typed comparison exit1 as MISMATCH',()=>{
 const legacy=spawnSync(process.execPath,['tools/vendor-fixtures.js','--definitely-unknown'],{cwd:ROOT,encoding:'utf8'});
 expect(legacy.status).toBe(1);expect(legacy.stderr).toContain('Usage:');expect(legacy.stderr).not.toContain('MISMATCH');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'psi-labels-')),file=path.join(dir,'typed.js');
 try{
  fs.writeFileSync(file,`const {runIfMain,mismatchError}=require(${JSON.stringify(path.join(ROOT,'tools/cli'))});runIfMain(module,()=>{throw mismatchError('explicit comparison difference')});`);
  const result=spawnSync(process.execPath,[file],{encoding:'utf8'});
  expect(result.status).toBe(1);expect(result.stderr).toContain('MISMATCH: explicit comparison difference');
 }finally{fs.rmSync(dir,{recursive:true});}
});
