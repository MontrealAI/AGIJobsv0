import { deterministicRandom } from '../utils/crypto.js';
import { ValidatorProfile } from '../types.js';

export interface CommitteeSelectionConfig {
  committeeSize: number;
  entropyMix: string;
}

export class VrfCommitteeSelector {
  constructor(private config: CommitteeSelectionConfig) {}

  public selectCommittee(validators: ValidatorProfile[], roundId: string): ValidatorProfile[] {
    if (validators.length === 0) {
      throw new Error('No validators available');
    }
    const pool = [...validators];
    const committee: ValidatorProfile[] = [];
    let seed = `${roundId}|${this.config.entropyMix}`;

    while (committee.length < Math.min(this.config.committeeSize, pool.length)) {
      const index = deterministicRandom(seed, roundId, pool.length);
      committee.push(pool[index]);
      pool.splice(index, 1);
      seed = `${seed}|${committee.length}`;
    }
    return committee;
  }
}
