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
  for (;;) {
    try {
      descriptor = fs.openSync(file, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = fs.statSync(file);
      let pid;
      try {
        pid = JSON.parse(fs.readFileSync(file, 'utf8')).pid;
      } catch {
        throw new Error(`Invalid PSI lock in ${home}; inspect .run.lock before removing it`);
      }
      if (!Number.isInteger(pid) || pid < 1) throw new Error(`Invalid PSI lock PID in ${home}`);
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (failure) {
        if (failure.code === 'ESRCH') alive = false;
        else if (failure.code !== 'EPERM') throw failure;
      }
      if (alive) throw new Error(`Another PSI run (PID ${pid}) is using ${home}; wait for it`);
      // Another claimant may already have replaced the stale lock.
      try {
        const current = fs.statSync(file);
        if (current.ino === stat.ino && current.mtimeMs === stat.mtimeMs) fs.unlinkSync(file);
      } catch (failure) {
        if (failure.code !== 'ENOENT') throw failure;
      }
    }
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
