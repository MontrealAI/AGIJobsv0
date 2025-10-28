import { Gauge, Registry } from 'prom-client';
import type { StakeSnapshot } from '../blockchain/staking';
import type { RewardSnapshot } from '../blockchain/rewards';
import type { IdentityVerificationResult } from '../identity/types';
import type { PlanningSummary } from '../ai/planner';

export class AlphaNodeMetrics {
  private readonly registry = new Registry();
  private readonly stakeGauge: Gauge<string>;
  private readonly stakeDeficitGauge: Gauge<string>;
  private readonly rewardGauge: Gauge<string>;
  private readonly verificationGauge: Gauge<string>;
  private readonly plannerScoreGauge: Gauge<string>;

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

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
