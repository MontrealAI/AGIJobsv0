import { Address, ValidatorProfile } from "./types";

export interface SlashEvent {
  validator: Address;
  amount: bigint;
  reason: string;
  ensName: string;
  timestamp: number;
}

export class StakeManager {
  private validators = new Map<Address, ValidatorProfile>();
  private slashLog: SlashEvent[] = [];
  private slashMultiplier = 0.1; // 10%

  registerValidator(profile: ValidatorProfile) {
    this.validators.set(profile.address.toLowerCase(), profile);
  }

  getValidator(address: Address): ValidatorProfile | undefined {
    return this.validators.get(address.toLowerCase());
  }

  listActive(): ValidatorProfile[] {
    return [...this.validators.values()].filter((profile) => profile.active);
  }

  slash(address: Address, reason: string): SlashEvent {
    const key = address.toLowerCase();
    const validator = this.validators.get(key);
    if (!validator) {
      throw new Error("Validator not registered");
    }
    const penalty = validator.stake > 0n ? (validator.stake * BigInt(Math.floor(this.slashMultiplier * 1000))) / 1000n : 0n;
    const adjustedPenalty = penalty > 0n ? penalty : 1n;
    validator.stake -= adjustedPenalty;
    validator.slashCount += 1;
    if (validator.stake <= 0n) {
      validator.active = false;
      validator.stake = 0n;
    }
    this.validators.set(key, validator);
    const event: SlashEvent = {
      validator: validator.address,
      amount: adjustedPenalty,
      reason,
      ensName: validator.ensName,
      timestamp: Date.now(),
    } as SlashEvent;
    this.slashLog.push(event);
    return event;
  }

  getSlashLog(): SlashEvent[] {
    return [...this.slashLog];
  }
}
