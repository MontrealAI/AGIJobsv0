import { describe, beforeAll, expect, it } from "@jest/globals";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildSafeTransactions,
  calldata,
  computeMetrics,
  flattenCalldataEntries,
  loadConfig,
  parseManifest,
  resolveEnvironment,
  telemetryMarkdown,
  mermaid,
  writeArtifacts,
  type Phase8Config,
} from "../run-phase8-demo";

describe("Phase 8 orchestration console", () => {
  let config: Phase8Config;

  beforeAll(() => {
    config = loadConfig();
  });

  it("parses the manifest with strict validation", () => {
    expect(config.domains).toHaveLength(5);
    expect(config.sentinels).toHaveLength(3);
    expect(config.capitalStreams).toHaveLength(3);

    const broken = JSON.parse(JSON.stringify(config));
    broken.domains[0].slug = "";
    expect(() => parseManifest(broken)).toThrowError(/domains\.0\.slug: Domain slug is required/);
  });

  it("encodes calldata and flattens manifests deterministically", () => {
    const calls = calldata(config);
    expect(calls.setGlobalParameters).toMatch(/^0x[0-9a-f]+$/i);
    expect(calls.registerDomains).toHaveLength(config.domains.length);

    const flattened = flattenCalldataEntries(calls);
    const registerDomain = flattened.find((entry) => entry.label === "registerDomain");
    expect(registerDomain).toBeDefined();
    expect(registerDomain?.data).toMatch(/^0x[0-9a-f]+$/i);
    expect(flattened.length).toBeGreaterThan(config.domains.length + config.sentinels.length + config.capitalStreams.length);

    const safeTransactions = buildSafeTransactions(flattened, "0x1234567890abcdef1234567890abcdef12345678");
    expect(safeTransactions[0]).toMatchObject({ to: "0x1234567890abcdef1234567890abcdef12345678", value: "0" });
    expect(new Set(safeTransactions.map((tx) => tx.data)).size).toBeGreaterThan(0);
  });

  it("resolves environment overrides with validation", () => {
    expect(resolveEnvironment({} as NodeJS.ProcessEnv)).toEqual({
      chainId: 1,
      managerAddress: "0x0000000000000000000000000000000000000000",
    });

    expect(
      resolveEnvironment({
        PHASE8_CHAIN_ID: "777",
        PHASE8_MANAGER_ADDRESS: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      chainId: 777,
      managerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });

    expect(() =>
      resolveEnvironment({
        PHASE8_CHAIN_ID: "-5",
        PHASE8_MANAGER_ADDRESS: "not-an-address",
      } as NodeJS.ProcessEnv),
    ).toThrowError(/Environment validation failed:[\s\S]*chainId: Chain ID must be positive/);
  });

  it("writes artifact kit with telemetry and mermaid snapshots", () => {
    const metrics = computeMetrics(config);
    const data = calldata(config);
    const env = { chainId: 8453, managerAddress: "0x9999999999999999999999999999999999999999" } as const;
    const tempDir = mkdtempSync(join(tmpdir(), "phase8-test-"));

    try {
      const outputs = writeArtifacts(config, metrics, data, env, { outputDir: tempDir });
      expect(outputs).toHaveLength(4);

      const telemetryPath = join(tempDir, "phase8-telemetry-report.md");
      const mermaidPath = join(tempDir, "phase8-mermaid-diagram.mmd");
      const telemetry = readFileSync(telemetryPath, "utf-8");
      const diagram = readFileSync(mermaidPath, "utf-8");

      expect(telemetryMarkdown(config, metrics)).toContain("Phase 8 — Universal Value Dominance Telemetry");
      const stableTelemetry = telemetry.replace(/Generated: .*/u, "Generated: <timestamp>");
      expect(stableTelemetry).toMatchSnapshot();
      expect(mermaid(config)).toEqual(diagram);
      expect(diagram).toMatchSnapshot();

      const safeBatch = JSON.parse(readFileSync(join(tempDir, "phase8-safe-transaction-batch.json"), "utf-8"));
      expect(safeBatch.chainId).toBe(String(env.chainId));
      expect(safeBatch.meta.createdFromSafeAddress).toBe(env.managerAddress);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
