#!/usr/bin/env ts-node
import { ValidatorConstellation } from '../src/validatorConstellation';
import { CommitRevealWindowConfig, DemoScenarioConfig } from '../src/types';

const config: CommitRevealWindowConfig = {
  commitWindowSeconds: 90,
  revealWindowSeconds: 90,
  vrfSeed: 'constellation-scenario',
  validatorsPerJob: 4,
  revealQuorum: 3,
  nonRevealPenaltyBps: 800,
  incorrectVotePenaltyBps: 1500,
};

const scenario: DemoScenarioConfig = {
  validators: [
    { address: '0x300', ensName: 'apollo.club.agi.eth', domain: 'core', stake: 1_900n },
    { address: '0x301', ensName: 'artemis.club.agi.eth', domain: 'core', stake: 1_950n },
    { address: '0x302', ensName: 'hermes.alpha.club.agi.eth', domain: 'core', stake: 2_200n },
    { address: '0x303', ensName: 'hera.club.agi.eth', domain: 'core', stake: 1_850n },
  ],
  agents: [
    { address: '0x400', ensName: 'helios.agent.agi.eth', domain: 'core', budget: 7_500n },
  ],
  jobs: [
    { jobId: 'job-21', domain: 'core', outcome: 'approved' },
    { jobId: 'job-22', domain: 'core', outcome: 'rejected' },
    { jobId: 'job-23', domain: 'core', outcome: 'approved' },
    { jobId: 'job-24', domain: 'core', outcome: 'rejected' },
  ],
  anomalies: [
    {
      agent: { address: '0x400', ensName: 'helios.agent.agi.eth', domain: 'core', budget: 7_500n },
      attemptedSpend: 9_000n,
      maxBudget: 7_500n,
      timestamp: Date.now(),
    },
  ],
  committeeConfig: config,
};

async function main() {
  const constellation = new ValidatorConstellation(config, '0xowner');
  const report = constellation.runDemoScenario(scenario);
  const replacer = (_key: string, value: unknown) => (typeof value === 'bigint' ? value.toString() : value);
  console.log(JSON.stringify(report, replacer, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
