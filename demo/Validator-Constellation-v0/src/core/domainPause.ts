import { eventBus } from './eventBus';
import { DomainConfig, DomainState, PauseRecord } from './types';

function normalizeOpcodes(values: Iterable<string>): Set<string> {
  return new Set(
    Array.from(values, (value) => value.trim().toUpperCase()).filter((value) => value.length > 0),
  );
}

function normalizeTargets(values: Iterable<string>): Set<string> {
  return new Set(
    Array.from(values, (value) => value.trim().toLowerCase()).filter((value) => value.length > 0),
  );
}

function cloneConfig(config: DomainConfig): DomainConfig {
  return {
    ...config,
    unsafeOpcodes: normalizeOpcodes(config.unsafeOpcodes),
    allowedTargets: normalizeTargets(config.allowedTargets),
  };
}

export class DomainPauseController {
  private readonly domains = new Map<string, DomainState>();

  constructor(domains: DomainConfig[]) {
    for (const config of domains) {
      const cloned = cloneConfig(config);
      this.domains.set(cloned.id, { config: cloned, paused: false });
    }
  }

  getState(domainId: string): DomainState {
    const state = this.domains.get(domainId);
    if (!state) {
      throw new Error(`unknown domain ${domainId}`);
    }
    return state;
  }

  pause(domainId: string, reason: string, triggeredBy: string): PauseRecord {
    const state = this.getState(domainId);
    if (state.paused) {
      return state.pauseReason!;
    }
    const record: PauseRecord = {
      domainId,
      reason,
      triggeredBy,
      timestamp: Date.now(),
    };
    state.paused = true;
    state.pauseReason = record;
    eventBus.emit('DomainPaused', record);
    return record;
  }

  resume(domainId: string, triggeredBy: string): PauseRecord {
    const state = this.getState(domainId);
    if (!state.paused || !state.pauseReason) {
      throw new Error('domain is not paused');
    }
    const record: PauseRecord = {
      ...state.pauseReason,
      resumedAt: Date.now(),
      triggeredBy,
    };
    state.paused = false;
    state.pauseReason = undefined;
    eventBus.emit('DomainResumed', record);
    return record;
  }

  listDomains(): DomainState[] {
    return Array.from(this.domains.values()).map((state) => ({
      config: cloneConfig(state.config),
      paused: state.paused,
      pauseReason: state.pauseReason ? { ...state.pauseReason } : undefined,
    }));
  }

  updateConfig(domainId: string, updates: Partial<Omit<DomainConfig, 'id'>>): DomainConfig {
    const state = this.getState(domainId);
    const unsafeOpcodes =
      updates.unsafeOpcodes !== undefined
        ? normalizeOpcodes(updates.unsafeOpcodes)
        : new Set(state.config.unsafeOpcodes);
    const allowedTargets =
      updates.allowedTargets !== undefined
        ? normalizeTargets(updates.allowedTargets)
        : new Set(state.config.allowedTargets);
    const updated: DomainConfig = {
      ...state.config,
      ...('humanName' in updates ? { humanName: updates.humanName! } : {}),
      ...('budgetLimit' in updates ? { budgetLimit: updates.budgetLimit! } : {}),
      unsafeOpcodes,
      allowedTargets,
    };
    state.config = updated;
    return cloneConfig(updated);
  }
}
