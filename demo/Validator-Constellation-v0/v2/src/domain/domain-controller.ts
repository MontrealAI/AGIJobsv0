import { Domain } from '../types.js';

export class DomainController {
  private pausedDomains = new Map<Domain, { pausedAt: number; reason: string }>();

  public pause(domain: Domain, reason: string) {
    this.pausedDomains.set(domain, { pausedAt: Date.now(), reason });
  }

  public resume(domain: Domain) {
    this.pausedDomains.delete(domain);
  }

  public isPaused(domain: Domain) {
    return this.pausedDomains.has(domain);
  }

  public status(domain: Domain) {
    const info = this.pausedDomains.get(domain);
    if (!info) {
      return { paused: false } as const;
    }
    return { paused: true, ...info } as const;
  }

  public describe() {
    return [...this.pausedDomains.entries()].map(([domain, info]) => ({ domain, ...info }));
  }
}
