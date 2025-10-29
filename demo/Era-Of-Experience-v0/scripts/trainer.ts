import { ExperienceBuffer } from './experienceBuffer';
import { AdaptivePolicy } from './policy';
import { DeterministicRandom } from './random';
import { ExperienceRecord, PolicySnapshot, SimulationConfig } from './types';

export class ExperienceTrainer {
  private readonly policy: AdaptivePolicy;
  private readonly buffer: ExperienceBuffer;
  private readonly checkpoints: PolicySnapshot[] = [];
  private readonly sampler: DeterministicRandom;
  private processed = 0;

  constructor(private readonly config: SimulationConfig) {
    this.policy = new AdaptivePolicy(config.learningRate, config.discountFactor);
    this.sampler = new DeterministicRandom(config.replaySeed ?? 'experience-buffer');
    this.buffer = new ExperienceBuffer(config.bufferSize, () => this.sampler.next());
    this.maybeCheckpoint('Initial deployment snapshot');
  }

  integrate(record: ExperienceRecord): void {
    this.buffer.append(record);
    this.policy.update(
      record.stateId,
      record.actionId,
      record.reward,
      record.terminal ? null : record.nextStateId,
      this.config.discountFactor,
    );
    this.processed += 1;
    const interval = this.config.checkpointInterval ?? 40;
    if (interval > 0 && this.processed % interval === 0) {
      this.maybeCheckpoint(`Policy update after ${this.processed} experiences`);
    }
  }

  train(batchSize: number): void {
    const batch = this.buffer.sample(batchSize);
    if (batch.length === 0) {
      return;
    }
    for (const record of batch) {
      this.policy.update(
        record.stateId,
        record.actionId,
        record.reward,
        record.terminal ? null : record.nextStateId,
        this.config.discountFactor,
      );
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
