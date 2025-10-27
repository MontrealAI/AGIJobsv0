import { eventBus } from './eventBus';
import { DomainPauseController } from './domainPause';
import { AgentAction, DomainConfig, Hex, SentinelAlert } from './types';

interface SentinelConfig {
  budgetGraceRatio: number;
  unsafeOpcodes: Map<string, Set<string>>;
}

export class SentinelMonitor {
  private readonly spendTracker = new Map<Hex, bigint>();

  constructor(private readonly domainController: DomainPauseController, private readonly config: SentinelConfig) {}

  private getDomainConfig(domainId: string): DomainConfig {
    return this.domainController.getState(domainId).config;
  }

  private raiseAlert(action: AgentAction, rule: string, description: string, severity: 'CRITICAL' | 'HIGH', metadata?: Record<string, unknown>): SentinelAlert {
    const alert: SentinelAlert = {
      id: `${rule}-${Date.now()}`,
      domainId: action.domainId,
      timestamp: Date.now(),
      rule,
      description,
      severity,
      offender: {
        ensName: action.agent.ensName,
        address: action.agent.address,
      },
      metadata,
    };
    eventBus.emit('SentinelAlert', alert);
    this.domainController.pause(action.domainId, description, `sentinel:${rule}`);
    return alert;
  }

  observe(action: AgentAction): SentinelAlert | undefined {
    const domain = this.getDomainConfig(action.domainId);
    const previous = this.spendTracker.get(action.agent.address) ?? 0n;
    const updated = previous + action.amountSpent;
    this.spendTracker.set(action.agent.address, updated);

    const graceRatio = BigInt(Math.round(this.config.budgetGraceRatio * 1000));
    const grace = (action.agent.budget * graceRatio) / 1000n;
    if (updated > action.agent.budget + grace) {
      return this.raiseAlert(action, 'BUDGET_OVERRUN', `agent exceeded budget in ${domain.humanName}`, 'CRITICAL', {
        spent: updated.toString(),
        budget: action.agent.budget.toString(),
        grace: grace.toString(),
      });
    }

    const unsafeOpcodes = this.config.unsafeOpcodes.get(domain.id) ?? domain.unsafeOpcodes;
    if (action.opcode && unsafeOpcodes.has(action.opcode)) {
      return this.raiseAlert(action, 'UNSAFE_OPCODE', `unsafe opcode ${action.opcode} invoked`, 'HIGH', {
        opcode: action.opcode,
        target: action.target,
      });
    }

    return undefined;
  }

  updateBudgetGraceRatio(ratio: number): void {
    if (!Number.isFinite(ratio) || ratio < 0) {
      throw new Error('invalid budget grace ratio');
    }
    this.config.budgetGraceRatio = ratio;
  }

  getBudgetGraceRatio(): number {
    return this.config.budgetGraceRatio;
  }

  updateUnsafeOpcodes(domainId: string, opcodes: Iterable<string>): void {
    const normalized = Array.from(opcodes);
    this.config.unsafeOpcodes.set(domainId, new Set(normalized));
  }

  getUnsafeOpcodes(domainId: string): Set<string> {
    const fromConfig = this.config.unsafeOpcodes.get(domainId);
    if (fromConfig) {
      return new Set(fromConfig);
    }
    return new Set(this.getDomainConfig(domainId).unsafeOpcodes);
  }
}
