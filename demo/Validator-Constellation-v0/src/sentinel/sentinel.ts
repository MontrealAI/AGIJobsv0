import type { Domain } from "../config/entities";
import type { EventIndexer } from "../subgraph/eventIndexer";
import { DomainPauseManager } from "./domainPauseManager";
import type { AgentAction, SentinelAlert, SentinelMonitor } from "./types";

export interface SentinelOptions {
  readonly monitors: readonly SentinelMonitor[];
  readonly pauseManager: DomainPauseManager;
  readonly indexer: EventIndexer;
  readonly pauseSlaSeconds: number;
}

export class Sentinel {
  private readonly alerts: SentinelAlert[] = [];

  constructor(private readonly options: SentinelOptions) {}

  ingest(action: AgentAction) {
    if (this.options.pauseManager.isPaused(action.domain)) {
      return;
    }
    for (const monitor of this.options.monitors) {
      const alert = monitor.evaluate(action);
      if (alert) {
        this.alerts.push(alert);
        this.options.indexer.recordEvent("SentinelAlert", {
          domain: alert.domain,
          agent: alert.agent,
          ensName: alert.ensName,
          severity: alert.severity,
          reason: alert.reason,
          timestamp: alert.timestamp,
          monitor: monitor.name,
        });
        this.options.pauseManager.pause(alert.domain, alert.reason);
        break;
      }
    }
  }

  getAlerts(domain?: Domain): SentinelAlert[] {
    if (!domain) {
      return [...this.alerts];
    }
    return this.alerts.filter((alert) => alert.domain === domain);
  }
}
