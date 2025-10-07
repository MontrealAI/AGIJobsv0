const prettierPlugin = require('eslint-plugin-prettier');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const reactHooksPlugin = require('eslint-plugin-react-hooks');

module.exports = [
  {
    ignores: [
      'scripts/**/*.js',
      '**/dist/**',
      'coverage/**',
      'apps/enterprise-portal/dist-test/**',
      'apps/onebox/app.js',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      'prettier/prettier': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-array-constructor': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      'prettier/prettier': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: [
      'apps/onebox-static/**/*.js',
      'apps/onebox/**/*.js',
      'packages/storage/**/*.js',
      'storage/**/*.js',
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
  },
  {
    files: [
      'examples/**/*.{js,ts,tsx}',
      'test/**/*.{js,ts,tsx}',
      'scripts/**/*.ts',
    ],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
