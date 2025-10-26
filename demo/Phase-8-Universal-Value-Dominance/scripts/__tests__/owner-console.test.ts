import "ts-node/register/transpile-only";

import { describe, beforeAll, expect, it } from "@jest/globals";
import path from "node:path";

import { crossVerifyMetrics, loadConfig, resolveEnvironment } from "../run-phase8-demo";
import {
  buildOwnerControlPlan,
  loadOwnerDirectives,
  OWNER_DIRECTIVES_PATH,
  renderOwnerMarkdown,
  renderOwnerMermaid,
} from "../owner-console";

describe("Phase 8 owner command console", () => {
  let directives;
  let environment;
  let config;

  beforeAll(async () => {
    config = loadConfig();
    directives = await loadOwnerDirectives(OWNER_DIRECTIVES_PATH);
    environment = resolveEnvironment({ PHASE8_MANAGER_ADDRESS: directives.owner });
  });

  it("builds a fully covered control surface", async () => {
    const plan = buildOwnerControlPlan(config, directives, environment);
    expect(plan.owner.address).toBe(directives.owner);
    expect(plan.owner.matchesManager).toBe(true);
    expect(plan.modules).toHaveLength(directives.controlSurfaces.length);
    expect(plan.missingModules.length).toBe(0);
    for (const module of plan.modules) {
      expect(module.inManifest).toBe(true);
      expect(module.manifestReferences.length).toBeGreaterThan(0);
    }
    expect(plan.guardrailFindings).toEqual([]);
    expect(plan.ci.workflowExists).toBe(true);
    expect(plan.ci.requireStatusChecks.length).toBeGreaterThan(0);
  });

  it("projects parameter deltas relative to the manifest", () => {
    const plan = buildOwnerControlPlan(config, directives, environment);
    expect(plan.parameters.length).toBeGreaterThan(0);
    for (const parameter of plan.parameters) {
      expect(parameter.current).not.toBeNull();
      if (parameter.current !== null) {
        expect(parameter.delta).toBeCloseTo(parameter.desired - parameter.current, 10);
      }
    }
  });

  it("synthesises a universal value score consistent with manifest metrics", () => {
    const plan = buildOwnerControlPlan(config, directives, environment);
    const metrics = crossVerifyMetrics(config).metrics;
    expect(plan.metrics.dominanceScore).toBe(metrics.dominanceScore);
    expect(plan.universalValueScore).toBeGreaterThanOrEqual(metrics.dominanceScore * 0.75);
  });

  it("renders an owner-focused mermaid diagram", () => {
    const plan = buildOwnerControlPlan(config, directives, environment);
    const diagram = renderOwnerMermaid(plan);
    expect(diagram).toContain("flowchart");
    for (const module of directives.controlSurfaces) {
      expect(diagram).toContain(module.name);
    }
  });

  it("formats a deterministic markdown briefing", () => {
    const plan = buildOwnerControlPlan(config, directives, environment);
    const markdown = renderOwnerMarkdown(plan);
    expect(markdown).toContain("# Phase 8 Owner Command Console Report");
    expect(markdown).toContain("## Executive Metrics");
    for (const module of directives.controlSurfaces) {
      expect(markdown).toContain(module.name);
    }
    expect(markdown).toContain("```mermaid");
    expect(markdown).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no timestamps for deterministic outputs
  });

  it("exposes the directives path for operators", () => {
    const resolved = path.resolve(__dirname, "../../configs/owner-directives.json");
    expect(resolved).toBe(OWNER_DIRECTIVES_PATH);
  });
});
