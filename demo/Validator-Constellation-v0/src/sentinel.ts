import { EventEmitter } from 'node:events';

export type BudgetEvent = {
  agent: string;
  domain: string;
  spent: bigint;
  budget: bigint;
};

export type SentinelAlert = {
  domain: string;
  reason: string;
  severity: number;
  context: Record<string, unknown>;
};

export class SentinelMonitor extends EventEmitter {
  private budgetLimitRatio: number;

  constructor(limitRatio = 1.1) {
    super();
    this.budgetLimitRatio = limitRatio;
  }

  evaluateBudget(event: BudgetEvent): void {
    const allowed = event.budget * BigInt(Math.floor(this.budgetLimitRatio * 100));
    const limit = allowed / 100n;
    if (event.spent > limit) {
      this.emit('alert', {
        domain: event.domain,
        reason: `Budget exceeded: spent ${event.spent} with limit ${limit}`,
        severity: 3,
        context: { agent: event.agent, spent: event.spent.toString(), limit: limit.toString() },
      } satisfies SentinelAlert);
    }
  }
}
