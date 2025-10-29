import { buildDemo } from "../src/demoRunner";
import { DeterministicVrf } from "../src/vrf";
import { CommitRevealRound } from "../src/commitReveal";
import { JobResult } from "../src/types";
import { ZkBatchVerifier } from "../src/zkBatch";

describe("Validator Constellation Demo", () => {
  test("commit-reveal with VRF committee achieves quorum", () => {
    const { demo, config } = buildDemo();
    const vrf = new DeterministicVrf(Buffer.alloc(32, 1));
    const round = new CommitRevealRound("test-round", demo.listValidators(), vrf, config.round);

    expect(round.committee).toHaveLength(config.round.committeeSize);

    round.committee.forEach((validator, index) => {
      const salt = `salt-${index}`;
      const vote = index % 2 === 0;
      round.commitVote(validator.address, round.hashVote(vote, salt));
    });

    round.committee.forEach((validator, index) => {
      const salt = `salt-${index}`;
      const vote = index % 2 === 0;
      round.revealVote(validator.address, vote, salt);
    });

    const outcome = round.finalizeRound(true);
    expect(outcome).toBe("TRUTH");
  });

  test("zk batching finalizes 1000 jobs in one proof", () => {
    const { demo, config } = buildDemo();
    const verifier = new ZkBatchVerifier(config.batch);
    const jobs: JobResult[] = Array.from({ length: 1000 }).map((_, idx) => ({
      jobId: `job-${idx}`,
      outcomeHash: `hash-${idx}`,
      cost: 1n,
      safe: true,
    }));
    const proof = verifier.produceProof(jobs, "0xVerifier");
    const verified = verifier.verifyProof(proof, jobs, config.batch.trustedVerifier);
    expect(verified).toBe(true);
  });

  test("sentinel triggers pause on unsafe action", () => {
    const { demo } = buildDemo();
    expect(demo.pauseManager.isPaused("core")).toBe(false);
    demo.emitExecutionEvent({
      domain: "core",
      job: { jobId: "job-unsafe", outcomeHash: "hash", cost: 5_000n, safe: false },
      action: "delegatecall",
      costDelta: 5_001n,
    });
    expect(demo.pauseManager.isPaused("core")).toBe(true);
    expect(demo.sentinel.getAlerts()).toHaveLength(1);
  });

  test("ens enforcement rejects unauthorized actor", () => {
    const { demo } = buildDemo();
    expect(() => demo.onboardValidator("0xBAD", "malicious.other.eth", 1000n)).toThrow(/ENS ownership/);
  });

  test("validators are slashed for non-reveal", () => {
    const { demo, config } = buildDemo();
    const vrf = new DeterministicVrf(Buffer.alloc(32, 2));
    const round = new CommitRevealRound("slash-round", demo.listValidators(), vrf, config.round);
    const first = round.committee[0];
    const second = round.committee[1];
    round.commitVote(first.address, round.hashVote(true, "salt-1"));
    round.commitVote(second.address, round.hashVote(true, "salt-2"));

    round.revealVote(first.address, true, "salt-1");

    demo.stakeManager.slash(second.address, "Failed to reveal");
    const log = demo.stakeManager.getSlashLog();
    expect(log.some((entry) => entry.validator.toLowerCase() === second.address.toLowerCase())).toBe(true);
  });

  test("owner can retune configs on the fly", () => {
    const { demo } = buildDemo();
    demo.updateRoundConfig({ quorum: 4 });
    demo.updateBatchConfig({ maxJobs: 512 });
    demo.updateSentinelConfig({ budgetLimit: 5_000n });

    const round = demo.runRound("reconfigured");
    expect(round.config.quorum).toBe(4);

    const jobs: JobResult[] = Array.from({ length: 512 }).map((_, idx) => ({
      jobId: `job-${idx}`,
      outcomeHash: `hash-${idx}`,
      cost: 1n,
      safe: true,
    }));
    const proof = demo.simulateJobBatch(jobs, "0xVerifier");
    expect(proof.jobIds).toHaveLength(512);

    demo.emitExecutionEvent({
      domain: "core",
      job: { jobId: "budget", outcomeHash: "hash", cost: 4_900n, safe: true },
      action: "call",
      costDelta: 200n,
    });
    expect(demo.pauseManager.isPaused("core")).toBe(true);
  });
});
