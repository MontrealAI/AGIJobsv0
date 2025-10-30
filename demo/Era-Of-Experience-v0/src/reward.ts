import { RewardWeights, AssignmentOutcome } from './types';

export class RewardComposer {
  constructor(private readonly weights: RewardWeights) {}

  public calculate(outcome: AssignmentOutcome): number {
    const w = this.weights;
    const successTerm = outcome.success ? 1 : -1;
    const valueTerm = Math.log1p(outcome.experience.metrics.value) / Math.log(1 + w.costReference + w.latencyReference);
    const latencyTerm = this.normalise(outcome.durationHours, w.latencyReference);
    const costTerm = this.normalise(outcome.cost, w.costReference);
    const satisfactionTerm = this.normalise(outcome.satisfaction, w.satisfactionReference);
    const compoundingTerm = this.estimateCompounding(outcome);

    const reward = (
      w.successWeight * successTerm +
      w.valueWeight * valueTerm -
      w.latencyWeight * latencyTerm -
      w.costWeight * costTerm +
      w.satisfactionWeight * satisfactionTerm +
      w.longTermCompoundingWeight * compoundingTerm
    );

    return Number.isFinite(reward) ? reward : 0;
  }

  private normalise(value: number, reference: number): number {
    if (reference === 0) {
      return value;
    }
    return value / reference;
  }

  private estimateCompounding(outcome: AssignmentOutcome): number {
    const { metrics } = outcome.experience;
    const stability = metrics.success ? 1 : 0;
    const qualityMomentum = Math.max(0, metrics.satisfaction - 0.5);
    const costEfficiency = Math.max(0, 1 - metrics.cost / (this.weights.costReference * 1.5));
    return 0.4 * stability + 0.35 * qualityMomentum + 0.25 * costEfficiency;
  }
}
