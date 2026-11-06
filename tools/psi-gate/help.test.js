import {it, expect} from 'vitest';
import {createRequire} from 'module';
import {spawnSync} from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);
const {commandHelp, HELP, argumentsOf} = require('./options');
const ROOT = path.resolve(import.meta.dirname, '../..');
it('lists options for each command without requiring live setup', () => {
  for (const command of ['quick', 'full', 'repo', 'regenerate-expectations', 'coverage', 'minimize', 'add', 'fuzz']) {
    const result = spawnSync(process.execPath, ['tools/psi-gate/main.js', command, '--help'], {
      cwd: ROOT, encoding: 'utf8', env: {...process.env, PSI_JAVA: '/missing-java'}, timeout: 10000});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`Usage: npm run psi-gate -- ${command}`);
    expect(result.stdout.trim()).toBe(commandHelp(command).trim());
    expect(result.stdout).not.toBe(HELP);
  }
  expect(commandHelp('minimize')).toContain('--class ID');
  expect(commandHelp('minimize')).not.toContain('--max-inputs');
  expect(commandHelp('fuzz')).toContain('--fixtures DIR');
  expect(commandHelp('quick')).not.toContain('--timeout-ms');
  expect(() => argumentsOf(['fuzz', '--jobs', '4'])).toThrow(/integer/);
});
