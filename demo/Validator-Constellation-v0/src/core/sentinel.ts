import { keccak256, toUtf8Bytes } from 'ethers';
import { eventBus } from './eventBus';
import { DomainPauseController } from './domainPause';
import { AgentAction, DomainConfig, Hex, SentinelAlert } from './types';

interface SentinelConfig {
  budgetGraceRatio: number;
  unsafeOpcodes: Map<string, Set<string>>;
  allowedTargets: Map<string, Set<string>>;
  allowedTargetHashes: Map<string, Set<string>>;
  maxCalldataBytes: Map<string, number>;
}

export class SentinelMonitor {
  private readonly spendTracker = new Map<Hex, bigint>();

  constructor(private readonly domainController: DomainPauseController, private readonly config: SentinelConfig) {}

  private normalizeTarget(target: string): string {
    return target.trim().toLowerCase();
  }

  private hashTarget(target: string): string {
    return keccak256(toUtf8Bytes(target));
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

    const unsafeOpcodes = this.config.unsafeOpcodes.get(domain.id) ?? domain.unsafeOpcodes;
    if (action.opcode && unsafeOpcodes.has(action.opcode)) {
      return this.raiseAlert(action, 'UNSAFE_OPCODE', `unsafe opcode ${action.opcode} invoked`, 'HIGH', {
        opcode: action.opcode,
        target: action.target,
      });
    }

    if (action.target) {
      const allowed = this.config.allowedTargets.get(domain.id) ?? domain.allowedTargets;
      if (allowed.size > 0) {
        const normalizedTarget = this.normalizeTarget(action.target);
        const hashedTarget = this.hashTarget(normalizedTarget);
        const hashedSet = this.config.allowedTargetHashes.get(domain.id);
        const hashedMatch = hashedSet ? hashedSet.has(hashedTarget) : allowed.has(normalizedTarget);
        if (!allowed.has(normalizedTarget) || !hashedMatch) {
          return this.raiseAlert(action, 'UNAUTHORIZED_TARGET', `target ${action.target} is not authorized`, 'CRITICAL', {
            target: action.target,
            normalizedTarget,
            hashedTarget,
            allowedTargets: Array.from(allowed),
          });
        }
      }
    }

    const threshold = this.config.maxCalldataBytes.get(domain.id) ?? domain.maxCalldataBytes;
    if (threshold > 0) {
      const calldataBytes =
        action.calldataBytes ??
        (typeof action.metadata?.calldataBytes === 'number'
          ? action.metadata.calldataBytes
          : Number(action.metadata?.calldataBytes ?? 0));
      if (Number.isFinite(calldataBytes) && calldataBytes > threshold) {
        return this.raiseAlert(action, 'CALLDATA_EXPLOSION', `calldata size ${calldataBytes}b exceeds limit`, 'HIGH', {
          calldataBytes,
          threshold,
        });
      }
    }

    const graceRatio = BigInt(Math.round(this.config.budgetGraceRatio * 1000));
    const grace = (action.agent.budget * graceRatio) / 1000n;
    if (updated > action.agent.budget + grace) {
      return this.raiseAlert(action, 'BUDGET_OVERRUN', `agent exceeded budget in ${domain.humanName}`, 'CRITICAL', {
        spent: updated.toString(),
        budget: action.agent.budget.toString(),
        grace: grace.toString(),
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

  updateAllowedTargets(domainId: string, targets: Iterable<string>): void {
    const normalized = Array.from(targets, (target) => this.normalizeTarget(target));
    this.config.allowedTargets.set(domainId, new Set(normalized));
    const hashed = normalized.map((target) => this.hashTarget(target));
    this.config.allowedTargetHashes.set(domainId, new Set(hashed));
  }

  getAllowedTargets(domainId: string): Set<string> {
    const fromConfig = this.config.allowedTargets.get(domainId);
    if (fromConfig) {
      return new Set(fromConfig);
    }
    const domainTargets = this.getDomainConfig(domainId).allowedTargets;
    return new Set(Array.from(domainTargets, (target) => this.normalizeTarget(target)));
  }

  updateMaxCalldataBytes(domainId: string, limit: number): void {
    if (!Number.isFinite(limit) || limit < 0) {
      throw new Error('invalid calldata limit');
    }
    this.config.maxCalldataBytes.set(domainId, Math.floor(limit));
  }

  getMaxCalldataBytes(domainId: string): number {
    return this.config.maxCalldataBytes.get(domainId) ?? this.getDomainConfig(domainId).maxCalldataBytes;
  }
}
