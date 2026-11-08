import {it, expect, vi} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const config = require('./config').loadConfig();
const {run} = require('./minimize');
const {InspectorPool} = require('./fuzz-compare');
const {resourceError} = require('../resource');
const ROOT = path.resolve(import.meta.dirname, '../..');
const available = require('../psi-oracle/fetch').isFetched();
if (!available) process.stderr.write('Minimizer resource tests skipped; missing: npm run psi-oracle:fetch (verified PSI jars)\n');
it.skipIf(!available)('returns incomplete rather than failure when initial minimizer inspection times out', async () => {
  const spy = vi.spyOn(InspectorPool.prototype, 'inspect').mockRejectedValue(resourceError('request timed out','PSI_ORACLE_TIMEOUT'));
  const message = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await run({file: path.join(ROOT,'tools/psi-gate/grammar-bugs/catalog-empty-quest-span.kt'),config,maxSeconds:10});
    expect(result).toMatchObject({exitCode:2,partial:true,saved:false});
    expect(result).not.toHaveProperty('file');
    expect(message.mock.calls.flat().join(' ')).toMatch(/minimize.*no verified.*--timeout-ms/);
  } finally {spy.mockRestore();message.mockRestore();}
});
it.skipIf(!available)('handles post-inspection expiry after genuine PSI/native work without saving an unverified result', async () => {
  const inspect = InspectorPool.prototype.inspect;
  const spy = vi.spyOn(InspectorPool.prototype,'inspect').mockImplementation(async function(inputs,options){
    const results=await inspect.call(this,inputs,options);
    expect(results[0].accepted).toBe(true);
    vi.spyOn(Date,'now').mockReturnValue(options.deadline);
    return results;
  });
  const message=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {
    const result=await run({file:path.join(ROOT,'tools/psi-gate/grammar-bugs/catalog-empty-quest-span.kt'),config,maxSeconds:10});
    expect(result).toMatchObject({exitCode:2,partial:true,saved:false});
    expect(message.mock.calls.flat().join(' ')).toMatch(/minimize.*--max-seconds/);
    expect(message.mock.calls.flat().join(' ')).not.toContain('PSI fuzz');
  } finally {vi.restoreAllMocks();}
},30000);
