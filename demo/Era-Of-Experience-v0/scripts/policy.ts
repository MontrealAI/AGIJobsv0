import { AgentProfile, PolicySnapshot } from './types';

function makeKey(stateId: string, actionId: string): string {
  return `${stateId}::${actionId}`;
}

export class AdaptivePolicy {
  private readonly qValues = new Map<string, number>();
  private readonly visitCounts = new Map<string, number>();

  constructor(private readonly learningRate: number, private readonly discountFactor: number) {
    if (learningRate <= 0 || learningRate > 1) {
      throw new Error('learningRate must be between 0 and 1');
    }
    if (discountFactor <= 0 || discountFactor > 1) {
      throw new Error('discountFactor must be between 0 and 1');
    }
  }

  public selectAction(stateId: string, agents: AgentProfile[], epsilon: number): AgentProfile {
    if (agents.length === 0) {
      throw new Error('No agents available for selection');
    }
    if (Math.random() < epsilon) {
      const index = Math.floor(Math.random() * agents.length);
      return agents[index];
    }
    let bestAgent = agents[0];
    let bestValue = this.getQValue(stateId, bestAgent.id);
    for (let i = 1; i < agents.length; i += 1) {
      const candidate = agents[i];
      const value = this.getQValue(stateId, candidate.id);
      if (value > bestValue) {
        bestValue = value;
        bestAgent = candidate;
      }
    }
    return bestAgent;
  }

  public update(stateId: string, actionId: string, reward: number, nextStateId: string | null, gamma: number): void {
    const key = makeKey(stateId, actionId);
    const current = this.getQValue(stateId, actionId);
    let target = reward;
    if (nextStateId) {
      let bestNext = -Infinity;
      for (const [storedKey, value] of this.qValues.entries()) {
        if (storedKey.startsWith(`${nextStateId}::`) && value > bestNext) {
          bestNext = value;
        }
      }
      if (!Number.isFinite(bestNext)) {
        bestNext = 0;
      }
      target = reward + gamma * bestNext;
    }
    const updated = current + this.learningRate * (target - current);
    this.qValues.set(key, updated);
    this.visitCounts.set(key, (this.visitCounts.get(key) ?? 0) + 1);
  }

  public getQValue(stateId: string, actionId: string): number {
    const key = makeKey(stateId, actionId);
    return this.qValues.get(key) ?? 0;
  }

  public snapshot(description: string): PolicySnapshot {
    const qRecord: Record<string, Record<string, number>> = {};
    for (const [key, value] of this.qValues.entries()) {
      const [state, action] = key.split('::');
      if (!qRecord[state]) {
        qRecord[state] = {};
      }
      qRecord[state][action] = Number(value.toFixed(4));
    }
    return {
      id: `snapshot-${Date.now()}`,
      createdAt: new Date().toISOString(),
      description,
      qValues: qRecord,
    };
  }
}
