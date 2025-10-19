import { randomUUID } from 'node:crypto';
import {
  BOLTZMANN_CONSTANT,
  computeEnergyMetrics,
  computeValidatorEntropy,
  toPercentage,
  toPrecision,
  type EnergyComputationInput,
  type GovernanceEnergyMetrics,
} from '../../../apps/enterprise-portal/src/lib/agiGovernanceAnalytics';

export type ScenarioValidator = {
  id: string;
  label: string;
  entropyWeight: number;
};

export type ScenarioNation = {
  id: string;
  label: string;
  summary: string;
  uri: string;
  reward: number;
  deadlineHours: number;
  entropy: number;
  dissipation: number;
};

export type ScenarioOwner = {
  initialApprovals: number;
  upgradedApprovals: number;
  initialCommitWindowSeconds: number;
  initialRevealWindowSeconds: number;
  postUpgradeCommitWindowSeconds: number;
  postUpgradeRevealWindowSeconds: number;
  hamiltonianThreshold: number;
  hamiltonianWeight: number;
  minStake: number;
};

export type GovernanceScenario = {
  version: string;
  temperatureKelvin: number;
  discountFactor: number;
  lambda: number;
  landauerMultiplier: number;
  validators: ScenarioValidator[];
  nations: ScenarioNation[];
  owner: ScenarioOwner;
};

export type GovernanceTimelineEvent = {
  id: string;
  at: string;
  actor: string;
  label: string;
  category: 'setup' | 'stake' | 'policy' | 'validation' | 'owner' | 'analytics';
  jobId?: number;
  txHash?: string;
  notes?: string;
};

export type GovernanceOwnerAction = {
  id: string;
  at: string;
  label: string;
  txHash?: string;
  before: Record<string, string>;
  after: Record<string, string>;
};

export type GovernanceJobRecord = {
  id: number;
  nationId: string;
  nationLabel: string;
  employer: string;
  agent: string;
  reward: string;
  feePct: string;
  deadline: string;
  specHash: string;
  resultHash?: string;
  burnHash?: string;
  approvals: number;
  validators: number;
  status: string;
  entropy: number;
  dissipation: number;
};

export type GovernanceValidatorRecord = {
  id: string;
  address: string;
  stake: string;
  approvals: number;
  rejections: number;
  commits: number;
  reveals: number;
  antifragility: number;
};

export type GovernancePlatformSnapshot = {
  token: string;
  stakingTokenSymbol: string;
  stakeManager: string;
  jobRegistry: string;
  validationModule: string;
  reputationEngine: string;
  disputeModule: string;
  certificate: string;
  feePool: string;
  owner: string;
  treasury: string;
  feePct: string;
  requiredApprovals: string;
  validatorsPerJob: string;
  commitWindow: string;
  revealWindow: string;
  minStake: string;
  hamiltonianThreshold: string;
  hamiltonianWeight: string;
};

export type GovernanceTranscript = {
  version: string;
  generatedAt: string;
  network: string;
  scenario: GovernanceScenario;
  platform: GovernancePlatformSnapshot;
  energy: GovernanceEnergyMetrics;
  jobs: GovernanceJobRecord[];
  validators: GovernanceValidatorRecord[];
  ownerActions: GovernanceOwnerAction[];
  timeline: GovernanceTimelineEvent[];
  metrics: {
    cooperationIndex: number;
    treasuryInflows: number;
    stakeLocked: number;
    rewardDisbursed: number;
  };
  script: {
    runId: string;
    durationMs: number;
  };
};

export function createTimelineEvent(event: Omit<GovernanceTimelineEvent, 'id' | 'at'> & { at?: string }): GovernanceTimelineEvent {
  return {
    id: randomUUID(),
    at: event.at ?? new Date().toISOString(),
    actor: event.actor,
    label: event.label,
    category: event.category,
    jobId: event.jobId,
    txHash: event.txHash,
    notes: event.notes,
  };
}

export function createOwnerAction(action: Omit<GovernanceOwnerAction, 'id'>): GovernanceOwnerAction {
  return {
    id: randomUUID(),
    at: action.at,
    label: action.label,
    txHash: action.txHash,
    before: action.before,
    after: action.after,
  };
}

export {
  BOLTZMANN_CONSTANT,
  computeEnergyMetrics,
  computeValidatorEntropy,
  toPrecision,
  toPercentage,
};

export type { GovernanceEnergyMetrics, EnergyComputationInput };

