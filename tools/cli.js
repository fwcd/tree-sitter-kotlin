'use strict';
const {isResourceError, resourceMessage} = require('./resource');
const EXIT = Object.freeze({PASS: 0, MISMATCH: 1, RESOURCE: 2, SETUP: 3});
const EXIT_HELP = 'Exit codes: 0 pass/complete; 1 genuine comparison mismatch; 2 resource budget (incomplete); 3 setup/acquisition/oracle/usage error.';
function mismatchError(message) {return Object.assign(new Error(message), {code: 'PSI_MISMATCH', exitCode: EXIT.MISMATCH});}
function exitCodeFor(error, setup = EXIT.SETUP) {return isResourceError(error) ? EXIT.RESOURCE : error.exitCode || setup;}
function verdictFor(code) {return ['PASS','FAIL','INCOMPLETE','ERROR'][code] || 'ERROR';}

/**
 * Runs `main` with the command-line arguments when `entry` is the module node started. A thrown
 * error or a rejected promise prints and sets a failing exit code.
 * @param {NodeJS.Module} entry - The calling module (`module`).
 * @param {(args: string[]) => unknown} main
 */
function runIfMain(entry, main, {setupExitCode = EXIT.SETUP, command} = {}) {
  if (require.main !== entry) return;
  const fail = (error) => {
    console.error(
      isResourceError(error) ? resourceMessage(error.command || command || process.argv[2] || 'PSI check', error) :
      process.env.PSI_DEBUG === '1' ? error.stack || error.message : error.message || String(error),
    );
    process.exitCode = exitCodeFor(error, setupExitCode);
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

module.exports = {runIfMain, EXIT, EXIT_HELP, mismatchError, exitCodeFor, verdictFor};
