'use strict';

class BudgetExceeded extends Error {
  constructor() {
    super('PSI fuzz time budget exhausted');
    this.code = 'PSI_FUZZ_BUDGET';
  }
}

function remaining(deadline = Infinity) {
  const milliseconds = deadline - Date.now();
  if (milliseconds <= 0) throw new BudgetExceeded();
  return milliseconds;
}

module.exports = { BudgetExceeded, remaining };
