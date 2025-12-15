module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  modulePathIgnorePatterns: [
    "<rootDir>/services/culture-graph-indexer/package.json",
    "<rootDir>/demo/CULTURE-v0/indexers/culture-graph-indexer/package.json",
  ],
};
