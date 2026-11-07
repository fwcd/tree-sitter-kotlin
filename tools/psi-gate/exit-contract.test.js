import {it,expect} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {spawnSync} from 'child_process';
const require=createRequire(import.meta.url);
const ROOT=path.resolve(import.meta.dirname,'../..');
const {EXIT}=require('../cli');
it('keeps codes and stdout shape uniform at every actual command/alias dispatch boundary',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'psi-exit-contract-')), preload=path.join(dir,'backend.cjs'), artifact=path.join(dir,'verified.kt');
 fs.writeFileSync(artifact,'val verified=1\n');
 fs.writeFileSync(preload,`
 const Module=require('module'), original=Module._load;
 const {mismatchError}=require(${JSON.stringify(path.join(ROOT,'tools/cli'))});
 const {resourceError}=require(${JSON.stringify(path.join(ROOT,'tools/resource'))});
 const root=${JSON.stringify(ROOT)}, artifact=${JSON.stringify(artifact)}, mode=Number(process.env.PROBE_OUTCOME);
 function outcome(){if(mode===1)throw mismatchError('controlled comparison mismatch');if(mode===2)throw resourceError('controlled resource expiry','PSI_NATIVE_TIMEOUT');if(mode===3)throw Error('controlled setup failure');}
 Module._load=function(name,parent,isMain){
  const value=original.apply(this,arguments);let file;try{file=Module._resolveFilename(name,parent);}catch{return value;}
  if(file===root+'/tools/psi-gate/runtime.js')return {...value,prerequisites(){},createParser(){return {};}};
  if(file===root+'/bindings/node/build.js')return {...value,assertFresh(){return {source:{hash:'stable'}};}};
  if(file===root+'/tools/psi-oracle/fetch.js')return {...value,fetchAll:async()=>[]};
  if(file===root+'/tools/psi-gate/repository.js')return {...value,inspectRepository:()=>({root,commit:'test'}),selectFiles:()=>({files:['fixture.kt'],excluded:[]}),fetchRepositories:async()=>[]};
  if(file===root+'/tools/psi-gate/check.js')return {...value,checkFiles:async()=>{if(mode===2||mode===3)outcome();return {exitCode:mode,files:1,mismatches:mode===1?[{path:'fixture.kt',verdict:'C',key:'controlled comparison mismatch'}]:[]};}};
  if(file===root+'/tools/psi-gate/quick.js'){
   value.run=async options=>{if(mode===3)outcome();const result={exitCode:mode,rows:mode===1?[{path:'fixture.kt',verdict:'C'}]:[],counts:{selected:1,mismatching:mode===1?1:0,incomplete:mode===2?1:0,errors:0},reportPath:artifact};if(options.emit!==false)value.printResult(result);return result;};
   value.regenerate=async()=>{outcome();console.log('regenerate-expectations: PASS');return {exitCode:0};};return value;
  }
  if(file===root+'/tools/psi-gate/quick-coverage.js')return {...value,measure:async()=>{outcome();console.log(artifact);return {};}};
  if(['add.js','minimize.js','fuzz.js'].some(x=>file===root+'/tools/psi-gate/'+x))value.run=async()=>{outcome();console.log(artifact);return {exitCode:0};};
  return value;
 };
 `);
 try{
  const routes=['quick','full','repo','regenerate-expectations','coverage','minimize','add','fuzz','direct-fuzz','npm-psi-fuzz'];
  for(const route of routes)for(const code of Object.values(EXIT)){
   const home=path.join(dir,route+'-'+code);let command='node',args=['--require',preload,'tools/psi-gate/main.js',route];
   if(['add','minimize'].includes(route))args.push(artifact);if(route==='repo')args.push(ROOT);
   if(route==='direct-fuzz')args=['--require',preload,'tools/psi-gate/fuzz.js'];
   if(route==='npm-psi-fuzz'){command='npm';args=['run','--silent','psi-fuzz','--'];}
   args.push('--home',home);
   const result=spawnSync(command,args,{cwd:ROOT,encoding:'utf8',timeout:10000,
    env:{...process.env,PROBE_OUTCOME:String(code),NODE_OPTIONS:route==='npm-psi-fuzz'?'--require='+preload:''}});
   expect(result.status,route+'/'+code+'\n'+result.stdout+'\n'+result.stderr).toBe(code);
   const lines=result.stdout.trim().split('\n').filter(Boolean);
   if(['add','minimize','coverage','fuzz','direct-fuzz','npm-psi-fuzz'].includes(route))
    expect(lines.every(line=>line===artifact),route+'/'+code+'\n'+result.stdout).toBe(true);
   if(['quick','full','repo'].includes(route)&&code===3){
    expect(result.stdout).toContain('ERROR');expect(result.stdout).not.toContain('files mismatching');
   }
   if(route==='repo'&&code===0){expect(result.stdout).toContain('repo: PASS');expect(result.stderr).toContain('repo: completed in');}
  }
 }finally{fs.rmSync(dir,{recursive:true});}
},30000);
