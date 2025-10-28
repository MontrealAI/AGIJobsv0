#!/usr/bin/env ts-node
import { ValidatorConstellation } from '../src/validatorConstellation';
import { CommitRevealWindowConfig, DemoScenarioConfig } from '../src/types';

const owner = process.env.DEMO_OWNER ?? '0xowner000000000000000000000000000000000001';

const config: CommitRevealWindowConfig = {
  commitWindowSeconds: 120,
  revealWindowSeconds: 120,
  vrfSeed: 'stellar-entropy',
  validatorsPerJob: 5,
  revealQuorum: 3,
  nonRevealPenaltyBps: 500,
  incorrectVotePenaltyBps: 1500,
};

const scenario: DemoScenarioConfig = {
  validators: [
    { address: '0x100', ensName: 'hyperion.club.agi.eth', domain: 'core', stake: 2_000n },
    { address: '0x101', ensName: 'atlas.club.agi.eth', domain: 'core', stake: 2_500n },
    { address: '0x102', ensName: 'phoenix.alpha.club.agi.eth', domain: 'core', stake: 1_800n },
    { address: '0x103', ensName: 'daedalus.club.agi.eth', domain: 'core', stake: 2_200n },
    { address: '0x104', ensName: 'icarus.club.agi.eth', domain: 'core', stake: 2_750n },
  ],
  agents: [
    { address: '0x200', ensName: 'hestia.agent.agi.eth', domain: 'core', budget: 5_000n },
    { address: '0x201', ensName: 'prometheus.agent.agi.eth', domain: 'governance', budget: 3_000n },
  ],
  jobs: [
    { jobId: 'job-001', domain: 'core', outcome: 'approved' },
    { jobId: 'job-002', domain: 'core', outcome: 'approved' },
    { jobId: 'job-003', domain: 'core', outcome: 'approved' },
  ],
  anomalies: [
    {
      agent: { address: '0x200', ensName: 'hestia.agent.agi.eth', domain: 'core', budget: 5_000n },
      attemptedSpend: 10_000n,
      maxBudget: 5_000n,
      timestamp: Date.now(),
    },
  ],
  committeeConfig: config,
};

async function main() {
  const constellation = new ValidatorConstellation(config, owner);
  const result = constellation.runDemoScenario(scenario);
  console.log('\n=== Validator Constellation Demo Summary ===');
  console.log('Owner:', owner);
  console.log('Validators:', result.dashboard.validators.map((v) => `${v.ensName} (${v.address})`).join(', '));
  console.log('Jobs finalized:', result.finalJobs.map((job) => `${job.jobId}:${job.finalized ? 'finalized' : 'pending'}`).join(', '));
  console.log('ZK batches:', result.batchProofs.length);
  console.log('Sentinel alerts:', result.sentinelAlerts.map((alert) => `${alert.domain}:${alert.reason}`).join(', '));
  console.log('Paused domains:', result.pausedDomains.map((pause) => `${pause.domain} (reason=${pause.reason})`).join(', '));
  console.log('Stake slashes:', result.slashes.map((slash) => `${slash.validator.ensName}:${slash.penalty.toString()}`).join(', ') || 'none');
  console.log('\nTelemetry:');
  constellation.getTelemetry().forEach((telemetry) => {
    console.log(` - Job ${telemetry.jobId} committee=${telemetry.committee.join(',')} commitDeadline=${telemetry.commitDeadline} revealDeadline=${telemetry.revealDeadline}`);
  });
  console.log('\nEvents:');
  constellation.getEvents().forEach((event) => {
    console.log(` [${event.blockNumber}] ${event.type} ->`, event.data);
  });
}

main().catch((error) => {
  console.error('Demo execution failed', error);
  process.exitCode = 1;
});
