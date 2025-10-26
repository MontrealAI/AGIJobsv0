require("ts-node/register/transpile-only");

const { describe, beforeAll, afterAll, it, expect } = require("@jest/globals");
const { mkdtempSync, rmSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const { buildBootstrapPlan } = require("../bootstrap-demo");

describe("Phase 8 bootstrap planner", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "phase8-bootstrap-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates governance artifacts and call groups", async () => {
    const plan = await buildBootstrapPlan({ outputDir: tempDir });
    expect(plan.entries.length).toBeGreaterThan(0);
    expect(plan.callGroups.length).toBeGreaterThan(0);
    expect(plan.managerAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(plan.metrics.dominanceScore).toBeGreaterThan(0);
    for (const file of Object.values(plan.exports)) {
      expect(existsSync(file)).toBe(true);
    }
  });

  it("can skip artifact generation for dry runs", async () => {
    const plan = await buildBootstrapPlan({ skipArtifacts: true, outputDir: tempDir });
    expect(Object.keys(plan.exports)).toHaveLength(0);
    expect(plan.entries.length).toBeGreaterThan(0);
  });
});

export {};
