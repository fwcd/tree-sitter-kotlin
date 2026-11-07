import {it, expect, vi} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),ROOT=path.resolve(import.meta.dirname,'../..');
const {run}=require('./minimize'),{InspectorPool}=require('./fuzz-compare');
const config=require('./config').loadConfig();
for(const boundary of ['before inspection','after real inspection']) it(`reports incomplete reduction consistently ${boundary}`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'psi-min-budget-')),file=path.join(dir,'case.kt');
 fs.writeFileSync(file,'val ref = String? ::plus\n');
 const original=InspectorPool.prototype.inspect;
 const output=vi.spyOn(console,'log').mockImplementation(()=>{}),progress=vi.spyOn(console,'error').mockImplementation(()=>{});
 let calls=0;
 vi.spyOn(InspectorPool.prototype,'inspect').mockImplementation(async function(inputs,options){
  calls++;
  if(boundary==='before inspection' && calls===1) vi.spyOn(Date,'now').mockReturnValue(options.deadline);
  const result=await original.call(this,inputs,options);
  if(boundary==='after real inspection' && calls===1){expect(result[0].accepted).toBe(true);expect(result[0].classes.length).toBeGreaterThan(0);vi.spyOn(Date,'now').mockReturnValue(options.deadline);}
  return result;
 });
 let result;
 try{
  result=await run({file,config,maxSeconds:30});
  expect(result).toMatchObject({exitCode:2,partial:true});
  expect(JSON.parse(fs.readFileSync(result.indexPath))).toMatchObject({entries:[],partial:true,stopReason:'time-budget'});
  expect(progress.mock.calls.flat().join('\n')).toContain('minimize: resource budget exhausted');
  expect(progress.mock.calls.flat().join('\n')).toContain('--max-seconds');
  expect([...output.mock.calls.flat(),...progress.mock.calls.flat()].join('\n')).not.toContain('PSI fuzz time budget exhausted');
 }finally{vi.restoreAllMocks();fs.rmSync(dir,{recursive:true});if(result)fs.rmSync(path.dirname(result.indexPath),{recursive:true});}
},60000);
