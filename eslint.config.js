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
      'subgraph/generated/**',
      '**/apps/onebox/app.js',
    ],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          importAssertions: true,
        },
      },
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
    files: ['apps/onebox/**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          importAssertions: true,
        },
      },
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
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
      'prettier/prettier': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: [
      'examples/**/*.{js,ts,tsx}',
      'test/**/*.{js,ts,tsx}',
      '**/test/**/*.{js,ts,tsx}',
      '**/tests/**/*.{js,ts,tsx}',
      'scripts/**/*.ts',
    ],
    rules: {
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-array-constructor': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];
