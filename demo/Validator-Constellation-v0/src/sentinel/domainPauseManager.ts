import type { Domain } from "../config/entities";
import type { EventIndexer } from "../subgraph/eventIndexer";

export type DomainState = "active" | "paused";

export class DomainPauseManager {
  private readonly state = new Map<Domain, DomainState>();

  constructor(private readonly indexer: EventIndexer) {}

  initialize(domains: readonly Domain[]) {
    for (const domain of domains) {
      this.state.set(domain, "active");
    }
  }

  isPaused(domain: Domain): boolean {
    return this.state.get(domain) === "paused";
  }

  pause(domain: Domain, reason: string) {
    if (this.state.get(domain) === "paused") {
      return;
    }
    this.state.set(domain, "paused");
    this.indexer.recordEvent("DomainPaused", { domain, reason });
  }

  resume(domain: Domain, note: string) {
    if (this.state.get(domain) === "active") {
      return;
    }
    this.state.set(domain, "active");
    this.indexer.recordEvent("DomainResumed", { domain, note });
  }

  getStates() {
    return Array.from(this.state.entries()).map(([domain, status]) => ({
      domain,
      status,
    }));
  }
}
