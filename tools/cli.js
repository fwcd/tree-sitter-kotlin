'use strict';

/**
 * Runs `main` with the command-line arguments when `entry` is the module node started. A thrown
 * error or a rejected promise prints and sets a failing exit code.
 * @param {NodeJS.Module} entry - The calling module (`module`).
 * @param {(args: string[]) => unknown} main
 */
function runIfMain(entry, main) {
  if (require.main !== entry) return;
  const fail = (error) => {
    console.error(
      process.env.PSI_DEBUG === '1' ? error.stack || error.message : error.message || String(error),
    );
    process.exitCode = 1;
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
