import { EnsLeaf } from './ens';
import { DemoSetup } from './constellation';
import { AgentAction, JobResult } from './types';

export function demoLeaves(): EnsLeaf[] {
  return [
    { ensName: 'andromeda.club.agi.eth', owner: '0x1111111111111111111111111111111111111111' },
    { ensName: 'orion.club.agi.eth', owner: '0x2222222222222222222222222222222222222222' },
    { ensName: 'hyperion.club.agi.eth', owner: '0x3333333333333333333333333333333333333333' },
    { ensName: 'titan.club.agi.eth', owner: '0x4444444444444444444444444444444444444444' },
    { ensName: 'athena.club.agi.eth', owner: '0x5555555555555555555555555555555555555555' },
    { ensName: 'nova.agent.agi.eth', owner: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { ensName: 'sentinel.agent.agi.eth', owner: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    { ensName: 'polaris.node.agi.eth', owner: '0xcccccccccccccccccccccccccccccccccccccccc' },
  ];
}

export function demoSetup(leaves: EnsLeaf[]): DemoSetup {
  return {
    domains: [
      {
        id: 'deep-space-lab',
        humanName: 'Deep Space Research Lab',
        budgetLimit: 5_000_000n,
        unsafeOpcodes: new Set(['SELFDESTRUCT', 'DELEGATECALL']),
      },
      {
        id: 'lunar-foundry',
        humanName: 'Lunar Foundry',
        budgetLimit: 2_000_000n,
        unsafeOpcodes: new Set(['SELFDESTRUCT']),
      },
    ],
    governance: {
      committeeSize: 4,
      commitPhaseBlocks: 3,
      revealPhaseBlocks: 3,
      quorumPercentage: 75,
      slashPenaltyBps: 1500,
      nonRevealPenaltyBps: 500,
    },
    ensLeaves: leaves,
    verifyingKey: '0x4f8f0a1d4c0b5f6e9d1a2c3b4e5f60718293a4b5c6d7e8f90123456789abcde',
    onChainEntropy: '0x9f1c2e3d4b5a69788766554433221100ffeeddccbbaa99887766554433221100',
    recentBeacon: '0xabcdef0123456789fedcba98765432100123456789abcdef0123456789fedcba',
    sentinelGraceRatio: 0.05,
  };
}

export function demoJobBatch(domainId: string, count: number): JobResult[] {
  const jobs: JobResult[] = [];
  for (let i = 0; i < count; i += 1) {
    jobs.push({
      jobId: `job-${i.toString().padStart(4, '0')}`,
      domainId,
      passed: i % 17 !== 0,
      reportCID: `bafy-${i.toString(16).padStart(6, '0')}`,
    });
  }
  return jobs;
}

export function budgetOverrunAction(agentEns: string, agentAddress: `0x${string}`, domainId: string, overspend: bigint): AgentAction {
  return {
    agent: {
      ensName: agentEns,
      address: agentAddress,
      domainId,
      budget: 1_000_000n,
    },
    domainId,
    type: 'TRANSFER',
    amountSpent: overspend,
    description: 'budget overrun test vector',
  };
}
