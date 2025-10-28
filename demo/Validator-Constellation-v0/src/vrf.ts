import { EpochEntropy, ValidatorIdentity } from './types';
import { deterministicShuffle, mixEntropy } from './utils';
import { validatorConfig } from './config';

export class VrfCommitteeOracle {
  constructor(private entropy: EpochEntropy, private validators: ValidatorIdentity[]) {}

  public selectCommittee(): ValidatorIdentity[] {
    const active = this.validators.filter((validator) => validator.active);
    const seed = mixEntropy([
      this.entropy.seed,
      this.entropy.epoch.toString(),
      ...active.map((validator) => validator.address),
    ]);
    const shuffled = deterministicShuffle(active, seed);
    return shuffled.slice(0, Math.min(validatorConfig.committeeSize, shuffled.length));
  }
}
