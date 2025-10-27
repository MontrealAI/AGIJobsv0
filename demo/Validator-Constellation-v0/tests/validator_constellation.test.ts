import { test } from "node:test";
import assert from "node:assert/strict";
import { ValidatorConstellationDemo, DemoConfig, JobResult } from "../src";

const baseConfig: DemoConfig = {
  committeeSize: 3,
  commitPhaseMs: 5,
  revealPhaseMs: 5,
  quorum: 2,
  penaltyPercentage: 20,
  sentinelSlaMs: 100,
  spendingLimit: 400,
};

const validatorRecords = [
  {
    address: "0x0000000000000000000000000000000000000010",
    ensName: "orbit.club.agi.eth",
    stake: 5_000n,
    domain: "atlas",
  },
  {
    address: "0x0000000000000000000000000000000000000020",
    ensName: "nova.alpha.club.agi.eth",
    stake: 4_000n,
    domain: "atlas",
  },
  {
    address: "0x0000000000000000000000000000000000000030",
    ensName: "quasar.club.agi.eth",
    stake: 3_000n,
    domain: "atlas",
  },
  {
    address: "0x0000000000000000000000000000000000000040",
    ensName: "zenith.club.agi.eth",
    stake: 6_000n,
    domain: "atlas",
  },
];

const agentRecords = [
  {
    address: "0x00000000000000000000000000000000000000a0",
    ensName: "hermes.agent.agi.eth",
    domain: "atlas",
    budget: 300,
  },
];

const nodeRecords = [
  {
    address: "0x00000000000000000000000000000000000000b0",
    ensName: "apollo.node.agi.eth",
    domain: "atlas",
  },
];

function buildDemo(): ValidatorConstellationDemo {
  const ensRecords = [
    ...validatorRecords.map((record) => ({ name: record.ensName, owner: record.address, role: "validator" as const })),
    ...agentRecords.map((record) => ({ name: record.ensName, owner: record.address, role: "agent" as const })),
    ...nodeRecords.map((record) => ({ name: record.ensName, owner: record.address, role: "node" as const })),
  ];
  const demo = new ValidatorConstellationDemo(baseConfig, ensRecords);
  validatorRecords.forEach((record) => demo.registerValidator(record));
  agentRecords.forEach((record) => demo.registerAgent(record));
  nodeRecords.forEach((record) => demo.registerNode(record));
  return demo;
}

function buildJobs(count: number): JobResult[] {
  return Array.from({ length: count }, (_, index) => ({
    jobId: `job-${index}`,
    domain: "atlas",
    vote: "approve",
    witness: `w-${index}`,
  }));
}

test("alpha validators satisfy ENS policy", () => {
  const ensRecords = [
    { name: "xenon.alpha.club.agi.eth", owner: "0x0000000000000000000000000000000000000abc", role: "validator" as const },
  ];
  const config = { ...baseConfig, committeeSize: 1, quorum: 1 } satisfies DemoConfig;
  const demo = new ValidatorConstellationDemo(config, ensRecords);
  assert.doesNotThrow(() =>
    demo.registerValidator({
      address: "0x0000000000000000000000000000000000000abc",
      ensName: "xenon.alpha.club.agi.eth",
      stake: 1_000n,
      domain: "atlas",
    }),
  );
  assert.throws(() =>
    demo.registerValidator({
      address: "0x0000000000000000000000000000000000000abd",
      ensName: "unauthorised.other.eth",
      stake: 1_000n,
      domain: "atlas",
    }),
  );
});

test("commit-reveal slashes dishonest and non-revealing validators", () => {
  const demo = buildDemo();
  const jobs = buildJobs(5);
  const outcome = demo.runValidationRound("round-test-1", "0x" + "aa".repeat(32), jobs, "approve", {
    malicious: {
      "0x0000000000000000000000000000000000000020": "dishonest",
      "0x0000000000000000000000000000000000000030": "nonReveal",
    },
  });
  assert.equal(outcome.consensus, "approve");
  assert.ok(outcome.slashed.includes("0x0000000000000000000000000000000000000020"));
  assert.ok(outcome.slashed.includes("0x0000000000000000000000000000000000000030"));
  const slashingEvents = demo.indexer.query("ValidatorSlashed");
  assert.equal(slashingEvents.length >= 2, true);
});

test("zk batch attestation handles 1000 jobs", () => {
  const demo = buildDemo();
  const jobs = buildJobs(1000);
  const outcome = demo.runValidationRound("round-test-2", "0x" + "bb".repeat(32), jobs, "approve");
  assert.equal(outcome.proof.jobs, 1000);
  assert.ok(demo.zkBatcher.verify(jobs, outcome.proof, "round-test-2-proof-secret"));
});

test("sentinel pauses domain on anomaly", () => {
  const demo = buildDemo();
  demo.dispatchAgentAction({
    domain: "atlas",
    agent: agentRecords[0].address,
    node: nodeRecords[0].address,
    cost: 999,
    call: "fs.writeFile",
    timestamp: Date.now(),
  });
  const states = demo.pauseController.all();
  assert.equal(states.length, 1);
  assert.equal(states[0].paused, true);
  const alerts = demo.indexer.query("SentinelAlert");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].data["monitor"], "budget-overrun");
});

test("subgraph captures chronology", () => {
  const demo = buildDemo();
  const jobs = buildJobs(5);
  demo.runValidationRound("round-test-3", "0x" + "cc".repeat(32), jobs, "approve");
  const allEvents = demo.indexer.latest();
  assert.ok(allEvents);
  assert.ok(allEvents?.blockNumber > 0);
});
