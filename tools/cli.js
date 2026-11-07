'use strict';
const {isResourceError, resourceMessage} = require('./resource');

/**
 * Runs `main` with the command-line arguments when `entry` is the module node started. A thrown
 * error or a rejected promise prints and sets a failing exit code.
 * @param {NodeJS.Module} entry - The calling module (`module`).
 * @param {(args: string[]) => unknown} main
 */
function runIfMain(entry, main, {setupExitCode = 1} = {}) {
  if (require.main !== entry) return;
  const fail = (error) => {
    console.error(
      isResourceError(error) ? resourceMessage(process.argv[2] || 'PSI check', error) :
      process.env.PSI_DEBUG === '1' ? error.stack || error.message : error.message || String(error),
    );
    process.exitCode = isResourceError(error) ? 2 : error.exitCode || setupExitCode;
  };
  try {
    Promise.resolve(main(process.argv.slice(2)))
      .then((result) => {
        if (result && Number.isInteger(result.exitCode)) process.exitCode = result.exitCode;
      })
      .catch(fail);
  } catch (error) {
    fail(error);
  }
}

module.exports = { runIfMain };
