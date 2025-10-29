import { EventEmitter } from 'node:events';
import { AgentProfile, Domain, JobOutcome, SentinelAlert } from '../types.js';

export interface SentinelConfig {
  budgetOverrunThreshold: bigint;
  unsafeCallSignatures: string[];
  slaBlocks: number;
}

export interface SentinelEvents {
  alert: (alert: SentinelAlert) => void;
}

export class Sentinel extends EventEmitter {
  private readonly alerts: SentinelAlert[] = [];

  constructor(private config: SentinelConfig) {
    super();
  }

  public monitor(job: JobOutcome, agent: AgentProfile, actionSignature: string) {
    const now = Date.now();
    if (job.cost > agent.budgetLimit || job.cost > this.config.budgetOverrunThreshold) {
      this.raiseAlert({
        jobId: job.jobId,
        domain: job.domain,
        reason: 'Budget overrun detected',
        severity: 'critical',
        triggeredAt: now,
      });
    }
    if (this.config.unsafeCallSignatures.includes(actionSignature)) {
      this.raiseAlert({
        jobId: job.jobId,
        domain: job.domain,
        reason: `Unsafe call attempted: ${actionSignature}`,
        severity: 'critical',
        triggeredAt: now,
      });
    }
  }

  public getAlerts(domain?: Domain) {
    if (!domain) {
      return [...this.alerts];
    }
    return this.alerts.filter((alert) => alert.domain === domain);
  }

  private raiseAlert(alert: Omit<SentinelAlert, 'id'>) {
    const enriched: SentinelAlert = { ...alert, id: `alert-${this.alerts.length + 1}` };
    this.alerts.push(enriched);
    this.emit('alert', enriched);
  }
}
