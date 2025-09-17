import { expect } from 'chai';
import { filterMatchesByProfitability } from '../../agent-gateway/orchestrator';
import type { MatchResult } from '../../agent-gateway/agentRegistry';
import type { AgentProfile, JobAnalysis } from '../../agent-gateway/agentRegistry';
import type { Job } from '../../agent-gateway/types';

function createJob(): Job {
  return {
    jobId: '1',
    employer: '0x0000000000000000000000000000000000000001',
    agent: '0x0000000000000000000000000000000000000000',
    rewardRaw: '1000000000000000000',
    reward: '1.0',
    stakeRaw: '0',
    stake: '0',
    feeRaw: '0',
    fee: '0',
    specHash: '0x',
    uri: '',
  };
}

function createProfile(address: string, overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    address,
    ensName: `${address.slice(2, 6)}.agent.agi.eth`,
    label: address.slice(2, 6),
    role: 'agent',
    categories: ['analysis'],
    skills: ['solidity'],
    reputationScore: 0.5,
    successRate: 0.5,
    totalJobs: 10,
    averageEnergy: overrides.averageEnergy ?? 5,
    averageDurationMs: 1000,
    stakeBalance: overrides.stakeBalance,
    endpoint: overrides.endpoint,
    metadata: overrides.metadata,
    configMetadata: overrides.configMetadata,
  };
}

const baseAnalysis: JobAnalysis = {
  jobId: '1',
  reward: 1n,
  stake: 0n,
  fee: 0n,
  employer: '0x0000000000000000000000000000000000000001',
  description: 'unit test',
};

function createMatch(
  profile: AgentProfile,
  overrides: Partial<MatchResult> = {}
): MatchResult {
  return {
    profile,
    score: overrides.score ?? 1,
    analysis: overrides.analysis ?? baseAnalysis,
    reasons: overrides.reasons ?? [],
    thermodynamics: overrides.thermodynamics,
    rewardValue: overrides.rewardValue,
    estimatedEnergy: overrides.estimatedEnergy,
    rewardPerEnergy: overrides.rewardPerEnergy,
  };
}

describe('filterMatchesByProfitability', () => {
  const originalMinReward = process.env.ORCHESTRATOR_MIN_EXPECTED_REWARD;
  const originalMinRpe = process.env.ORCHESTRATOR_MIN_REWARD_PER_ENERGY;
  const originalMaxEnergy = process.env.ORCHESTRATOR_MAX_EXPECTED_ENERGY;

  const job = createJob();

  afterEach(() => {
    if (originalMinReward === undefined) {
      delete process.env.ORCHESTRATOR_MIN_EXPECTED_REWARD;
    } else {
      process.env.ORCHESTRATOR_MIN_EXPECTED_REWARD = originalMinReward;
    }
    if (originalMinRpe === undefined) {
      delete process.env.ORCHESTRATOR_MIN_REWARD_PER_ENERGY;
    } else {
      process.env.ORCHESTRATOR_MIN_REWARD_PER_ENERGY = originalMinRpe;
    }
    if (originalMaxEnergy === undefined) {
      delete process.env.ORCHESTRATOR_MAX_EXPECTED_ENERGY;
    } else {
      process.env.ORCHESTRATOR_MAX_EXPECTED_ENERGY = originalMaxEnergy;
    }
  });

  it('filters candidates below the reward-per-energy threshold', () => {
    process.env.ORCHESTRATOR_MIN_REWARD_PER_ENERGY = '2.0';
    const strong = createMatch(createProfile('0x00000000000000000000000000000000000000a1'), {
      rewardValue: 6,
      estimatedEnergy: 2,
      rewardPerEnergy: 3,
    });
    const weak = createMatch(createProfile('0x00000000000000000000000000000000000000a2'), {
      rewardValue: 3,
      estimatedEnergy: 3,
      rewardPerEnergy: 1,
    });
    const result = filterMatchesByProfitability(job, [strong, weak]);
    expect(result).to.have.lengthOf(1);
    expect(result[0].profile.address).to.equal(strong.profile.address);
    expect(
      weak.reasons.some((reason) =>
        reason.includes('filtered:profitability:reward-per-energy')
      )
    ).to.equal(true);
  });

  it('filters candidates that exceed the energy ceiling', () => {
    process.env.ORCHESTRATOR_MAX_EXPECTED_ENERGY = '4';
    const acceptable = createMatch(
      createProfile('0x00000000000000000000000000000000000000b1'),
      {
        estimatedEnergy: 3,
        rewardValue: 5,
        rewardPerEnergy: 1.6,
      }
    );
    const excessive = createMatch(
      createProfile('0x00000000000000000000000000000000000000b2'),
      {
        estimatedEnergy: 10,
        rewardValue: 5,
        rewardPerEnergy: 0.5,
      }
    );
    const result = filterMatchesByProfitability(job, [acceptable, excessive]);
    expect(result).to.have.lengthOf(1);
    expect(result[0].profile.address).to.equal(acceptable.profile.address);
    expect(
      excessive.reasons.some((reason) =>
        reason.includes('filtered:profitability:energy')
      )
    ).to.equal(true);
  });

  it('keeps matches when telemetry is unavailable', () => {
    process.env.ORCHESTRATOR_MIN_REWARD_PER_ENERGY = '3';
    const uncertainProfile = createProfile(
      '0x00000000000000000000000000000000000000c1',
      { averageEnergy: Number.NaN }
    );
    const uncertain = createMatch(uncertainProfile, {
      rewardValue: 4,
      estimatedEnergy: undefined,
      rewardPerEnergy: undefined,
    });
    const result = filterMatchesByProfitability(job, [uncertain]);
    expect(result).to.have.lengthOf(1);
    expect(result[0].profile.address).to.equal(uncertain.profile.address);
    expect(
      uncertain.reasons.some((reason) => reason.startsWith('filtered:'))
    ).to.equal(false);
  });
});
