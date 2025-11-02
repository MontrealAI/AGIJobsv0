import { expect } from "chai";

describe("Sovereign Constellation autotune plan", () => {
  it("expands commit windows and raises min stake when participation is low", async () => {
    const telemetry = {
      baseline: {
        commitWindowSeconds: 3600,
        revealWindowSeconds: 1800,
        minStakeWei: "2000000000000000000"
      },
      missions: [
        { validators: { participation: 0.68, avgRevealLatencySeconds: 1400, avgCommitLatencySeconds: 880 } },
        { validators: { participation: 0.74, avgRevealLatencySeconds: 1320, avgCommitLatencySeconds: 760 } }
      ],
      economics: {
        slashingEvents: 2
      },
      alerts: [
        { hub: "athena-governance", type: "pause", severity: "critical" }
      ],
      recommendations: {
        disputeModule: "0x0000000000000000000000000000000000000005"
      }
    };

    const loadAutotuneModule = new Function(
      "return import('../shared/autotune.mjs')"
    ) as () => Promise<typeof import("../shared/autotune.mjs")>;
    const { computeAutotunePlan } = await loadAutotuneModule();
    const plan = computeAutotunePlan(telemetry, {});

    expect(plan.summary.commitWindowSeconds).to.be.greaterThan(3600);
    expect(plan.summary.revealWindowSeconds).to.be.greaterThan(1800);
    expect(plan.summary.minStakeWei).to.equal("2400000000000000000");
    expect(plan.actions.some((action) => action.action === "systemPause.pause" && action.hub === "athena-governance")).to.be
      .true;
    expect(plan.actions.some((action) => action.action === "jobRegistry.setDisputeModule")).to.be.true;
  });
});
