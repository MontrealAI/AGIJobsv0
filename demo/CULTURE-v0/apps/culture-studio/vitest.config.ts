import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/lib/**/*.ts"],
      thresholds: {
        lines: 90,
        statements: 90,
        branches: 90,
        functions: 90,
      },
    },
  },
});
