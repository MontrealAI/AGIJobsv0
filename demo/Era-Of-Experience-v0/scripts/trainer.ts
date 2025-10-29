import { ExperienceBuffer } from './experienceBuffer';
import { AdaptivePolicy } from './policy';
import { ExperienceRecord, PolicySnapshot, SimulationConfig } from './types';

export class ExperienceTrainer {
  private readonly policy: AdaptivePolicy;
  private readonly buffer: ExperienceBuffer;
  private readonly checkpoints: PolicySnapshot[] = [];

  constructor(private readonly config: SimulationConfig) {
    this.policy = new AdaptivePolicy(config.learningRate, config.discountFactor);
    this.buffer = new ExperienceBuffer(config.bufferSize);
  }

  integrate(record: ExperienceRecord): void {
    this.buffer.append(record);
    this.policy.update(
      record.stateId,
      record.actionId,
      record.reward,
      null,
      this.config.discountFactor,
    );
  }

  train(batchSize: number): void {
    const batch = this.buffer.sample(batchSize);
    if (batch.length === 0) {
      return;
    }
    for (const record of batch) {
      this.policy.update(record.stateId, record.actionId, record.reward, null, this.config.discountFactor);
    }
  }

  maybeCheckpoint(description: string): void {
    const snapshot = this.policy.snapshot(description);
    this.checkpoints.push(snapshot);
    while (this.checkpoints.length > this.config.checkpointsToKeep) {
      this.checkpoints.shift();
    }
  }

  getPolicy(): AdaptivePolicy {
    return this.policy;
  }

  getExperienceBuffer(): ExperienceBuffer {
    return this.buffer;
  }

  getCheckpoints(): PolicySnapshot[] {
    return [...this.checkpoints];
  }
}
