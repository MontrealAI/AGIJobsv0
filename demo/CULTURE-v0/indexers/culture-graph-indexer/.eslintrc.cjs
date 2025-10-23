module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname
  },
  plugins: ['@typescript-eslint', 'import', 'promise'],
  extends: ['plugin:import/typescript', 'plugin:promise/recommended', 'prettier'],
  env: {
    node: true
  }
};
