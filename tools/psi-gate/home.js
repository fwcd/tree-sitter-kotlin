'use strict';

const fs = require('fs');
const path = require('path');
const { resetOutput } = require('../safety');

/** Validate ownership before downloads or dependency installation. */
function assertHome(home) {
  if (!fs.existsSync(home)) return;
  const marker = path.join(home, '.psi-generated');
  if (
    fs.lstatSync(home).isSymbolicLink() ||
    !fs.statSync(home).isDirectory() ||
    (fs.readdirSync(home).length &&
      (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== 'psi-tools\n'))
  ) {
    throw new Error(`--home is not an owned PSI cache: ${home}; choose a new directory`);
  }
}

/** An exclusive lock avoids concurrent extraction/build/report races. */
async function withHome(home, work) {
  assertHome(home);
  if (!fs.existsSync(path.join(home, '.psi-generated'))) resetOutput(home);
  const file = path.join(home, '.run.lock');
  let descriptor;
  try {
    descriptor = fs.openSync(file, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `Another PSI run is using ${home}; wait for it, or remove .run.lock only after confirming its process has stopped`,
      );
    throw error;
  }
  fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid }));
  try {
    return await work();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(file);
  }
}

module.exports = { assertHome, withHome };
