module.exports = {
  istanbulReporter: ['json-summary', 'lcov', 'text'],
  skipFiles: ['contracts/test', 'contracts/mocks'],
  mocha: { grep: '@coverage-skip', invert: true },
};
