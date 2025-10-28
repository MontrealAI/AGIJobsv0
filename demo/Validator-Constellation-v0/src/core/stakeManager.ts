import { randomBytes } from 'crypto';
import { eventBus } from './eventBus';
import { Hex, SlashingEvent, StakeAccount, TreasuryDistributionEvent, ValidatorIdentity, ValidatorStatusEvent } from './types';

function randomTxHash(): Hex {
  return `0x${randomBytes(32).toString('hex')}`;
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export class StakeManager {
  private accounts = new Map<Hex, StakeAccount>();
  private treasuryAddress: Hex = '0x000000000000000000000000000000000000dead';
  private treasuryBalance = 0n;

  private emitStatusEvent(account: StakeAccount, reason: string, txHash?: Hex): ValidatorStatusEvent {
    const event: ValidatorStatusEvent = {
      validator: { ...account.identity },
      status: account.status,
      reason,
      remainingStake: account.bonded,
      timestamp: Date.now(),
      txHash,
    };
    eventBus.emit('ValidatorStatusChanged', event);
    return event;
  }

  registerValidator(identity: ValidatorIdentity): void {
    if (this.accounts.has(identity.address)) {
      throw new Error(`validator already registered: ${identity.address}`);
    }
    if (identity.stake <= 0n) {
      throw new Error('validator must bond positive stake');
    }
    const account: StakeAccount = {
      identity,
      bonded: identity.stake,
      slashed: 0n,
      status: 'ACTIVE',
    };
    this.accounts.set(identity.address, account);
    this.emitStatusEvent(account, 'REGISTERED');
  }

  getAccount(address: Hex): StakeAccount | undefined {
    const account = this.accounts.get(address);
    return account ? { ...account, identity: { ...account.identity } } : undefined;
  }

  setTreasuryAddress(address: Hex): void {
    if (!ADDRESS_PATTERN.test(address)) {
      throw new Error('invalid treasury address');
    }
    this.treasuryAddress = address;
  }

  getTreasuryAddress(): Hex {
    return this.treasuryAddress;
  }

  getTreasuryBalance(): bigint {
    return this.treasuryBalance;
  }

  slash(address: Hex, penaltyBps: number, reason: string): SlashingEvent {
    const account = this.accounts.get(address);
    if (!account) {
      throw new Error('unknown validator for slashing');
    }
    if (account.status === 'BANNED') {
      throw new Error('validator already banned');
    }
    if (penaltyBps <= 0) {
      throw new Error('penalty must be positive');
    }
    const rawPenalty = (account.bonded * BigInt(penaltyBps)) / 10000n;
    const penalty = rawPenalty > account.bonded ? account.bonded : rawPenalty;
    account.bonded = account.bonded > penalty ? account.bonded - penalty : 0n;
    account.slashed += penalty;
    if (account.bonded === 0n) {
      account.status = 'BANNED';
    }
    this.treasuryBalance += penalty;
    const txHash = randomTxHash();
    const event: SlashingEvent = {
      validator: { ...account.identity },
      penalty,
      reason,
      txHash,
      timestamp: Date.now(),
      treasuryRecipient: this.treasuryAddress,
      treasuryBalanceAfter: this.treasuryBalance,
    };
    eventBus.emit('StakeSlashed', event);
    const statusReason = account.status === 'BANNED' ? 'SLASHED_TO_ZERO' : 'SLASHED';
    this.emitStatusEvent(account, statusReason, txHash);
    return event;
  }

  distributeTreasury(recipient: Hex, amount: bigint): TreasuryDistributionEvent {
    if (!ADDRESS_PATTERN.test(recipient)) {
      throw new Error('invalid treasury distribution recipient');
    }
    if (amount <= 0n) {
      throw new Error('distribution amount must be positive');
    }
    if (amount > this.treasuryBalance) {
      throw new Error('insufficient treasury balance for distribution');
    }
    this.treasuryBalance -= amount;
    const txHash = randomTxHash();
    const event: TreasuryDistributionEvent = {
      recipient,
      amount,
      treasuryAddress: this.treasuryAddress,
      treasuryBalanceAfter: this.treasuryBalance,
      txHash,
      timestamp: Date.now(),
    };
    eventBus.emit('TreasuryDistribution', event);
    return event;
  }

  listActive(): ValidatorIdentity[] {
    return Array.from(this.accounts.values())
      .filter((account) => account.status === 'ACTIVE')
      .map((account) => ({ ...account.identity }));
  }
}
