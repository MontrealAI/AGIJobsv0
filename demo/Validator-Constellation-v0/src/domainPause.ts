import { SentinelAlert } from "./types";

export class DomainPauseManager {
  private pausedDomains = new Map<string, SentinelAlert>();

  pause(domain: string, alert: SentinelAlert) {
    this.pausedDomains.set(domain, alert);
  }

  resume(domain: string) {
    this.pausedDomains.delete(domain);
  }

  isPaused(domain: string): boolean {
    return this.pausedDomains.has(domain);
  }

  getAlert(domain: string): SentinelAlert | undefined {
    return this.pausedDomains.get(domain);
  }

  listPausedDomains(): string[] {
    return [...this.pausedDomains.keys()];
  }
}
