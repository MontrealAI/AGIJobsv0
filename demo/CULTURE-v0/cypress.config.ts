import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:4173",
    specPattern: "demo/CULTURE-v0/cypress/e2e/**/*.cy.ts",
    supportFile: false,
    video: false,
  },
});
