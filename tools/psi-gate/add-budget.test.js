import {it,expect,beforeAll,afterAll} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),ROOT=path.resolve(import.meta.dirname,'../..');
const available=require('../psi-oracle/fetch').isFetched();
if(!available)process.stderr.write('Admission budget tests skipped; missing: npm run psi-oracle:fetch (verified PSI jars)\n');
let directory,root,source;
beforeAll(()=>{
 if(!available)return;
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'psi-add-budgets-'));root=path.join(directory,'repo');
 execFileSync('git',['clone','--quiet','--no-hardlinks',ROOT,root]);
 fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(root,'node_modules'),'dir');
 fs.cpSync(path.join(ROOT,'build'),path.join(root,'build'),{recursive:true});
 fs.cpSync(path.join(ROOT,'tools/psi-oracle/lib'),path.join(root,'tools/psi-oracle/lib'),{recursive:true});
 fs.copyFileSync(path.join(ROOT,'tools/psi-gate/add.js'),path.join(root,'tools/psi-gate/add.js'));
 source=path.join(directory,'selected.kt');fs.writeFileSync(source,'fun uniqueAdmissionBudgetCase()=123\n');
});
afterAll(()=>{if(directory)fs.rmSync(directory,{recursive:true});});
const index=()=>execFileSync('git',['-C',root,'ls-files','--stage']);
it.skipIf(!available)('honors the literal add CLI oracle budget and preserves the index on incomplete verification',()=>{
 const observer=path.join(directory,'oracle-observer.cjs'),seen=path.join(directory,'observed.json');
 fs.writeFileSync(observer,`const fs=require('fs');const o=require(${JSON.stringify(path.join(root,'tools/psi-oracle/oracle'))});const real=o.runOracleAsync;o.runOracleAsync=(files,options)=>{fs.writeFileSync(${JSON.stringify(seen)},JSON.stringify({timeoutMs:options.timeoutMs}));return real(files,options)};`);
 const before=index(),result=spawnSync(process.execPath,['--require',observer,'tools/psi-gate/main.js','add',source,'--timeout-ms','1'],{cwd:root,encoding:'utf8',timeout:30000});
 expect(JSON.parse(fs.readFileSync(seen))).toEqual({timeoutMs:1});
 expect(result.status,result.stderr).toBe(2);expect(result.stderr).toMatch(/add.*--timeout-ms/);
 expect(result.stdout).not.toContain('Added:');expect(index()).toEqual(before);
});
it.skipIf(!available)('types native cancellation at the real comparison boundary with an add-specific remedy',()=>{
 const cancel=path.join(directory,'cancel.cjs');
 fs.writeFileSync(cancel,`const Parser=require(${JSON.stringify(path.join(root,'node_modules/tree-sitter'))});Parser.prototype.parse=function(){return null};`);
 const before=index(),result=spawnSync(process.execPath,['--require',cancel,'tools/psi-gate/main.js','add',source,'--parse-timeout-ms','10'],{cwd:root,encoding:'utf8',timeout:30000});
 expect(result.status,result.stderr).toBe(2);expect(result.stderr).toMatch(/add.*Native admission parse.*--parse-timeout-ms/);
 expect(result.stderr).not.toContain('quick parse');expect(result.stdout).not.toContain('Added:');expect(index()).toEqual(before);
});
