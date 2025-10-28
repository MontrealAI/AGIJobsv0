import { eventBus } from './eventBus';
import { DomainConfig, DomainState, PauseRecord } from './types';

export class DomainPauseController {
  private readonly domains = new Map<string, DomainState>();

  constructor(domains: DomainConfig[]) {
    for (const config of domains) {
      this.domains.set(config.id, {
        config: {
          ...config,
          unsafeOpcodes: new Set(config.unsafeOpcodes),
          allowedTargets: new Set(config.allowedTargets),
          forbiddenSelectors: new Set(config.forbiddenSelectors),
        },
        paused: false,
      });
    }
  }

  getState(domainId: string): DomainState {
    const state = this.domains.get(domainId);
    if (!state) {
      throw new Error(`unknown domain ${domainId}`);
    }
    return state;
  }

  pause(domainId: string, reason: string, triggeredBy: string, blockNumber?: number): PauseRecord {
    const state = this.getState(domainId);
    if (state.paused) {
      return state.pauseReason!;
    }
    const record: PauseRecord = {
      domainId,
      reason,
      triggeredBy,
      timestamp: Date.now(),
      blockNumber,
    };
    state.paused = true;
    state.pauseReason = record;
    eventBus.emit('DomainPaused', record);
    return record;
  }

  resume(domainId: string, triggeredBy: string, blockNumber?: number): PauseRecord {
    const state = this.getState(domainId);
    if (!state.paused || !state.pauseReason) {
      throw new Error('domain is not paused');
    }
    const record: PauseRecord = {
      ...state.pauseReason,
      resumedAt: Date.now(),
      triggeredBy,
      resumedAtBlock: blockNumber,
    };
    state.paused = false;
    state.pauseReason = undefined;
    eventBus.emit('DomainResumed', record);
    return record;
  }

  listDomains(): DomainState[] {
    return Array.from(this.domains.values()).map((state) => ({
      config: {
        ...state.config,
        unsafeOpcodes: new Set(state.config.unsafeOpcodes),
        allowedTargets: new Set(state.config.allowedTargets),
        forbiddenSelectors: new Set(state.config.forbiddenSelectors),
      },
      paused: state.paused,
      pauseReason: state.pauseReason ? { ...state.pauseReason } : undefined,
    }));
  }

  updateConfig(domainId: string, updates: Partial<Omit<DomainConfig, 'id'>>): DomainConfig {
    const state = this.getState(domainId);
    const unsafeOpcodes =
      updates.unsafeOpcodes !== undefined ? new Set(updates.unsafeOpcodes) : new Set(state.config.unsafeOpcodes);
    const allowedTargets =
      updates.allowedTargets !== undefined
        ? new Set(Array.from(updates.allowedTargets, (target) => target.toLowerCase()))
        : new Set(state.config.allowedTargets);
    const forbiddenSelectors =
      updates.forbiddenSelectors !== undefined
        ? new Set(Array.from(updates.forbiddenSelectors, (selector) => selector.toLowerCase()))
        : new Set(state.config.forbiddenSelectors);
    const maxCalldataBytes = updates.maxCalldataBytes ?? state.config.maxCalldataBytes;
    const updated: DomainConfig = {
      ...state.config,
      ...('humanName' in updates ? { humanName: updates.humanName! } : {}),
      ...('budgetLimit' in updates ? { budgetLimit: updates.budgetLimit! } : {}),
      unsafeOpcodes,
      allowedTargets,
      maxCalldataBytes,
      forbiddenSelectors,
    };
    state.config = updated;
    return updated;
  }
}
