'use strict';
const CODES = new Set(['PSI_FUZZ_BUDGET', 'PSI_ORACLE_TIMEOUT', 'PSI_NATIVE_TIMEOUT', 'ETIMEDOUT']);
function resourceError(message, code) {return Object.assign(new Error(message), {code, exitCode: 2});}
function isResourceError(error) {return CODES.has(error?.code);}
function resourceMessage(command, error) {
  const flag = error.code === 'PSI_NATIVE_TIMEOUT' ? '--parse-timeout-ms' :
    error.code === 'PSI_ORACLE_TIMEOUT' ? '--timeout-ms' : '--max-seconds';
  return `${command}: resource budget exhausted (${error.message}). No complete verdict; retry with a larger ${flag}.`;
}
module.exports = {resourceError, isResourceError, resourceMessage};
