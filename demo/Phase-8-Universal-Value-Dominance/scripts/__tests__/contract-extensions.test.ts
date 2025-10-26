import "ts-node/register/transpile-only";

import { describe, expect, it } from "@jest/globals";
import path from "node:path";

import { loadConfig } from "../run-phase8-demo";
import {
  buildExtensionPlan,
  loadExtensionConfig,
  renderExtensionMarkdown,
  renderExtensionMermaid,
} from "../contract-extensions";

const CONFIG_PATH = path.resolve(__dirname, "../../configs/contract-extensions.json");

describe("Phase 8 contract extension console", () => {
  it("validates and summarises extension plans", () => {
    const manifest = loadConfig();
    const config = loadExtensionConfig(CONFIG_PATH);
    const plan = buildExtensionPlan(manifest, config);

    expect(plan.metrics.count).toBe(config.extensions.length);
    expect(plan.metrics.pauseCoveragePercent).toBeGreaterThan(0);
    expect(plan.metrics.averageUpgradeWindowHours).toBeGreaterThan(0);
    expect(plan.callGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "stageExtension" }),
        expect.objectContaining({ label: "activateExtension" }),
      ]),
    );
    for (const entry of plan.extensions) {
      expect(entry.calls.stage).toMatch(/^0x[0-9a-f]+$/i);
      expect(entry.calls.activate).toMatch(/^0x[0-9a-f]+$/i);
      expect(entry.dependencies.every((dep) => dep.label.length > 0)).toBe(true);
    }
  });

  it("renders deterministic artefacts", () => {
    const manifest = loadConfig();
    const config = loadExtensionConfig(CONFIG_PATH);
    const plan = buildExtensionPlan(manifest, config);

    const markdown = renderExtensionMarkdown(plan);
    expect(markdown).toContain("# Phase 8 Contract Extension Console");
    expect(markdown).toContain(config.extensions[0].name);
    expect(markdown).toContain("Stage calldata");

    const mermaid = renderExtensionMermaid(plan);
    expect(mermaid).toContain("flowchart TD");
    for (const extension of config.extensions) {
      expect(mermaid).toContain(extension.name);
    }
  });
});
