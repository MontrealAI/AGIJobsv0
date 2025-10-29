import { DomainPauseManager } from "./domainPause";
import { JobResult, SentinelAlert } from "./types";

export interface SentinelConfig {
  budgetLimit: bigint;
  unsafeFunctionPatterns: RegExp[];
}

export type ExecutionEvent = {
  domain: string;
  job: JobResult;
  action: string;
  costDelta: bigint;
};

export class SentinelMonitor {
  private alerts: SentinelAlert[] = [];

  constructor(
    private config: SentinelConfig,
    private pauseManager: DomainPauseManager,
    initialAlerts: SentinelAlert[] = []
  ) {
    this.alerts = [...initialAlerts];
    initialAlerts.forEach((alert) => this.pauseManager.pause(alert.domain, alert));
  }

  observe(event: ExecutionEvent) {
    if (this.pauseManager.isPaused(event.domain)) {
      return;
    }
    if (event.job.cost + event.costDelta > this.config.budgetLimit) {
      this.raiseAlert(event.domain, "BUDGET", `Budget exceeded for job ${event.job.jobId}`);
      return;
    }
    if (this.config.unsafeFunctionPatterns.some((pattern) => pattern.test(event.action))) {
      this.raiseAlert(event.domain, "UNSAFE_CALL", `Unsafe action attempted: ${event.action}`);
    }
  }

  private raiseAlert(domain: string, type: SentinelAlert["type"], details: string) {
    const alert: SentinelAlert = {
      domain,
      type,
      details,
      timestamp: Date.now(),
    };
    this.alerts.push(alert);
    this.pauseManager.pause(domain, alert);
  }

  getAlerts(): SentinelAlert[] {
    return [...this.alerts];
  }

  getConfig(): SentinelConfig {
    return { ...this.config, unsafeFunctionPatterns: [...this.config.unsafeFunctionPatterns] };
  }
}
