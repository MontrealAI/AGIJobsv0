import { ValidatorConstellationDemo, ValidatorProfile, AgentProfile, DemoConfig, JobResult, NodeProfile } from "../src";

const config: DemoConfig = {
  committeeSize: 4,
  commitPhaseMs: 10,
  revealPhaseMs: 10,
  quorum: 3,
  penaltyPercentage: 15,
  sentinelSlaMs: 100,
  spendingLimit: 750,
};

const validators: ValidatorProfile[] = [
  {
    address: "0x0000000000000000000000000000000000000001",
    ensName: "rigel.club.agi.eth",
    stake: 5_000n * 10n ** 18n,
    domain: "metaverse-labs",
  },
  {
    address: "0x0000000000000000000000000000000000000002",
    ensName: "vega.club.agi.eth",
    stake: 3_000n * 10n ** 18n,
    domain: "metaverse-labs",
  },
  {
    address: "0x0000000000000000000000000000000000000003",
    ensName: "antares.alpha.club.agi.eth",
    stake: 4_000n * 10n ** 18n,
    domain: "metaverse-labs",
  },
  {
    address: "0x0000000000000000000000000000000000000004",
    ensName: "deneb.club.agi.eth",
    stake: 2_500n * 10n ** 18n,
    domain: "metaverse-labs",
  },
  {
    address: "0x0000000000000000000000000000000000000005",
    ensName: "sirius.alpha.club.agi.eth",
    stake: 6_500n * 10n ** 18n,
    domain: "metaverse-labs",
  },
];

const agents: AgentProfile[] = [
  {
    address: "0x00000000000000000000000000000000000000a1",
    ensName: "athena.agent.agi.eth",
    domain: "metaverse-labs",
    budget: 500,
  },
  {
    address: "0x00000000000000000000000000000000000000a2",
    ensName: "atlas.alpha.agent.agi.eth",
    domain: "metaverse-labs",
    budget: 700,
  },
];

const nodes: NodeProfile[] = [
  {
    address: "0x00000000000000000000000000000000000000b1",
    ensName: "europa.node.agi.eth",
    domain: "metaverse-labs",
  },
  {
    address: "0x00000000000000000000000000000000000000b2",
    ensName: "io.alpha.node.agi.eth",
    domain: "metaverse-labs",
  },
];

const ensRecords = [
  ...validators.map((validator) => ({ name: validator.ensName, owner: validator.address, role: "validator" as const })),
  ...agents.map((agent) => ({ name: agent.ensName, owner: agent.address, role: "agent" as const })),
  ...nodes.map((node) => ({ name: node.ensName, owner: node.address, role: "node" as const })),
];

async function main(): Promise<void> {
  const demo = new ValidatorConstellationDemo(config, ensRecords);
  for (const validator of validators) {
    demo.registerValidator(validator);
  }
  for (const agent of agents) {
    demo.registerAgent(agent);
  }
  for (const node of nodes) {
    demo.registerNode(node);
  }

  const seed = "0x" + "11".repeat(32);
  const jobResults: JobResult[] = Array.from({ length: 1000 }, (_, index) => ({
    jobId: `job-${index}`,
    domain: "metaverse-labs",
    vote: "approve",
    witness: `wit-${index.toString(16).padStart(3, "0")}`,
  }));

  const outcome = demo.runValidationRound("round-001", seed, jobResults, "approve", {
    malicious: {
      "0x0000000000000000000000000000000000000003": "dishonest",
      "0x0000000000000000000000000000000000000004": "nonReveal",
    },
  });

  console.log("\n🚀 Validator Constellation :: Kardashev-II Sentinel Demo");
  console.log("-----------------------------------------------");
  console.log(`Committee members (VRF):`);
  outcome.validators.forEach((validator, index) => {
    console.log(`  ${index + 1}. ${validator.ensName} (${validator.address}) stake=${validator.stake}`);
  });

  console.log(`\nConsensus: ${outcome.consensus}`);
  console.log(`Batch Proof: ${outcome.proof.batchId}`);
  console.log(`Jobs finalised in batch: ${outcome.proof.jobs}`);
  console.log(`Validators slashed: ${outcome.slashed.join(", ") || "None"}`);

  demo.dispatchAgentAction({
    domain: "metaverse-labs",
    agent: agents[0].address,
    node: nodes[0].address,
    cost: 1200,
    call: "fs.writeFile",
    timestamp: Date.now(),
  });

  console.log("\n⚠️ Sentinel triggered: domain paused");
  console.log(demo.pauseController.all());

  console.log("\n📡 Subgraph event feed:");
  for (const event of demo.indexer.query("ValidatorSlashed")) {
    console.log(`  [#${event.blockNumber}] ${event.topic} ${JSON.stringify(event.data)}`);
  }
  for (const event of demo.indexer.query("SentinelAlert")) {
    console.log(`  [#${event.blockNumber}] ${event.topic} ${JSON.stringify(event.data)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
