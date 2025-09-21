module.exports = {
  istanbulReporter: ['json-summary', 'lcov', 'text'],
  skipFiles: ['legacy', 'mocks', 'test'],
  testCommand: 'COVERAGE_ONLY=1 npx hardhat test',
};
