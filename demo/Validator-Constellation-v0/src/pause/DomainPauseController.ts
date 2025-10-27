import { EventBus } from "../subgraph/EventBus";

export interface DomainState {
  domain: string;
  paused: boolean;
  reason?: string;
  triggeredAt?: number;
}

export class DomainPauseController {
  private readonly states = new Map<string, DomainState>();

  constructor(private readonly bus: EventBus) {}

  ensure(domain: string): DomainState {
    if (!this.states.has(domain)) {
      this.states.set(domain, { domain, paused: false });
    }
    return this.states.get(domain)!;
  }

  isPaused(domain: string): boolean {
    return this.states.get(domain)?.paused ?? false;
  }

  pause(domain: string, reason: string): DomainState {
    const state = this.ensure(domain);
    state.paused = true;
    state.reason = reason;
    state.triggeredAt = Date.now();
    this.bus.emit("DomainPaused", { domain, reason });
    return state;
  }

  resume(domain: string): DomainState {
    const state = this.ensure(domain);
    state.paused = false;
    state.reason = undefined;
    state.triggeredAt = undefined;
    this.bus.emit("DomainResumed", { domain });
    return state;
  }

  all(): DomainState[] {
    return Array.from(this.states.values());
  }
}
