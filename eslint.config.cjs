module.exports = [
  {
    ignores: ["node_modules/**", "scripts/**/*.ts"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "commonjs",
    },
    rules: {},
  },
];
