require("ts-node/register/transpile-only");

const { describe, it, expect } = require("@jest/globals");
const { buildInvariantAudit } = require("../audit-phase8-invariants");
const { loadConfig } = require("../run-phase8-demo");

describe("Phase 8 invariant audit", () => {
  it("ensures coverage computations remain consistent", () => {
    const config = loadConfig();
    const audit = buildInvariantAudit(config);

    expect(audit.sentinelCoverageSeconds).toBeGreaterThan(0);
    expect(audit.sentinelCoverageSeconds).toBeCloseTo(audit.sentinelCoverageRecalculated, 6);
    audit.domainCoverage.forEach((entry: any) => {
      expect(entry.primarySeconds).toBeCloseTo(entry.matrixSeconds, 6);
      expect(entry.primarySeconds).toBeGreaterThan(0);
    });
    audit.fundingCoverage.forEach((entry: any) => {
      expect(entry.primaryUSD).toBeCloseTo(entry.reconciliationUSD, 0);
      expect(entry.primaryUSD).toBeGreaterThan(0);
    });
    expect(audit.markdown).toContain("Phase 8 Invariant Audit");
    expect(audit.notes.length).toBeGreaterThan(0);
  });
});
