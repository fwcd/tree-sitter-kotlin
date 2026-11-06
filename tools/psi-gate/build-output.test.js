import {it, expect, vi} from 'vitest';
import {createRequire} from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const {runTool} = require('../../bindings/node/build');
it('keeps successful tool output quiet but shows complete failure diagnostics', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-output-')), file = path.join(root, 'tool.js');
  const output = [], spy = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {output.push(String(chunk)); return true;});
  try {
    fs.writeFileSync(file, 'console.log("gyp info noisy success");\n');
    await runTool(file, [], root, 'Building fixture');
    expect(output.join('')).toContain('Building fixture...');
    expect(output.join('')).not.toContain('noisy success');
    fs.writeFileSync(file, 'console.error("gyp WARN keep this warning");\n');
    await runTool(file, [], root, 'Building fixture');
    expect(output.join('')).toContain('gyp WARN keep this warning');
    fs.writeFileSync(file, 'console.error("fatal: actionable compiler failure");process.exit(7);\n');
    await expect(runTool(file, [], root, 'Building fixture')).rejects.toThrow(/failed/);
    expect(output.join('')).toContain('fatal: actionable compiler failure');
  } finally {spy.mockRestore(); fs.rmSync(root, {recursive: true});}
});
