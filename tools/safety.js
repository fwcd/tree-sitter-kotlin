'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const inside = (root, target) => {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
};
function canonical(file) {
  const absolute = path.resolve(file);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  const parent = path.dirname(absolute);
  return parent === absolute ? absolute : path.join(canonical(parent), path.basename(absolute));
}
function confined(root, relative) {
  if (
    typeof relative !== 'string' ||
    !relative ||
    /^[\\/]|^[A-Za-z]:|[\r\n\t\0]/.test(relative) ||
    relative.split(/[\\/]/).includes('..')
  )
    throw new Error(`Unsafe relative input path: ${relative}`);
  const target = path.resolve(root, relative);
  if (!inside(canonical(root), canonical(target)))
    throw new Error(`Path escapes its root: ${relative}`);
  return target;
}
function resetOutput(output, source) {
  const target = canonical(output);
  if (source && (inside(canonical(source), target) || inside(target, canonical(source)))) {
    throw new Error('Output and source directories must be separate');
  }
  const marker = path.join(output, '.psi-generated');
  if (fs.existsSync(output)) {
    if (
      fs.lstatSync(output).isSymbolicLink() ||
      (fs.readdirSync(output).length &&
        (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== 'psi-tools\n'))
    ) {
      throw new Error(
        `Refusing to replace an unmarked output directory: ${output}; choose a new directory`,
      );
    }
    fs.rmSync(output, { recursive: true });
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(marker, 'psi-tools\n');
}
function positive(value, name, maximum = 3600000) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > maximum)
    throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  return n;
}
function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    throw new Error(
      `${command} failed: ${String(error.stderr || error.message)
        .trim()
        .slice(0, 8192)}`,
    );
  }
}
function javaDetails() {
  const java = process.env.PSI_JAVA || 'java';
  const result = spawnSync(java, ['-version'], { encoding: 'utf8', timeout: 10000 });
  const version = /version "(?:1\.)?(\d+)/.exec((result.stderr || '') + (result.stdout || ''));
  if (result.error || result.status !== 0 || !version || Number(version[1]) < 17) {
    throw new Error(
      'A JRE 17+ is required. Put java on PATH, or set PSI_JAVA to its executable.',
    );
  }
  return {
    executable: java,
    feature: Number(version[1]),
    version: ((result.stderr || '') + (result.stdout || ''))
      .split(/\r?\n/)
      .filter((line) => /^(?:openjdk|java|Java|OpenJDK)/.test(line))
      .join('\n'),
  };
}
function javaExecutable() {
  return javaDetails().executable;
}
module.exports = {
  sha256,
  inside,
  canonical,
  confined,
  resetOutput,
  positive,
  run,
  javaExecutable,
  javaDetails,
};
