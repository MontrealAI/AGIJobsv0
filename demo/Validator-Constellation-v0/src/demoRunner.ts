import { ValidatorConstellationDemo, DemoConfig } from "./orchestrator";
import { EnsOwnershipRegistry } from "./ens";
import { JobResult } from "./types";

export function buildDemo(): { demo: ValidatorConstellationDemo; config: DemoConfig } {
  const config: DemoConfig = {
    round: {
      committeeSize: 5,
      domain: "core",
      quorum: 3,
      revealDeadlineBlocks: 3,
    },
    sentinel: {
      budgetLimit: 10_000n,
      unsafeFunctionPatterns: [/selfdestruct/i, /delegatecall/i],
    },
    batch: {
      maxJobs: 1000,
      trustedVerifier: "0xVerifier",
    },
  };

  const demo = new ValidatorConstellationDemo(config);

  const ens = demo.ensRegistry as EnsOwnershipRegistry;
  const validators = [
    { address: "0xA1", name: "atlas.club.agi.eth" },
    { address: "0xB2", name: "vega.club.agi.eth" },
    { address: "0xC3", name: "rigel.club.agi.eth" },
    { address: "0xD4", name: "lyra.alpha.club.agi.eth" },
    { address: "0xE5", name: "orion.alpha.club.agi.eth" },
  ];
  validators.forEach((validator) => ens.register(validator.name, validator.address, "validator"));

  const agents = [
    { address: "0xAA", name: "nova.agent.agi.eth" },
    { address: "0xBB", name: "nova.node.agi.eth", role: "node" as const },
  ];
  ens.register(agents[0].name, agents[0].address, "agent");
  ens.register("lumen.node.agi.eth", agents[1].address, "node");

  validators.forEach((validator) => demo.onboardValidator(validator.address, validator.name, 1000n));
  demo.onboardAgent(agents[0].address, agents[0].name);

  return { demo, config };
}

export function runDemoScenario() {
  const { demo } = buildDemo();
  const round = demo.runRound("round-1");

  demo.listValidators().forEach((validator, index) => {
    const salt = `salt-${index}`;
    const vote = index % 2 === 0;
    demo.submitCommit(round, validator.address, vote, salt);
  });

  demo.listValidators().forEach((validator, index) => {
    const salt = `salt-${index}`;
    const vote = index % 2 === 0;
    const truthful = true;
    demo.submitReveal(round, validator.address, vote, salt, truthful);
  });

  const outcome = demo.finalize(round, true);

  const jobs: JobResult[] = Array.from({ length: 3 }).map((_, idx) => ({
    jobId: `job-${idx}`,
    outcomeHash: `hash-${idx}`,
    cost: BigInt(100 * (idx + 1)),
    safe: true,
  }));

  const proof = demo.simulateJobBatch(jobs, "0xVerifier");

  demo.emitExecutionEvent({
    domain: "core",
    job: { jobId: "job-unsafe", outcomeHash: "hash", cost: 11_000n, safe: false },
    action: "delegatecall",
    costDelta: 11_000n,
  });

  return {
    outcome,
    proof,
    sentinelAlerts: demo.sentinel.getAlerts(),
    pausedDomains: demo.pauseManager.listPausedDomains(),
    slashLog: demo.stakeManager.getSlashLog(),
  };
}

if (require.main === module) {
  const result = runDemoScenario();
  console.log(JSON.stringify(result, null, 2));
}
