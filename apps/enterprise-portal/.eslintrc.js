module.exports = {
  root: true,
  extends: [
    "next",
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
  ],
  parserOptions: {
    project: ["./tsconfig.json"],
  },
};
