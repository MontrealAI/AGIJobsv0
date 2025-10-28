import { Domain, DomainPauseEvent, SentinelAlert } from './types';

export class DomainPauseManager {
  private pausedDomains = new Map<Domain, DomainPauseEvent>();
  private history: DomainPauseEvent[] = [];

  pauseFromAlert(alert: SentinelAlert): DomainPauseEvent {
    const event: DomainPauseEvent = {
      domain: alert.domain,
      reason: `${alert.severity.toUpperCase()}: ${alert.message}`,
      by: alert.triggeredBy,
      timestamp: Date.now(),
    };
    this.pausedDomains.set(alert.domain, event);
    this.history.push(event);
    return event;
  }

  resume(domain: Domain, actor: string): DomainPauseEvent | null {
    if (!this.pausedDomains.has(domain)) {
      return null;
    }
    const event: DomainPauseEvent = {
      domain,
      reason: `Resumed by ${actor}`,
      by: actor,
      timestamp: Date.now(),
    };
    this.pausedDomains.delete(domain);
    this.history.push(event);
    return event;
  }

  isPaused(domain: Domain): boolean {
    return this.pausedDomains.has(domain);
  }

  getPausedDomains(): Domain[] {
    return [...this.pausedDomains.keys()];
  }

  getHistory(): DomainPauseEvent[] {
    return [...this.history];
  }
}
