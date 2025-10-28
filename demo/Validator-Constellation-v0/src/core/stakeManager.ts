import { randomBytes } from 'crypto';
import { eventBus } from './eventBus';
import { Hex, SlashingEvent, StakeAccount, ValidatorIdentity, ValidatorStatusEvent } from './types';

function randomTxHash(): Hex {
  return `0x${randomBytes(32).toString('hex')}`;
}

export class StakeManager {
  private accounts = new Map<Hex, StakeAccount>();

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
    const txHash = randomTxHash();
    const event: SlashingEvent = {
      validator: { ...account.identity },
      penalty,
      reason,
      txHash,
      timestamp: Date.now(),
    };
    eventBus.emit('StakeSlashed', event);
    const statusReason = account.status === 'BANNED' ? 'SLASHED_TO_ZERO' : 'SLASHED';
    this.emitStatusEvent(account, statusReason, txHash);
    return event;
  }

  listActive(): ValidatorIdentity[] {
    return Array.from(this.accounts.values())
      .filter((account) => account.status === 'ACTIVE')
      .map((account) => ({ ...account.identity }));
  }
}
