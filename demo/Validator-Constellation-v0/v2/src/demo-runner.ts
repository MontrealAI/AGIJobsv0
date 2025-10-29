import { DomainController } from './domain/domain-controller.js';
import { EnsRegistry } from './identity/ens-registry.js';
import { Sentinel } from './sentinel/sentinel.js';
import { AgentFactory } from './simulation/agent-factory.js';
import { ValidationOrchestrator } from './simulation/validation-orchestrator.js';

async function main() {
  const ensRegistry = new EnsRegistry([
    { name: 'athena.club.agi.eth', owner: '0xaaa0000000000000000000000000000000000001', domainType: 'validator', domain: null },
    { name: 'poseidon.club.agi.eth', owner: '0xaaa0000000000000000000000000000000000002', domainType: 'validator', domain: null },
    { name: 'hyperion.club.agi.eth', owner: '0xaaa0000000000000000000000000000000000003', domainType: 'validator', domain: null },
    { name: 'clio.agent.agi.eth', owner: '0xbbb0000000000000000000000000000000000001', domainType: 'agent', domain: 'research' },
    { name: 'eris.agent.agi.eth', owner: '0xbbb0000000000000000000000000000000000002', domainType: 'agent', domain: 'operations' },
    { name: 'atlas.node.agi.eth', owner: '0xccc0000000000000000000000000000000000001', domainType: 'node', domain: null },
  ]);

  const sentinel = new Sentinel({
    budgetOverrunThreshold: 10_000_000_000_000_000_000n,
    unsafeCallSignatures: ['delegatecall(bytes)'],
    slaBlocks: 1,
  });
  const domainController = new DomainController();
  const orchestrator = new ValidationOrchestrator(
    ensRegistry,
    sentinel,
    domainController,
    {
      validatorRegistry: {
        minimumStake: 5_000_000_000_000_000_000n,
        slashPenalty: 1_000_000_000_000_000_000n,
      },
      commitReveal: {
        revealDeadlineBlocks: 10,
        quorum: 2,
        slashPenaltyReason: 'Failed to reveal truthful vote',
      },
      committee: {
        committeeSize: 2,
        entropyMix: 'demo-entropy',
      },
      zkBatch: {
        maxBatchSize: 1000,
      },
    }
  );

  orchestrator.registerValidator('0xaaa0000000000000000000000000000000000001', 'athena.club.agi.eth', 10_000_000_000_000_000_000n);
  orchestrator.registerValidator('0xaaa0000000000000000000000000000000000002', 'poseidon.club.agi.eth', 9_000_000_000_000_000_000n);
  orchestrator.registerValidator('0xaaa0000000000000000000000000000000000003', 'hyperion.club.agi.eth', 12_000_000_000_000_000_000n);

  const agentFactory = new AgentFactory(ensRegistry);
  const researchAgent = agentFactory.createAgent(
    '0xbbb0000000000000000000000000000000000001',
    'clio.agent.agi.eth',
    'research',
    { budgetLimit: 6_000_000_000_000_000_000n }
  );

  orchestrator.submitJobs(
    Array.from({ length: 6 }).map((_, index) => ({
      jobId: `job-${index + 1}`,
      domain: index % 2 === 0 ? 'research' : 'operations',
      budget: 5_000_000_000_000_000_000n,
      metadata: {
        prompt: `Autonomous discovery task #${index + 1}`,
        reward: '2500 USDC equivalent',
        safeguards: ['human-review', 'sentinel'],
      },
    }))
  );

  const executedJobs = [];
  for (const jobId of ['job-1', 'job-2', 'job-3', 'job-4', 'job-5', 'job-6']) {
    const outcome = orchestrator.executeJob(
      jobId,
      { profile: researchAgent.profile },
      true,
      3_500_000_000_000_000_000n,
      'call(bytes)'
    );
    executedJobs.push(outcome);
  }

  const { proof, committee, slashEvents } = orchestrator.runValidationRound('round-001', executedJobs.map((job) => job.jobId));

  console.log('\n=== Validator Committee ===');
  for (const member of committee) {
    console.log(`- ${member.ensName} (${member.address}) stake=${member.stake}`);
  }

  console.log('\n=== ZK Batch Proof ===');
  console.log(JSON.stringify(proof, null, 2));

  console.log('\n=== Slash Events ===');
  if (slashEvents.length === 0) {
    console.log('None');
  } else {
    for (const event of slashEvents) {
      console.log(`- ${event.ensName}: ${event.reason} -> new stake ${event.newStake}`);
    }
  }

  console.log('\n=== Domain Status ===');
  console.table(domainController.describe());

  console.log('\n=== Sentinel Alerts ===');
  console.log(sentinel.getAlerts());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
