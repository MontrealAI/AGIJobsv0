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

  it("matches telemetry metrics with an independent calculation", () => {
    const metrics = computeMetrics(config);
    const domains = config.domains ?? [];
    const sentinels = config.sentinels ?? [];
    const streams = config.capitalStreams ?? [];

    const totalMonthly = domains.reduce((acc, domain) => acc + Number(domain.valueFlowMonthlyUSD ?? 0), 0);
    expect(metrics.totalMonthlyUSD).toBe(totalMonthly);

    const averageResilience =
      domains.length === 0
        ? 0
        : domains.reduce((acc, domain) => acc + Number(domain.resilienceIndex ?? 0), 0) / domains.length;
    expect(metrics.averageResilience).toBeCloseTo(averageResilience, 10);

    const guardianCoverageMinutes = sentinels.reduce(
      (acc, sentinel) => acc + Number(sentinel.coverageSeconds ?? 0),
      0,
    ) / 60;
    expect(metrics.guardianCoverageMinutes).toBeCloseTo(guardianCoverageMinutes, 10);

    const domainSlugs = domains.map((domain) => String(domain.slug ?? "").toLowerCase());
    const coverageMap = new Map();
    for (const sentinel of sentinels) {
      const coverage = Number(sentinel.coverageSeconds ?? 0);
      if (!Number.isFinite(coverage) || coverage <= 0) continue;
      const sentinelDomains = Array.from(
        new Set((sentinel.domains ?? []).map((domain) => String(domain ?? "").toLowerCase()).filter(Boolean)),
      );
      const targets = sentinelDomains.length > 0 ? sentinelDomains : domainSlugs;
      for (const target of targets) {
        coverageMap.set(target, (coverageMap.get(target) ?? 0) + coverage);
      }
    }
    const coverageValues = domainSlugs.map((slug) => coverageMap.get(slug) ?? 0);
    const minCoverage = coverageValues.length > 0 ? Math.min(...coverageValues) : 0;
    const coverageRatio =
      domainSlugs.length === 0
        ? 0
        : (coverageValues.filter((value) => value > 0).length / domainSlugs.length) * 100;
    const averageDomainCoverage =
      coverageValues.length === 0
        ? 0
        : coverageValues.reduce((acc, value) => acc + value, 0) / coverageValues.length;

    expect(metrics.minDomainCoverageSeconds).toBe(minCoverage);
    expect(metrics.coverageRatio).toBeCloseTo(coverageRatio, 10);
    expect(metrics.averageDomainCoverageSeconds).toBeCloseTo(averageDomainCoverage, 10);

    const guardianWindow = Number(config.global?.guardianReviewWindow ?? 0);
    const adequacy = guardianWindow > 0 ? minCoverage / guardianWindow : 0;
    expect(metrics.guardianWindowSeconds).toBe(guardianWindow);
    expect(metrics.minimumCoverageAdequacy).toBeCloseTo(adequacy, 10);

    const fundingMap = new Map();
    for (const stream of streams) {
      const budget = Number(stream.annualBudget ?? 0);
      if (!Number.isFinite(budget) || budget <= 0) continue;
      const streamDomains = Array.from(
        new Set((stream.domains ?? []).map((domain) => String(domain ?? "").toLowerCase()).filter(Boolean)),
      );
      const targets = streamDomains.length > 0 ? streamDomains : domainSlugs;
      for (const target of targets) {
        fundingMap.set(target, (fundingMap.get(target) ?? 0) + budget);
      }
    }
    const fundingValues = domainSlugs.map((slug) => fundingMap.get(slug) ?? 0);
    const minFunding = fundingValues.length > 0 ? Math.min(...fundingValues) : 0;
    const fundedRatio =
      domainSlugs.length === 0
        ? 0
        : (fundingValues.filter((value) => value > 0).length / domainSlugs.length) * 100;
    expect(metrics.minDomainFundingUSD).toBe(minFunding);
    expect(metrics.fundedDomainRatio).toBeCloseTo(fundedRatio, 10);

    const annualBudget = streams.reduce((acc, stream) => acc + Number(stream.annualBudget ?? 0), 0);
    expect(metrics.annualBudget).toBe(annualBudget);

    const maxAutonomy = domains.reduce(
      (acc, domain) => Math.max(acc, Number(domain.autonomyLevelBps ?? 0)),
      0,
    );
    expect(metrics.maxAutonomy).toBe(maxAutonomy);
  });

  it("parses the manifest with strict validation", () => {
    expect(config.domains).toHaveLength(5);
    expect(config.sentinels).toHaveLength(3);
    expect(config.capitalStreams).toHaveLength(3);

    const broken = JSON.parse(JSON.stringify(config));
    broken.domains[0].slug = "";
    expect(() => parseManifest(broken)).toThrowError(/domains\.0\.slug: Domain slug is required/);

    const duplicateDomain = JSON.parse(JSON.stringify(config));
    duplicateDomain.domains.push({ ...duplicateDomain.domains[0], slug: duplicateDomain.domains[1].slug });
    expect(() => parseManifest(duplicateDomain)).toThrowError(/domains\.5\.slug: Duplicate domain slug detected/i);

    const duplicateSentinel = JSON.parse(JSON.stringify(config));
    duplicateSentinel.sentinels.push({ ...duplicateSentinel.sentinels[0], slug: duplicateSentinel.sentinels[1].slug });
    expect(() => parseManifest(duplicateSentinel)).toThrowError(/sentinels\.3\.slug: Duplicate sentinel slug detected/i);

    const duplicateStream = JSON.parse(JSON.stringify(config));
    duplicateStream.capitalStreams.push({ ...duplicateStream.capitalStreams[0], slug: duplicateStream.capitalStreams[1].slug });
    expect(() => parseManifest(duplicateStream)).toThrowError(/capitalStreams\.3\.slug: Duplicate capital stream slug detected/i);
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

    const domainCoverageBreach = JSON.parse(JSON.stringify(config));
    domainCoverageBreach.sentinels = domainCoverageBreach.sentinels.map((entry: any) =>
      entry.slug === "solar-shield"
        ? { ...entry, coverageSeconds: 600 }
        : entry,
    );
    expect(() => parseManifest(domainCoverageBreach)).toThrowError(
      /Domains below guardian window 720s: climate-harmonizer, infrastructure-synthesis/,
    );

    const sentinelReference = JSON.parse(JSON.stringify(config));
    sentinelReference.sentinels[0].domains = ["unknown-domain"];
    expect(() => parseManifest(sentinelReference)).toThrowError(
      /sentinels\.0\.domains\.0: Sentinel solar-shield references unknown domain unknown-domain/,
    );
  });

  it("fails CI if guardrail thresholds regress", () => {
    const metrics = computeMetrics(config);
    const guardrail = config.selfImprovement?.autonomyGuards?.maxAutonomyBps ?? Number.POSITIVE_INFINITY;
    expect(guardrail).toBeLessThan(8000);
    const guardianWindow = Number(config.global?.guardianReviewWindow ?? 0);
    expect(metrics.minDomainCoverageSeconds).toBeGreaterThanOrEqual(guardianWindow);
    if (guardianWindow > 0) {
      expect(metrics.minimumCoverageAdequacy).toBeGreaterThanOrEqual(1);
    }
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
      const artifactPaths = {
        manifest: join(tempDir, "phase8-governance-calldata.json"),
        safeBatch: join(tempDir, "phase8-safe-transaction-batch.json"),
        mermaid: join(tempDir, "phase8-mermaid-diagram.mmd"),
        telemetry: join(tempDir, "phase8-telemetry-report.md"),
        runbook: join(tempDir, "phase8-orchestration-report.txt"),
        planPayload: join(tempDir, "phase8-self-improvement-plan.json"),
        cycleReport: join(tempDir, "phase8-cycle-report.csv"),
        governanceDirectives: join(tempDir, "phase8-governance-directives.md"),
        emergencyPlaybook: join(tempDir, "phase8-emergency-playbook.md"),
        dominanceScorecard: join(tempDir, "phase8-dominance-scorecard.json"),
      };

      expect(outputs).toEqual([
        { label: "Calldata manifest", path: artifactPaths.manifest },
        { label: "Safe transaction batch", path: artifactPaths.safeBatch },
        { label: "Mermaid diagram", path: artifactPaths.mermaid },
        { label: "Telemetry report", path: artifactPaths.telemetry },
        { label: "Operator runbook", path: artifactPaths.runbook },
        { label: "Self-improvement payload", path: artifactPaths.planPayload },
        { label: "Cycle report", path: artifactPaths.cycleReport },
        { label: "Governance directives", path: artifactPaths.governanceDirectives },
        { label: "Emergency playbook", path: artifactPaths.emergencyPlaybook },
        { label: "Dominance scorecard", path: artifactPaths.dominanceScorecard },
      ]);

      expect(metrics.minDomainCoverageSeconds).toBeGreaterThan(0);
      expect(metrics.minimumCoverageAdequacy).toBeGreaterThan(1);

      const telemetry = readFileSync(artifactPaths.telemetry, "utf-8");
      const diagram = readFileSync(artifactPaths.mermaid, "utf-8");
      const emergencyPlaybook = readFileSync(artifactPaths.emergencyPlaybook, "utf-8");

      expect(telemetryMarkdown(config, metrics)).toContain("Phase 8 — Universal Value Dominance Telemetry");
      const stableTelemetry = telemetry.replace(/Generated: .*/u, "Generated: <timestamp>");
      expect(stableTelemetry).toMatchSnapshot();
      expect(mermaid(config)).toEqual(diagram);
      expect(diagram).toMatchSnapshot();
      expect(emergencyPlaybook).toContain("Emergency Response Playbook");

      const manifest = JSON.parse(readFileSync(artifactPaths.manifest, "utf-8"));
      expect(manifest.metrics.minimumCoverageAdequacyPercent).toBeGreaterThan(0);
      expect(Array.isArray(manifest.calls)).toBe(true);
      expect(manifest.calls).toHaveLength(flattenCalldataEntries(data).length);

      const safeBatch = JSON.parse(readFileSync(artifactPaths.safeBatch, "utf-8"));
      expect(safeBatch.chainId).toBe(String(env.chainId));
      expect(safeBatch.meta.createdFromSafeAddress).toBe(env.managerAddress);
      const stableSafeBatch = {
        ...safeBatch,
        createdAt: "<timestamp>",
        meta: {
          ...safeBatch.meta,
          createdAt: "<timestamp>",
          description: "Generated by AGI Jobs v0 (v2) on <timestamp>",
        },
      };
      expect(stableSafeBatch).toMatchSnapshot("phase8-safe-batch");

      const operatorRunbook = readFileSync(artifactPaths.runbook, "utf-8");
      expect(operatorRunbook).toContain("OPERATOR RUNBOOK");
      expect(operatorRunbook).toContain("Self-improvement kernel");

      const planPayload = JSON.parse(readFileSync(artifactPaths.planPayload, "utf-8"));
      expect(typeof planPayload.generatedAt).toBe("string");
      expect(planPayload.playbooks.length).toBeGreaterThan(0);
      expect(planPayload.autonomyGuards).toMatchObject({ maxAutonomyBps: expect.any(Number) });
      expect(planPayload.guardrails).toMatchObject({
        checksum: {
          algorithm: expect.any(String),
          value: expect.stringMatching(/^0x[0-9a-f]{64}$/),
        },
        zkProof: expect.objectContaining({
          circuit: expect.any(String),
          status: expect.any(String),
          artifactURI: expect.stringContaining("ipfs://"),
        }),
      });

      const cycleReport = readFileSync(artifactPaths.cycleReport, "utf-8");
      expect(cycleReport).toContain(
        "slug,name,resilience_index,autonomy_bps,monthly_value_usd,sentinel_coverage_seconds,guardian_window_seconds,coverage_adequacy_percent,capital_coverage_usd,capital_share_percent,resilience_status",
      );
      const cycleReportLines = cycleReport.trim().split("\n");
      expect(cycleReportLines).toHaveLength((config.domains?.length ?? 0) + 1);
      expect(cycleReportLines[1]).toContain(String(config.domains?.[0]?.slug ?? ""));
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
