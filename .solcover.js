module.exports = {
  istanbulReporter: ['json-summary', 'lcov', 'text'],
  skipFiles: ['test', 'mocks', 'legacy/', 'gas/', 'v2/'],
  mocha: {
    require: ['ts-node/register/transpile-only', './test/setup.js'],
    files: ['test/coverage/**/*.ts', 'test/coverage/**/*.js'],
    grep: '@coverage-skip',
    invert: true,
    timeout: 300000,
  },
};
