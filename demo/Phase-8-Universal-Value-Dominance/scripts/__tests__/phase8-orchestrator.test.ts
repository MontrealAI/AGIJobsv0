require("ts-node/register/transpile-only");

const { describe, beforeAll, expect, it } = require("@jest/globals");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const {
  buildSafeTransactions,
  calldata,
  computeMetrics,
  flattenCalldataEntries,
  guardrailDiagnostics,
  loadConfig,
  parseManifest,
  resolveEnvironment,
  schedulePlaybooks,
  telemetryMarkdown,
  mermaid,
  writeArtifacts,
} = require("../run-phase8-demo");

describe("Phase 8 orchestration console", () => {
  let config;

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

  it("enforces guardian coverage and autonomy guardrails in the manifest", () => {
    const guardrailBreach = JSON.parse(JSON.stringify(config));
    guardrailBreach.selfImprovement.autonomyGuards.maxAutonomyBps = 1000;
    expect(() => parseManifest(guardrailBreach)).toThrowError(
      /domains\.0\.autonomyLevelBps: Domain autonomy 7800bps exceeds guardrail cap 1000bps/, 
    );

    const missingGuard = JSON.parse(JSON.stringify(config));
    delete missingGuard.selfImprovement.autonomyGuards;
    expect(() => parseManifest(missingGuard)).toThrowError(
      /selfImprovement\.autonomyGuards\.maxAutonomyBps: Autonomy guard maxAutonomyBps is required/, 
    );

    const coverageBreach = JSON.parse(JSON.stringify(config));
    coverageBreach.sentinels = coverageBreach.sentinels.map((entry) => ({
      ...entry,
      coverageSeconds: 10,
    }));
    expect(() => parseManifest(coverageBreach)).toThrowError(
      /sentinels: Total sentinel coverage 30s is below guardian review window 720s/, 
    );
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
    expect(resolveEnvironment({})).toEqual({
      chainId: 1,
      managerAddress: "0x0000000000000000000000000000000000000000",
    });

    expect(
      resolveEnvironment({
        PHASE8_CHAIN_ID: "777",
        PHASE8_MANAGER_ADDRESS: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefabcd",
      }),
    ).toEqual({
      chainId: 777,
      managerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });

    expect(() =>
      resolveEnvironment({
        PHASE8_CHAIN_ID: "-5",
        PHASE8_MANAGER_ADDRESS: "not-an-address",
      }),
    ).toThrowError(/Environment validation failed:[\s\S]*chainId: Chain ID must be positive/);
  });

  it("writes artifact kit with telemetry and mermaid snapshots", () => {
    const metrics = computeMetrics(config);
    const data = calldata(config);
    const env = { chainId: 8453, managerAddress: "0x9999999999999999999999999999999999999999" };
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

  it("schedules playbooks with guardrails and handles manual workflows", () => {
    const schedules = schedulePlaybooks(config, 1_700_000_000);
    expect(schedules).toHaveLength(2);
    expect(schedules[0]).toMatchObject({
      name: "Hyperparameter Evolution",
      intervalSeconds: 7 * 24 * 60 * 60,
      requiresManualScheduling: false,
    });
    expect(Date.parse(schedules[1]?.nextRun ?? "")).toBeGreaterThan(0);

    const manualConfig = JSON.parse(JSON.stringify(config));
    manualConfig.selfImprovement.playbooks[0].automation = "manual";
    const manualSchedules = schedulePlaybooks(manualConfig, 1_700_000_000);
    expect(manualSchedules[0]).toMatchObject({ requiresManualScheduling: true });
  });

  it("produces operator diagnostics for domains missing guardrails", () => {
    const stressed = JSON.parse(JSON.stringify(config));
    stressed.domains[1].resilienceIndex = 0.4;
    stressed.domains[1].heartbeatSeconds = stressed.global.heartbeatSeconds + 120;
    stressed.selfImprovement.autonomyGuards.maxAutonomyBps = stressed.domains[1].autonomyLevelBps - 500;
    stressed.sentinels = stressed.sentinels.map((entry) => ({
      ...entry,
      coverageSeconds: entry.domains.includes(stressed.domains[1].slug) ? 60 : entry.coverageSeconds,
    }));

    const diagnostics = guardrailDiagnostics(stressed);
    expect(diagnostics.some((line) => line.includes("coverage"))).toBe(true);
    expect(diagnostics.some((line) => line.includes("resilience"))).toBe(true);
    expect(diagnostics.some((line) => line.includes("heartbeat"))).toBe(true);
    expect(diagnostics.some((line) => line.includes("autonomy"))).toBe(true);
  });
});
