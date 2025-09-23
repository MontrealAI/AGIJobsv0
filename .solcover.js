module.exports = {
  istanbulReporter: ['json-summary', 'lcov', 'text'],
  skipFiles: ['contracts/test', 'contracts/mocks'],
  mocha: {
    require: ['ts-node/register/transpile-only', './test/setup.js'],
    grep: '@coverage-skip',
    invert: true,
    timeout: 300000,
  },
};
