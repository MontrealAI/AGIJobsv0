import { sentinelRules } from './config';
import { AgentIdentity, JobResult, SentinelAlert } from './types';

export class SentinelMesh {
  private alerts: SentinelAlert[] = [];

  evaluate(job: JobResult, agent: AgentIdentity): SentinelAlert[] {
    const triggered = sentinelRules
      .map((rule) => rule.evaluate(job, agent))
      .filter((alert): alert is SentinelAlert => alert !== null);
    this.alerts.push(...triggered);
    return triggered;
  }

  getAlerts(): SentinelAlert[] {
    return [...this.alerts];
  }

  clear(): void {
    this.alerts = [];
  }
}
