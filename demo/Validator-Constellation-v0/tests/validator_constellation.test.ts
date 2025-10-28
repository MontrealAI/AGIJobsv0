import test from "node:test";
import assert from "node:assert/strict";
import { deriveAllIdentities } from "../src/config/entities";
import { allowlistSnapshot, governanceDefaults } from "../src/config/defaults";
import { ensVerifier } from "../src/identity/ensVerifier";
import { EventIndexer } from "../src/subgraph/eventIndexer";
import { StakeManager } from "../src/stake/stakeManager";
import { ValidatorRegistry } from "../src/validation/validatorRegistry";
import {
  CommitRevealRound,
  deriveCommitment,
  randomSalt,
} from "../src/validation/commitRevealRound";
import { evaluatePseudoVrf, verifyPseudoVrf } from "../src/vrf/pseudoVrf";
import { ZkBatchAggregator } from "../src/zk/zkBatchAggregator";
import { generateJobResults } from "../src/zk/jobFactory";
import { BudgetOverrunMonitor, UnsafeCallMonitor } from "../src/sentinel/monitors";
import { Sentinel } from "../src/sentinel/sentinel";
import { DomainPauseManager } from "../src/sentinel/domainPauseManager";
import { domainBudgets } from "../src/config/defaults";
import { runDemoOrchestration } from "../src/demoOrchestrator";

const identities = deriveAllIdentities();
const validators = identities.filter((identity) => identity.role === "validator");

function getProof(address: string) {
  return (
    allowlistSnapshot.entries.find(
      (entry) => entry.address.toLowerCase() === address.toLowerCase()
    )?.proof ?? []
  );
}

test("ENS verifier accepts authorized validator domains", () => {
  for (const validator of validators) {
    const result = ensVerifier.verify({
      address: validator.wallet.address,
      ensName: validator.ensName,
      role: "validator",
      domain: validator.domain,
      proof: getProof(validator.wallet.address),
    });
    assert.equal(result.valid, true);
  }
});

test("ENS verifier rejects spoofed namespace", () => {
  const validator = validators[0];
  const result = ensVerifier.verify({
    address: validator.wallet.address,
    ensName: "hacker.fake.eth",
    role: "validator",
    domain: validator.domain,
    proof: [],
  });
  assert.equal(result.valid, false);
});

test("commit–reveal round enforces quorum and slashes", async () => {
  const indexer = new EventIndexer();
  const stakeManager = new StakeManager(indexer);
  const registry = new ValidatorRegistry(stakeManager, indexer);
  const registered = validators.map((validator) => registry.register(validator));
  const committee = registered.slice(0, governanceDefaults.committeeSize);

  const round = new CommitRevealRound(
    {
      roundId: "test-round",
      jobBatchId: "batch-1",
      committee,
      seed: "0x1234",
    },
    stakeManager,
    indexer
  );

  const submissions = await Promise.all(
    committee.map(async (validator, index) => {
      const identity = validators.find(
        (candidate) =>
          candidate.wallet.address.toLowerCase() ===
          validator.address.toLowerCase()
      );
      if (!identity) throw new Error("missing identity");
      const salt = randomSalt("0xseed", index);
      const vote = index === committee.length - 1 ? "reject" : "approve";
      const commitment = deriveCommitment(vote, salt);
      const vrfProof = await evaluatePseudoVrf(
        identity.wallet,
        "test-round",
        "0xseed"
      );
      return { validator, salt, vote, commitment, vrfProof };
    })
  );

  submissions.forEach((submission) => round.submitCommit(submission));
  submissions
    .slice(0, submissions.length - 1)
    .forEach((submission) =>
      round.submitReveal({
        validator: submission.validator,
        vote: submission.vote,
        salt: submission.salt,
      })
    );

  const result = round.finalize("approve");
  assert.equal(result.approved, true);
  assert.equal(result.slashed.length >= 1, true);
  const slashEvents = indexer
    .getEvents("ValidatorSlashed")
    .map((event) => event.payload);
  assert.equal(slashEvents.length >= 1, true);
});

test("pseudo VRF signatures verify", async () => {
  const validator = validators[0];
  const proof = await evaluatePseudoVrf(
    validator.wallet,
    "round-x",
    "0xdead"
  );
  const verified = await verifyPseudoVrf(
    validator.wallet.address,
    "round-x",
    "0xdead",
    proof.proof
  );
  assert.notEqual(verified, null);
  assert.equal(verified?.output, proof.output);
});

test("ZK aggregator validates batch of 1000 jobs", () => {
  const jobs = generateJobResults(1000, "deep-research");
  const aggregator = new ZkBatchAggregator("0x12345");
  const proof = aggregator.createProof("batch-zeta", jobs);
  assert.equal(proof.batchSize, 1000);
  assert.equal(ZkBatchAggregator.verify(proof, jobs), true);

  const tampered = { ...proof, digest: "0x00" + proof.digest.slice(4) };
  assert.equal(ZkBatchAggregator.verify(tampered, jobs), false);
});

test("sentinel pauses offending domain", () => {
  const indexer = new EventIndexer();
  const pauseManager = new DomainPauseManager(indexer);
  pauseManager.initialize([
    "deep-research",
    "defi-risk",
    "infrastructure",
    "bio-safety",
  ]);
  const sentinel = new Sentinel({
    monitors: [
      new BudgetOverrunMonitor(domainBudgets),
      new UnsafeCallMonitor(),
    ],
    pauseManager,
    indexer,
    pauseSlaSeconds: governanceDefaults.sentinelPauseSlaSeconds,
  });

  sentinel.ingest({
    agent: validators[0].wallet.address,
    ensName: validators[0].ensName,
    domain: validators[0].domain,
    cost: 10_000n * 10n ** 18n,
    call: "selfdestruct()",
    timestamp: Date.now(),
  });

  assert.equal(pauseManager.isPaused(validators[0].domain), true);
  const alertEvents = indexer.getEvents("SentinelAlert");
  assert.equal(alertEvents.length, 1);
});

test("owner overrides propagate through orchestration", async () => {
  const overrides = {
    governanceOverrides: {
      quorum: 3,
      committeeSize: 4,
      nonRevealSlashBps: 450,
      sentinelPauseSlaSeconds: 3,
    },
    domainBudgetOverrides: {
      "deep-research": 7_500n * 10n ** 18n,
    },
    jobCount: 256,
    roundSeed: "0xfeedface",
  } as const;

  const result = await runDemoOrchestration(overrides);

  assert.equal(result.committee.length, 4);
  assert.equal(result.configuration.governance.quorum, 3);
  assert.equal(result.configuration.governance.nonRevealSlashBps, 450);
  assert.equal(result.configuration.sentinelPauseSlaSeconds, 3);
  assert.equal(result.configuration.jobCount, 256);
  assert.equal(result.configuration.roundSeed, "0xfeedface");
  assert.equal(
    result.configuration.domainBudgets["deep-research"],
    (7_500n * 10n ** 18n).toString()
  );
});
