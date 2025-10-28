import { eventBus } from './eventBus';
import { DomainPauseController } from './domainPause';
import { AgentAction, DomainConfig, Hex, SentinelAlert } from './types';

interface SentinelConfig {
  budgetGraceRatio: number;
  unsafeOpcodes: Map<string, Set<string>>;
  allowedTargets: Map<string, Set<string>>;
}

export class SentinelMonitor {
  private readonly spendTracker = new Map<Hex, bigint>();

  constructor(private readonly domainController: DomainPauseController, private readonly config: SentinelConfig) {}

  private static normalizeTarget(target: string): string {
    return target.trim().toLowerCase();
  }

  private static normalizeOpcode(opcode: string): string {
    return opcode.trim().toUpperCase();
  }

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

    if (action.target) {
      const normalizedTarget = SentinelMonitor.normalizeTarget(action.target);
      const allowedTargets = this.config.allowedTargets.get(domain.id) ?? domain.allowedTargets;
      if (allowedTargets.size > 0 && !allowedTargets.has(normalizedTarget)) {
        return this.raiseAlert(action, 'UNAUTHORIZED_TARGET', `call target ${action.target} not on allowlist`, 'CRITICAL', {
          target: action.target,
          domainId: action.domainId,
        });
      }
    }

    const unsafeOpcodes = this.config.unsafeOpcodes.get(domain.id) ?? domain.unsafeOpcodes;
    if (action.opcode && unsafeOpcodes.has(SentinelMonitor.normalizeOpcode(action.opcode))) {
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
    const normalized = Array.from(opcodes, SentinelMonitor.normalizeOpcode).filter((opcode) => opcode.length > 0);
    this.config.unsafeOpcodes.set(domainId, new Set(normalized));
  }

  getUnsafeOpcodes(domainId: string): Set<string> {
    const fromConfig = this.config.unsafeOpcodes.get(domainId);
    if (fromConfig) {
      return new Set(fromConfig);
    }
    return new Set(this.getDomainConfig(domainId).unsafeOpcodes);
  }

  updateAllowedTargets(domainId: string, targets: Iterable<string>): void {
    const normalized = Array.from(targets, SentinelMonitor.normalizeTarget).filter((target) => target.length > 0);
    this.config.allowedTargets.set(domainId, new Set(normalized));
  }

  getAllowedTargets(domainId: string): Set<string> {
    const fromConfig = this.config.allowedTargets.get(domainId);
    if (fromConfig) {
      return new Set(fromConfig);
    }
    return new Set(this.getDomainConfig(domainId).allowedTargets);
  }
}
