import { randomBytes } from 'crypto';
import { eventBus } from './eventBus';
import { Hex, SlashingEvent, StakeAccount, ValidatorIdentity } from './types';

function randomTxHash(): Hex {
  return `0x${randomBytes(32).toString('hex')}`;
}

export class StakeManager {
  private accounts = new Map<Hex, StakeAccount>();

  registerValidator(identity: ValidatorIdentity): void {
    if (this.accounts.has(identity.address)) {
      throw new Error(`validator already registered: ${identity.address}`);
    }
    if (identity.stake <= 0n) {
      throw new Error('validator must bond positive stake');
    }
    this.accounts.set(identity.address, {
      identity,
      bonded: identity.stake,
      slashed: 0n,
      status: 'ACTIVE',
    });
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
    const penalty = (account.bonded * BigInt(penaltyBps)) / 10000n;
    account.bonded -= penalty;
    account.slashed += penalty;
    if (account.bonded <= 0n) {
      account.status = 'BANNED';
    }
    const event: SlashingEvent = {
      validator: { ...account.identity },
      penalty,
      reason,
      txHash: randomTxHash(),
      timestamp: Date.now(),
    };
    eventBus.emit('StakeSlashed', event);
    return event;
  }

  listActive(): ValidatorIdentity[] {
    return Array.from(this.accounts.values())
      .filter((account) => account.status === 'ACTIVE')
      .map((account) => ({ ...account.identity }));
  }
}
