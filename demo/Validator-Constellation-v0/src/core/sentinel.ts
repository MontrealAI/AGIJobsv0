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
  forbiddenSelectors: Map<string, Set<string>>;
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

  private hashVariants(target: string): [string, string] {
    const hashed = this.hashTarget(target);
    const withoutPrefix = hashed.startsWith('0x') ? hashed.slice(2) : hashed;
    return [hashed, withoutPrefix];
  }

  private normalizeHashInput(hash?: string): [string | undefined, string | undefined] {
    if (typeof hash !== 'string') {
      return [undefined, undefined];
    }
    const trimmed = hash.trim().toLowerCase();
    if (!trimmed) {
      return [undefined, undefined];
    }
    if (trimmed.startsWith('0x')) {
      return [trimmed, trimmed.slice(2)];
    }
    return [`0x${trimmed}`, trimmed];
  }

  private getAllowedTargetHashes(domainId: string, allowed: Set<string>): Set<string> {
    const configured = this.config.allowedTargetHashes.get(domainId);
    if (configured) {
      return configured;
    }
    const derived = new Set<string>();
    for (const target of allowed) {
      const [withPrefix, withoutPrefix] = this.hashVariants(target);
      derived.add(withPrefix);
      derived.add(withoutPrefix);
    }
    return derived;
  }

  private getDomainConfig(domainId: string): DomainConfig {
    return this.domainController.getState(domainId).config;
  }

  private raiseAlert(
    action: AgentAction,
    rule: string,
    description: string,
    severity: 'CRITICAL' | 'HIGH',
    metadata: Record<string, unknown> | undefined,
    blockNumber?: number,
  ): SentinelAlert {
    const alert: SentinelAlert = {
      id: `${rule}-${Date.now()}`,
      domainId: action.domainId,
      timestamp: Date.now(),
      blockNumber,
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
    this.domainController.pause(action.domainId, description, `sentinel:${rule}`, blockNumber);
    return alert;
  }

  observe(action: AgentAction): SentinelAlert | undefined {
    const blockNumber =
      typeof action.blockNumber === 'number'
        ? action.blockNumber
        : typeof action.metadata?.blockNumber === 'number'
          ? Number(action.metadata.blockNumber)
          : undefined;
    const domain = this.getDomainConfig(action.domainId);
    const previous = this.spendTracker.get(action.agent.address) ?? 0n;
    const updated = previous + action.amountSpent;
    this.spendTracker.set(action.agent.address, updated);

    const unsafeOpcodes = this.config.unsafeOpcodes.get(domain.id) ?? domain.unsafeOpcodes;
    if (action.opcode && unsafeOpcodes.has(action.opcode)) {
      return this.raiseAlert(action, 'UNSAFE_OPCODE', `unsafe opcode ${action.opcode} invoked`, 'HIGH', {
        opcode: action.opcode,
        target: action.target,
      }, blockNumber);
    }

    const selectors = this.config.forbiddenSelectors.get(domain.id) ?? domain.forbiddenSelectors;
    const selector =
      action.functionSelector ??
      (typeof action.metadata?.functionSelector === 'string' ? (action.metadata.functionSelector as string) : undefined);
    if (selector) {
      const normalizedSelector = selector.toLowerCase();
      if (selectors.has(normalizedSelector)) {
        return this.raiseAlert(
          action,
          'FORBIDDEN_SELECTOR',
          `function selector ${normalizedSelector} blocked for domain ${domain.humanName}`,
          'CRITICAL',
          {
            selector: normalizedSelector,
            configuredSelectors: Array.from(selectors),
          },
          blockNumber,
        );
      }
    }

    const allowed = this.config.allowedTargets.get(domain.id) ?? domain.allowedTargets;
    if (allowed.size > 0) {
      const normalizedTargets = new Set<string>();
      if (typeof action.target === 'string') {
        normalizedTargets.add(this.normalizeTarget(action.target));
      }
      const metadataTarget =
        typeof action.metadata?.target === 'string'
          ? this.normalizeTarget(action.metadata.target as string)
          : undefined;
      if (metadataTarget) {
        normalizedTargets.add(metadataTarget);
      }

      const hashedSet = this.getAllowedTargetHashes(domain.id, allowed);
      const hashCandidates = new Set<string>();
      for (const target of normalizedTargets) {
        const [withPrefix, withoutPrefix] = this.hashVariants(target);
        hashCandidates.add(withPrefix);
        hashCandidates.add(withoutPrefix);
      }
      const [metadataHashWithPrefix, metadataHashWithoutPrefix] = this.normalizeHashInput(
        (action.metadata?.targetHash as string | undefined) ??
          (action.metadata?.target_hash as string | undefined),
      );
      if (metadataHashWithPrefix) {
        hashCandidates.add(metadataHashWithPrefix);
      }
      if (metadataHashWithoutPrefix) {
        hashCandidates.add(metadataHashWithoutPrefix);
      }

      const rawMatch = normalizedTargets.size > 0 && Array.from(normalizedTargets).some((target) => allowed.has(target));
      const hashedMatch = hashCandidates.size > 0 && Array.from(hashCandidates).some((candidate) => hashedSet.has(candidate));

      if (!rawMatch && !hashedMatch) {
        return this.raiseAlert(
          action,
          'UNAUTHORIZED_TARGET',
          `target ${action.target ?? action.metadata?.target ?? action.metadata?.targetHash ?? action.metadata?.target_hash} is not authorized`,
          'CRITICAL',
          {
            target: action.target,
            normalizedTargets: Array.from(normalizedTargets),
            candidateHashes: Array.from(hashCandidates),
            allowedTargets: Array.from(allowed),
          },
          blockNumber,
        );
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
        }, blockNumber);
      }
    }

    const graceRatio = BigInt(Math.round(this.config.budgetGraceRatio * 1000));
    const grace = (action.agent.budget * graceRatio) / 1000n;
    if (updated > action.agent.budget + grace) {
      return this.raiseAlert(action, 'BUDGET_OVERRUN', `agent exceeded budget in ${domain.humanName}`, 'CRITICAL', {
        spent: updated.toString(),
        budget: action.agent.budget.toString(),
        grace: grace.toString(),
      }, blockNumber);
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
    const hashed = new Set<string>();
    for (const target of normalized) {
      const [withPrefix, withoutPrefix] = this.hashVariants(target);
      hashed.add(withPrefix);
      hashed.add(withoutPrefix);
    }
    this.config.allowedTargetHashes.set(domainId, hashed);
  }

  getAllowedTargets(domainId: string): Set<string> {
    const fromConfig = this.config.allowedTargets.get(domainId);
    if (fromConfig) {
      return new Set(fromConfig);
    }
    const domainTargets = this.getDomainConfig(domainId).allowedTargets;
    return new Set(Array.from(domainTargets, (target) => this.normalizeTarget(target)));
  }

  updateForbiddenSelectors(domainId: string, selectors: Iterable<string>): void {
    const normalized = Array.from(selectors, (selector) => selector.toLowerCase());
    this.config.forbiddenSelectors.set(domainId, new Set(normalized));
  }

  getForbiddenSelectors(domainId: string): Set<string> {
    const fromConfig = this.config.forbiddenSelectors.get(domainId);
    if (fromConfig) {
      return new Set(fromConfig);
    }
    const domainSelectors = this.getDomainConfig(domainId).forbiddenSelectors;
    return new Set(Array.from(domainSelectors, (selector) => selector.toLowerCase()));
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
