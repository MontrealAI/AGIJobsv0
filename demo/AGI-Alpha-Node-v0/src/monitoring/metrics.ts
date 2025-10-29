import { Gauge, Registry } from 'prom-client';
import type { StakeSnapshot } from '../blockchain/staking';
import type { RewardSnapshot } from '../blockchain/rewards';
import type { IdentityVerificationResult } from '../identity/types';
import type { PlanningSummary } from '../ai/planner';
import type { ReinvestReport } from '../blockchain/reinvest';
import { ratioFromWei, weiToEtherNumber } from '../utils/amounts';
import type { WorldModelProjection } from '../ai/worldModel';

export class AlphaNodeMetrics {
  private readonly registry = new Registry();
  private readonly stakeGauge: Gauge<string>;
  private readonly stakeDeficitGauge: Gauge<string>;
  private readonly rewardGauge: Gauge<string>;
  private readonly verificationGauge: Gauge<string>;
  private readonly plannerScoreGauge: Gauge<string>;
  private readonly jobOpenGauge: Gauge<string>;
  private readonly jobRewardGauge: Gauge<string>;
  private readonly reinvestAmountGauge: Gauge<string>;
  private readonly reinvestReadinessGauge: Gauge<string>;
  private readonly complianceGauge: Gauge<string>;
  private readonly worldModelReturnGauge: Gauge<string>;
  private readonly worldModelRiskGauge: Gauge<string>;
  private readonly worldModelVolatilityGauge: Gauge<string>;

  constructor() {
    this.registry.setDefaultLabels({ component: 'agi-alpha-node' });
    this.stakeGauge = new Gauge({
      name: 'agi_alpha_node_stake_total',
      help: 'Current platform stake held by the operator ($AGIALPHA).',
      registers: [this.registry],
    });
    this.stakeDeficitGauge = new Gauge({
      name: 'agi_alpha_node_stake_deficit',
      help: 'Additional stake required to satisfy platform minimums ($AGIALPHA).',
      registers: [this.registry],
    });
    this.rewardGauge = new Gauge({
      name: 'agi_alpha_node_rewards_pending',
      help: 'Unclaimed $AGIALPHA rewards.',
      registers: [this.registry],
    });
    this.verificationGauge = new Gauge({
      name: 'agi_alpha_node_identity_status',
      help: 'Identity verification status (1 = verified, 0 = mismatch).',
      registers: [this.registry],
    });
    this.plannerScoreGauge = new Gauge({
      name: 'agi_alpha_node_planner_score',
      help: 'Latest MuZero++ planner alpha score (unitless).',
      registers: [this.registry],
    });
    this.jobOpenGauge = new Gauge({
      name: 'agi_alpha_node_jobs_open',
      help: 'Number of open jobs detected in the latest discovery cycle.',
      registers: [this.registry],
    });
    this.jobRewardGauge = new Gauge({
      name: 'agi_alpha_node_job_reward',
      help: 'Reward of the selected job in $AGIALPHA (ether units).',
      registers: [this.registry],
    });
    this.reinvestAmountGauge = new Gauge({
      name: 'agi_alpha_node_reinvest_last_amount',
      help: 'Amount of $AGIALPHA reinvested in the latest cycle.',
      registers: [this.registry],
    });
    this.reinvestReadinessGauge = new Gauge({
      name: 'agi_alpha_node_reinvest_readiness',
      help: 'Ratio of pending rewards to reinvest threshold.',
      registers: [this.registry],
    });
    this.complianceGauge = new Gauge({
      name: 'agi_alpha_node_compliance_score',
      help: 'Composite compliance score across governance, staking, and intelligence (0-1).',
      registers: [this.registry],
    });
    this.worldModelReturnGauge = new Gauge({
      name: 'agi_alpha_node_world_model_expected_return',
      help: 'Expected discounted return from the world-model simulation.',
      registers: [this.registry],
    });
    this.worldModelRiskGauge = new Gauge({
      name: 'agi_alpha_node_world_model_downside_risk',
      help: 'Probability that the world-model simulation produces a negative return.',
      registers: [this.registry],
    });
    this.worldModelVolatilityGauge = new Gauge({
      name: 'agi_alpha_node_world_model_volatility',
      help: 'Standard deviation of the world-model return distribution.',
      registers: [this.registry],
    });
  }

  updateStake(snapshot: StakeSnapshot): void {
    this.stakeGauge.set(weiToEtherNumber(snapshot.currentStake));
    const deficit =
      snapshot.requiredStake > snapshot.currentStake
        ? snapshot.requiredStake - snapshot.currentStake
        : 0n;
    this.stakeDeficitGauge.set(weiToEtherNumber(deficit));
  }

  updateRewards(snapshot: RewardSnapshot): void {
    this.rewardGauge.set(weiToEtherNumber(snapshot.pending));
  }

  updateIdentity(result: IdentityVerificationResult): void {
    this.verificationGauge.set(result.matches ? 1 : 0);
  }

  updatePlanning(summary: PlanningSummary): void {
    this.plannerScoreGauge.set(summary.alphaScore);
  }

  updateJobDiscovery(openJobs: number): void {
    this.jobOpenGauge.set(openJobs);
  }

  updateJobExecution(reward: number | undefined): void {
    if (typeof reward === 'number' && Number.isFinite(reward)) {
      this.jobRewardGauge.set(reward);
    } else {
      this.jobRewardGauge.set(0);
    }
  }

  updateReinvestment(report: ReinvestReport, threshold: bigint): void {
    const amountEther = weiToEtherNumber(report.stakedWei);
    this.reinvestAmountGauge.set(amountEther);
    const readiness = ratioFromWei(report.pendingWei, threshold);
    this.reinvestReadinessGauge.set(readiness);
  }

  updateCompliance(score: number): void {
    this.complianceGauge.set(score);
  }

  updateWorldModel(projection: WorldModelProjection): void {
    this.worldModelReturnGauge.set(projection.expectedReturn);
    this.worldModelRiskGauge.set(projection.downsideRisk);
    this.worldModelVolatilityGauge.set(projection.volatility);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
