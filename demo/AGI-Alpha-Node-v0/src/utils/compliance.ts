import { IdentityVerificationResult } from '../identity/types';
import { StakeSnapshot } from '../blockchain/staking';
import { RewardSnapshot } from '../blockchain/rewards';
import { SpecialistInsight } from '../ai/orchestrator';
import { PlanningSummary } from '../ai/planner';
import { WorldModelProjection } from '../ai/worldModel';
import { StressTestResult } from '../ai/antifragile';
import { ReinvestReport } from '../blockchain/reinvest';
import { GovernanceSnapshot } from '../blockchain/governance';
import { ratioFromWei, weiToEtherNumber } from './amounts';

export type ComplianceStatus = 'pass' | 'warn' | 'fail';

export interface ComplianceDimension {
  readonly label: string;
  readonly status: ComplianceStatus;
  readonly score: number;
  readonly notes: readonly string[];
}

export interface AlphaNodeComplianceReport {
  readonly timestamp: string;
  readonly score: number;
  readonly dimensions: readonly ComplianceDimension[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(value, 1));
}

function determineStatus(
  score: number,
  failureCondition?: boolean
): ComplianceStatus {
  if (failureCondition) {
    return 'fail';
  }
  if (score >= 0.85) {
    return 'pass';
  }
  if (score >= 0.55) {
    return 'warn';
  }
  return 'fail';
}

export interface ComplianceInputs {
  readonly identity: IdentityVerificationResult;
  readonly stake: StakeSnapshot;
  readonly governance: GovernanceSnapshot;
  readonly rewards: RewardSnapshot;
  readonly plan: {
    readonly summary: PlanningSummary;
    readonly insights: readonly SpecialistInsight[];
    readonly worldModel: WorldModelProjection;
  };
  readonly stress: readonly StressTestResult[];
  readonly reinvestment: ReinvestReport;
}

export function computeComplianceReport(
  inputs: ComplianceInputs
): AlphaNodeComplianceReport {
  const dimensions: ComplianceDimension[] = [];

  const identityScore = inputs.identity.matches ? 1 : 0;
  const identityNotes = inputs.identity.matches
    ? ['ENS ownership, wrapper, and text attestations verified.']
    : inputs.identity.reasons;
  dimensions.push({
    label: 'Identity',
    status: determineStatus(identityScore),
    score: identityScore,
    notes: identityNotes,
  });

  const stakeAdequacy =
    inputs.stake.currentStake >= inputs.stake.requiredStake ? 1 : 0;
  const pausePenalty = inputs.stake.paused ? 0.2 : 0;
  const stakingScore = clampScore(stakeAdequacy - pausePenalty);
  const stakeNotes = [] as string[];
  if (stakeAdequacy === 1) {
    stakeNotes.push(
      'Stake satisfies minimum requirements across platform, role, and registry.'
    );
  } else {
    stakeNotes.push(
      'Stake below required threshold. Execute staking command immediately.'
    );
  }
  if (inputs.stake.paused) {
    stakeNotes.push(
      'SystemPause currently active. Investigate incident response runbook.'
    );
  }
  if (!inputs.stake.registered) {
    stakeNotes.push(
      'Operator not registered in PlatformRegistry. Complete activation.'
    );
  }
  dimensions.push({
    label: 'Staking & Activation',
    status: determineStatus(stakingScore, !inputs.stake.registered),
    score: stakingScore,
    notes: stakeNotes,
  });

  const governanceScore = clampScore(
    (inputs.governance.operatorIsGovernance ? 1 : 0.4) -
      (inputs.governance.operatorBlacklisted ? 0.6 : 0)
  );
  const governanceNotes: string[] = [];
  if (inputs.governance.operatorIsGovernance) {
    governanceNotes.push('Operator controls SystemPause governance.');
  } else {
    governanceNotes.push(
      `SystemPause governed by ${inputs.governance.governance}. Consider multisig delegation.`
    );
  }
  if (inputs.governance.operatorBlacklisted) {
    governanceNotes.push(
      'Operator is blacklisted. Submit reinstatement request.'
    );
  }
  if (inputs.governance.paused) {
    governanceNotes.push('System currently paused.');
  }
  dimensions.push({
    label: 'Governance & Safety',
    status: determineStatus(
      governanceScore,
      inputs.governance.operatorBlacklisted
    ),
    score: governanceScore,
    notes: governanceNotes,
  });

  const rewardsPending = weiToEtherNumber(inputs.rewards.pending);
  const reinvestRatio = ratioFromWei(
    inputs.reinvestment.pendingWei,
    inputs.reinvestment.thresholdWei
  );
  const economyScore = clampScore(
    Math.min(rewardsPending / 10, 1) * 0.4 + Math.min(reinvestRatio, 1) * 0.6
  );
  const economyNotes = [
    `Pending rewards: ${rewardsPending.toFixed(4)} $AGIALPHA.`,
    `Reinvestment readiness: ${(reinvestRatio * 100).toFixed(2)}%.`,
  ];
  if (!inputs.reinvestment.dryRun && inputs.reinvestment.stakedWei > 0n) {
    economyNotes.push('Autonomous reinvestment executed this cycle.');
  }
  dimensions.push({
    label: 'Economic Engine',
    status: determineStatus(economyScore),
    score: economyScore,
    notes: economyNotes,
  });

  const stressPassed = inputs.stress.filter((result) => result.passed).length;
  const stressScore = clampScore(
    inputs.stress.length === 0 ? 0.5 : stressPassed / inputs.stress.length
  );
  const stressNotes = inputs.stress.map(
    (result) =>
      `${result.id}: ${result.passed ? 'PASS' : 'IMPROVE'} – ${result.notes}`
  );
  dimensions.push({
    label: 'Antifragile Shell',
    status: determineStatus(stressScore, stressScore < 0.4),
    score: stressScore,
    notes: stressNotes,
  });

  const plannerScore = clampScore(inputs.plan.summary.alphaScore / 10);
  const hasJob = Boolean(inputs.plan.summary.selectedJobId);
  const worldModel = inputs.plan.worldModel;
  const returnScore = clampScore(
    worldModel.expectedReturn /
      (Math.abs(worldModel.expectedReturn) + worldModel.volatility + 1)
  );
  const riskScore = clampScore(1 - worldModel.downsideRisk);
  const worldModelScore = clampScore(0.5 * returnScore + 0.5 * riskScore);
  const intelligenceScore = clampScore((plannerScore + worldModelScore) / 2);
  const insightsPreview = inputs.plan.insights.slice(0, 3).map((insight) => {
    const confidencePct = Math.round(insight.confidence * 100);
    return `${insight.specialistId} (${confidencePct}%): ${insight.recommendedAction} – ${insight.contribution}`;
  });
  const intelligenceNotes = [
    hasJob
      ? `Selected job ${inputs.plan.summary.selectedJobId}.`
      : 'Awaiting strategic job selection.',
    `Alpha score ${inputs.plan.summary.alphaScore.toFixed(2)}.`,
    `World-model expected return ${worldModel.expectedReturn.toFixed(2)} $AGIALPHA.`,
    `Downside risk ${(worldModel.downsideRisk * 100).toFixed(1)}%.`,
    `Value-at-risk (10th percentile) ${worldModel.valueAtRisk.toFixed(2)} $AGIALPHA.`,
    ...insightsPreview,
  ];
  dimensions.push({
    label: 'Strategic Intelligence',
    status: determineStatus(
      intelligenceScore,
      !hasJob || worldModel.downsideRisk > 0.6
    ),
    score: intelligenceScore,
    notes: intelligenceNotes,
  });

  const score =
    dimensions.reduce((acc, dimension) => acc + dimension.score, 0) /
    dimensions.length;

  return {
    timestamp: new Date().toISOString(),
    score: clampScore(score),
    dimensions,
  };
}
