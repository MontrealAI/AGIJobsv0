import { EnsRegistry } from '../identity/ens-registry.js';
import { ValidatorProfile } from '../types.js';

export interface ValidatorRegistryConfig {
  minimumStake: bigint;
  slashPenalty: bigint;
}

export class ValidatorRegistry {
  private validators = new Map<`0x${string}`, ValidatorProfile>();

  constructor(private ensRegistry: EnsRegistry, private config: ValidatorRegistryConfig) {}

  public register(address: `0x${string}`, ensName: string, initialStake: bigint) {
    if (!this.ensRegistry.verifyValidator(address, ensName)) {
      throw new Error(`ENS ownership validation failed for ${ensName}`);
    }
    if (initialStake < this.config.minimumStake) {
      throw new Error('Stake below minimum');
    }
    this.validators.set(address, {
      address,
      ensName,
      stake: initialStake,
      active: true,
      slashed: false,
      reputation: 100,
    });
  }

  public slash(address: `0x${string}`, reason: string) {
    const profile = this.validators.get(address);
    if (!profile) {
      throw new Error('Validator not found');
    }
    profile.stake = profile.stake > this.config.slashPenalty ? profile.stake - this.config.slashPenalty : 0n;
    profile.slashed = true;
    profile.reputation = Math.max(0, profile.reputation - 50);
    profile.active = profile.stake >= this.config.minimumStake && profile.reputation >= 20;
    return {
      address,
      reason,
      newStake: profile.stake,
    };
  }

  public reward(address: `0x${string}`, amount: bigint) {
    const profile = this.validators.get(address);
    if (!profile) {
      throw new Error('Validator not found');
    }
    profile.stake += amount;
    profile.reputation = Math.min(200, profile.reputation + 10);
  }

  public findActive(): ValidatorProfile[] {
    return [...this.validators.values()].filter((profile) => profile.active && !profile.slashed);
  }

  public get(address: `0x${string}`): ValidatorProfile | undefined {
    return this.validators.get(address);
  }

  public all(): ValidatorProfile[] {
    return [...this.validators.values()];
  }
}
