import { Gauge, Registry } from 'prom-client';
import type { StakeSnapshot } from '../blockchain/staking';
import type { RewardSnapshot } from '../blockchain/rewards';
import type { IdentityVerificationResult } from '../identity/types';
import type { PlanningSummary } from '../ai/planner';
import type { ReinvestReport } from '../blockchain/reinvest';

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

  constructor() {
    this.registry.setDefaultLabels({ component: 'agi-alpha-node' });
    this.stakeGauge = new Gauge({
      name: 'agi_alpha_node_stake_total',
      help: 'Current platform stake held by the operator (wei).',
      registers: [this.registry]
    });
    this.stakeDeficitGauge = new Gauge({
      name: 'agi_alpha_node_stake_deficit',
      help: 'Additional stake required to satisfy platform minimums (wei).',
      registers: [this.registry]
    });
    this.rewardGauge = new Gauge({
      name: 'agi_alpha_node_rewards_pending',
      help: 'Unclaimed $AGIALPHA rewards (wei).',
      registers: [this.registry]
    });
    this.verificationGauge = new Gauge({
      name: 'agi_alpha_node_identity_status',
      help: 'Identity verification status (1 = verified, 0 = mismatch).',
      registers: [this.registry]
    });
    this.plannerScoreGauge = new Gauge({
      name: 'agi_alpha_node_planner_score',
      help: 'Latest MuZero++ planner alpha score (unitless).',
      registers: [this.registry]
    });
    this.jobOpenGauge = new Gauge({
      name: 'agi_alpha_node_jobs_open',
      help: 'Number of open jobs detected in the latest discovery cycle.',
      registers: [this.registry]
    });
    this.jobRewardGauge = new Gauge({
      name: 'agi_alpha_node_job_reward',
      help: 'Reward of the selected job in $AGIALPHA (ether units).',
      registers: [this.registry]
    });
    this.reinvestAmountGauge = new Gauge({
      name: 'agi_alpha_node_reinvest_last_amount',
      help: 'Amount of $AGIALPHA reinvested in the latest cycle (wei).',
      registers: [this.registry]
    });
    this.reinvestReadinessGauge = new Gauge({
      name: 'agi_alpha_node_reinvest_readiness',
      help: 'Ratio of pending rewards to reinvest threshold.',
      registers: [this.registry]
    });
  }

  updateStake(snapshot: StakeSnapshot): void {
    this.stakeGauge.set(Number(snapshot.currentStake));
    const deficit = snapshot.requiredStake > snapshot.currentStake ? snapshot.requiredStake - snapshot.currentStake : 0n;
    this.stakeDeficitGauge.set(Number(deficit));
  }

  updateRewards(snapshot: RewardSnapshot): void {
    this.rewardGauge.set(Number(snapshot.pending));
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
    const amountEther = Number(report.stakedWei) / 1e18;
    this.reinvestAmountGauge.set(Number.isFinite(amountEther) ? amountEther : 0);
    if (threshold > 0n) {
      const ratioRaw = (report.pendingWei * 1_000_000n) / threshold;
      const ratio = Number(ratioRaw) / 1_000_000;
      this.reinvestReadinessGauge.set(Number.isFinite(ratio) ? ratio : 0);
    } else {
      this.reinvestReadinessGauge.set(0);
    }
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
