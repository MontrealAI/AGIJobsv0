import { EventBus } from "../subgraph/EventBus";

export interface StakePosition {
  address: string;
  stake: bigint;
  frozenUntil?: number;
}

export interface SlashResult {
  slashed: bigint;
  remaining: bigint;
}

export class StakeManager {
  private readonly stakes = new Map<string, StakePosition>();

  constructor(private readonly bus: EventBus, initialStakes: StakePosition[] = []) {
    initialStakes.forEach((position) => this.deposit(position.address, position.stake));
  }

  deposit(address: string, amount: bigint): StakePosition {
    if (amount <= 0n) {
      throw new Error("Stake amount must be positive");
    }
    const key = address.toLowerCase();
    const current = this.stakes.get(key) ?? { address: key, stake: 0n };
    const updated = { ...current, stake: current.stake + amount } satisfies StakePosition;
    this.stakes.set(key, updated);
    return updated;
  }

  balanceOf(address: string): bigint {
    return this.stakes.get(address.toLowerCase())?.stake ?? 0n;
  }

  slash(address: string, percentage: number, reason: string): SlashResult {
    if (percentage <= 0 || percentage > 100) {
      throw new Error("Slashing percentage must be within (0,100]");
    }
    const key = address.toLowerCase();
    const record = this.stakes.get(key);
    if (!record) {
      throw new Error(`Validator ${address} has no stake to slash`);
    }
    const slashed = (record.stake * BigInt(Math.round(percentage * 100))) / 10000n;
    const remaining = record.stake - slashed;
    record.stake = remaining;
    this.bus.emit("ValidatorSlashed", {
      address: key,
      percentage,
      slashed: slashed.toString(),
      remaining: remaining.toString(),
      reason,
    });
    return { slashed, remaining };
  }

  freeze(address: string, until: number): void {
    const key = address.toLowerCase();
    const record = this.stakes.get(key);
    if (!record) {
      throw new Error(`Validator ${address} has no stake to freeze`);
    }
    record.frozenUntil = until;
  }

  isFrozen(address: string, at: number): boolean {
    const record = this.stakes.get(address.toLowerCase());
    return record?.frozenUntil !== undefined && (record.frozenUntil ?? 0) > at;
  }

  list(): StakePosition[] {
    return Array.from(this.stakes.values());
  }
}
