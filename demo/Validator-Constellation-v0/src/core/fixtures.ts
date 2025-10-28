import { EnsLeaf } from './ens';
import { DemoSetup } from './constellation';
import { AgentAction, DomainConfig, GovernanceParameters, Hex, JobResult } from './types';

const RAW_DOMAIN_TEMPLATES: Array<{
  id: string;
  humanName: string;
  budgetLimit: bigint;
  unsafeOpcodes: string[];
  allowedTargets: string[];
  maxCalldataBytes: number;
}> = [
  {
    id: 'deep-space-lab',
    humanName: 'Deep Space Research Lab',
    budgetLimit: 5_000_000n,
    unsafeOpcodes: ['SELFDESTRUCT', 'DELEGATECALL'],
    allowedTargets: [
      '0xa11ce5c1e11ce000000000000000000000000000',
      '0xbeac0babe00000000000000000000000000000000',
    ],
    maxCalldataBytes: 4096,
  },
  {
    id: 'lunar-foundry',
    humanName: 'Lunar Foundry',
    budgetLimit: 2_000_000n,
    unsafeOpcodes: ['SELFDESTRUCT'],
    allowedTargets: ['0xf0undry0ps000000000000000000000000000000'],
    maxCalldataBytes: 2048,
  },
];

export const DEFAULT_GOVERNANCE_PARAMETERS: GovernanceParameters = {
  committeeSize: 4,
  commitPhaseBlocks: 3,
  revealPhaseBlocks: 3,
  quorumPercentage: 75,
  slashPenaltyBps: 1500,
  nonRevealPenaltyBps: 500,
};

export const DEFAULT_VERIFIER_KEY: Hex =
  '0x4f8f0a1d4c0b5f6e9d1a2c3b4e5f60718293a4b5c6d7e8f90123456789abcde';

export const DEFAULT_ONCHAIN_ENTROPY: Hex =
  '0x9f1c2e3d4b5a69788766554433221100ffeeddccbbaa99887766554433221100';

export const DEFAULT_BEACON_ENTROPY: Hex =
  '0xabcdef0123456789fedcba98765432100123456789abcdef0123456789fedcba';

export const DEFAULT_SENTINEL_GRACE_RATIO = 0.05;

export function defaultDomains(): DomainConfig[] {
  return RAW_DOMAIN_TEMPLATES.map((domain) => ({
    id: domain.id,
    humanName: domain.humanName,
    budgetLimit: domain.budgetLimit,
    unsafeOpcodes: new Set(domain.unsafeOpcodes),
    allowedTargets: new Set(domain.allowedTargets.map((target) => target.toLowerCase())),
    maxCalldataBytes: domain.maxCalldataBytes,
  }));
}

export function defaultGovernance(): GovernanceParameters {
  return { ...DEFAULT_GOVERNANCE_PARAMETERS };
}

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
    { ensName: 'selene.alpha.node.agi.eth', owner: '0xdddddddddddddddddddddddddddddddddddddddd' },
  ];
}

export function demoSetup(leaves: EnsLeaf[]): DemoSetup {
  return {
    domains: defaultDomains(),
    governance: defaultGovernance(),
    ensLeaves: leaves,
    verifyingKey: DEFAULT_VERIFIER_KEY,
    onChainEntropy: DEFAULT_ONCHAIN_ENTROPY,
    recentBeacon: DEFAULT_BEACON_ENTROPY,
    sentinelGraceRatio: DEFAULT_SENTINEL_GRACE_RATIO,
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

export function budgetOverrunAction(
  agentEns: string,
  agentAddress: `0x${string}`,
  domainId: string,
  overspend: bigint,
  budget = 1_000_000n,
): AgentAction {
  return {
    agent: {
      ensName: agentEns,
      address: agentAddress,
      domainId,
      budget,
    },
    domainId,
    type: 'TRANSFER',
    amountSpent: overspend,
    description: 'budget overrun test vector',
  };
}
