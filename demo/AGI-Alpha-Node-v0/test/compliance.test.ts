import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComplianceReport,
  ComplianceInputs,
} from '../src/utils/compliance';

const baseInputs: ComplianceInputs = {
  identity: {
    matches: true,
    ensName: 'apollo.alpha.node.agi.eth',
    nodehash: '0x0',
    expectedOwner: '0x0000000000000000000000000000000000000001',
    reasons: [],
    resolution: {
      owner: '0x0000000000000000000000000000000000000001',
      wrapperOwner: '0x0000000000000000000000000000000000000001',
      registrant: '0x0000000000000000000000000000000000000001',
      expiry: Math.floor(Date.now() / 1000) + 86_400,
      contentHash: null,
      records: {
        'agijobs:v2:node': '0x0000000000000000000000000000000000000001',
      },
    },
  },
  stake: {
    currentStake: 5_000_000_000_000_000_000n,
    requiredStake: 1_000_000_000_000_000_000n,
    allowance: 10_000_000_000_000_000_000n,
    tokenBalance: 20_000_000_000_000_000_000n,
    registered: true,
    paused: false,
    minimums: {
      global: 1_000_000_000_000_000_000n,
      platformRole: 1_000_000_000_000_000_000n,
      registry: 1_000_000_000_000_000_000n,
      config: 1_000_000_000_000_000_000n,
    },
  },
  governance: {
    operator: '0x0000000000000000000000000000000000000001',
    governance: '0x0000000000000000000000000000000000000001',
    paused: false,
    operatorIsGovernance: true,
    operatorBlacklisted: false,
  },
  rewards: {
    boostedStake: 5_000_000_000_000_000_000n,
    cumulativePerToken: 0n,
    checkpoint: 0n,
    pending: 4_000_000_000_000_000_000n,
    projectedDaily: '42.0',
  },
  plan: {
    summary: {
      selectedJobId: '123',
      alphaScore: 8.6,
      expectedValue: 7.2,
      explorationScore: 1.1,
      exploitationScore: 7.5,
      curriculumDifficulty: 0.75,
      consideredJobs: 3,
    },
    insights: [
      {
        specialistId: 'finance',
        confidence: 0.92,
        contribution: 'Capital markets strategist engaged.',
        recommendedAction: 'engage',
      },
    ],
    worldModel: {
      expectedReturn: 22.5,
      downsideRisk: 0.12,
      volatility: 8.4,
      valueAtRisk: 3.1,
      conditionalValueAtRisk: 1.8,
      percentile10: 3.1,
      percentile50: 24.2,
      percentile90: 38.4,
      bestPath: {
        totalReturn: 44.1,
        steps: [
          {
            step: 0,
            jobId: 'alpha',
            success: true,
            baseReward: 12,
            adjustedReturn: 12,
            cumulativeReturn: 12,
          },
        ],
      },
      worstPath: {
        totalReturn: -2.1,
        steps: [
          {
            step: 0,
            jobId: 'omega',
            success: false,
            baseReward: 9,
            adjustedReturn: -2.1,
            cumulativeReturn: -2.1,
          },
        ],
      },
      simulations: 256,
      horizon: 5,
    },
  },
  stress: [
    { id: 'scenario-a', passed: true, severity: 3, notes: 'Nominal.' },
    { id: 'scenario-b', passed: true, severity: 4, notes: 'Mitigated.' },
  ],
  reinvestment: {
    dryRun: false,
    thresholdWei: 2_000_000_000_000_000_000n,
    pendingWei: 4_000_000_000_000_000_000n,
    claimedWei: 4_000_000_000_000_000_000n,
    stakedWei: 4_000_000_000_000_000_000n,
    notes: ['Reinvested successfully.'],
  },
};

test('compliance report generates high score for healthy node', () => {
  const report = computeComplianceReport(baseInputs);
  assert(report.score > 0.75);
  const identity = report.dimensions.find(
    (dimension) => dimension.label === 'Identity'
  );
  assert(identity?.status === 'pass');
  const governance = report.dimensions.find(
    (dimension) => dimension.label === 'Governance & Safety'
  );
  assert(governance?.status === 'pass');
});

test('governance risk downgrades scorecard', () => {
  const healthy = computeComplianceReport(baseInputs);
  const riskyReport = computeComplianceReport({
    ...baseInputs,
    identity: { ...baseInputs.identity, matches: false, reasons: ['Mismatch'] },
    governance: {
      ...baseInputs.governance,
      operatorIsGovernance: false,
      operatorBlacklisted: true,
      governance: '0x0000000000000000000000000000000000000002',
    },
  });
  const governance = riskyReport.dimensions.find(
    (dimension) => dimension.label === 'Governance & Safety'
  );
  assert(governance?.status === 'fail');
  assert(riskyReport.score < healthy.score);
});
