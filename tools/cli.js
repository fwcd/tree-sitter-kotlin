'use strict';

/**
 * Runs `main` with the command-line arguments when `entry` is the module node started. A thrown
 * error or a rejected promise prints and sets a failing exit code.
 * @param {NodeJS.Module} entry - The calling module (`module`).
 * @param {(args: string[]) => unknown} main
 */
function runIfMain(entry, main) {
  if (require.main !== entry) return;
  const fail = error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  };
  try {
    Promise.resolve(main(process.argv.slice(2))).catch(fail);
  } catch (error) {
    fail(error);
  }
}

module.exports = { runIfMain };
