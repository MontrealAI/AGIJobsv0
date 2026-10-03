const { FlatCompat } = require('@eslint/eslintrc');
const { root, ...legacyConfig } = require('./.eslintrc.cjs');
const compat = new FlatCompat({ baseDirectory: __dirname });
module.exports = [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  ...compat.config(legacyConfig),
];
