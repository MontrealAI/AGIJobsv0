import { buildStructuredLogRecord } from '../../../../../shared/structuredLogger.js';

interface StakeActionInput {
  readonly roundId: number;
  readonly participant: string;
  readonly role: 'teacher' | 'student' | 'validator';
  readonly amount: bigint;
}

function emitStakeLog(action: string, input: StakeActionInput): void {
  const log = buildStructuredLogRecord({
    component: 'stake-manager',
    action,
    level: 'info',
    actor: input.participant,
    details: {
      roundId: input.roundId,
      role: input.role,
      amount: input.amount.toString()
    }
  });
  console.log(JSON.stringify(log));
}

export async function lockStake(input: StakeActionInput): Promise<void> {
  emitStakeLog('lock', input);
}

export async function releaseStake(input: StakeActionInput): Promise<void> {
  emitStakeLog('release', input);
}

export async function slashStake(input: StakeActionInput & { readonly reason: string }): Promise<void> {
  const log = buildStructuredLogRecord({
    component: 'stake-manager',
    action: 'slash',
    level: 'warn',
    actor: input.participant,
    details: {
      roundId: input.roundId,
      role: input.role,
      amount: input.amount.toString(),
      reason: input.reason
    }
  });
  console.warn(JSON.stringify(log));
}
