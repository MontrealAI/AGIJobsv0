module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname
  },
  plugins: ['@typescript-eslint', 'import', 'promise', 'n'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:promise/recommended',
    'plugin:n/recommended',
    'prettier'
  ],
  env: {
    node: true,
    jest: true
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
  },
  settings: {
    node: { version: '>=22.23.3' },
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.json']
      }
    }
  }
};
