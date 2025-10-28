import { EventIndexer } from "../subgraph/eventIndexer";

export interface StakeAccount {
  readonly address: string;
  readonly ensName: string;
  stake: bigint;
  slashed: bigint;
}

export interface SlashEventPayload {
  readonly address: string;
  readonly ensName: string;
  readonly percentageBps: number;
  readonly reason: string;
  readonly stakeBefore: bigint;
  readonly stakeAfter: bigint;
}

export class StakeManager {
  private readonly accounts = new Map<string, StakeAccount>();

  constructor(private readonly indexer: EventIndexer) {}

  deposit(address: string, ensName: string, amount: bigint) {
    const existing = this.accounts.get(address);
    if (existing) {
      existing.stake += amount;
      return existing.stake;
    }
    const account: StakeAccount = {
      address,
      ensName,
      stake: amount,
      slashed: 0n,
    };
    this.accounts.set(address, account);
    this.indexer.recordEvent("StakeDeposited", {
      address,
      ensName,
      amount: amount.toString(),
      totalStake: account.stake.toString(),
    });
    return amount;
  }

  getStake(address: string): bigint {
    const account = this.accounts.get(address);
    return account?.stake ?? 0n;
  }

  slash(address: string, percentageBps: number, reason: string) {
    const account = this.accounts.get(address);
    if (!account) {
      throw new Error(`Stake account not found for ${address}`);
    }
    const slashAmount = (account.stake * BigInt(percentageBps)) / 10_000n;
    account.stake -= slashAmount;
    account.slashed += slashAmount;
    const payload: SlashEventPayload = {
      address,
      ensName: account.ensName,
      percentageBps,
      reason,
      stakeBefore: account.stake + slashAmount,
      stakeAfter: account.stake,
    };
    this.indexer.recordEvent("ValidatorSlashed", {
      ...payload,
      stakeBefore: payload.stakeBefore.toString(),
      stakeAfter: payload.stakeAfter.toString(),
      slashAmount: slashAmount.toString(),
    });
    return slashAmount;
  }

  summarize() {
    return Array.from(this.accounts.values()).map((account) => ({
      address: account.address,
      ensName: account.ensName,
      stake: account.stake.toString(),
      totalSlashed: account.slashed.toString(),
    }));
  }
}
