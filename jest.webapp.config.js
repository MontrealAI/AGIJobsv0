module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/apps/console/__tests__', '<rootDir>/apps/console/src'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      { tsconfig: 'tsconfig.webapp-tests.json', diagnostics: false },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.webapp.ts'],
  testMatch: ['<rootDir>/apps/console/__tests__/e2e/**/*.test.ts?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/apps/console/src/$1',
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/client$': '<rootDir>/node_modules/react-dom/client',
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
};
