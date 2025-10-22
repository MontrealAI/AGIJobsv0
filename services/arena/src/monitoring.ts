type FailureEntry = {
  count: number;
  lastReason: string;
  lastTimestamp: number;
};

const DEFAULT_THRESHOLD = Number(process.env.ARENA_ALERT_THRESHOLD ?? 3);
const COOLDOWN_MS = Number(process.env.ARENA_ALERT_COOLDOWN_MS ?? 5 * 60 * 1000);

export class MonitoringClient {
  private readonly webhook?: string;
  private readonly threshold: number;
  private readonly failures = new Map<string, FailureEntry>();

  constructor(webhook?: string, threshold = DEFAULT_THRESHOLD) {
    this.webhook = webhook ?? process.env.ARENA_ALERT_WEBHOOK ?? undefined;
    this.threshold = threshold;
  }

  async recordFailure(roundId: string, reason: string): Promise<void> {
    const now = Date.now();
    const current = this.failures.get(roundId) ?? {
      count: 0,
      lastReason: reason,
      lastTimestamp: now,
    };
    current.count += 1;
    current.lastReason = reason;
    current.lastTimestamp = now;
    this.failures.set(roundId, current);

    if (current.count >= this.threshold) {
      await this.dispatchAlert(roundId, current);
      current.count = 0;
    }
  }

  recordSuccess(roundId: string): void {
    this.failures.delete(roundId);
  }

  private async dispatchAlert(roundId: string, entry: FailureEntry): Promise<void> {
    if (!this.webhook) {
      console.warn(
        `⚠️ Monitoring alert: round ${roundId} failed ${entry.count} times (reason: ${entry.lastReason})`,
      );
      return;
    }
    const lastSent = entry.lastTimestamp;
    const previous = this.failures.get(`_alert:${roundId}`);
    if (previous && lastSent - previous.lastTimestamp < COOLDOWN_MS) {
      return; // avoid spamming the webhook
    }
    try {
      await fetch(this.webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roundId,
          failures: entry.count,
          reason: entry.lastReason,
          timestamp: new Date(entry.lastTimestamp).toISOString(),
        }),
      });
      this.failures.set(`_alert:${roundId}`, {
        count: 1,
        lastReason: entry.lastReason,
        lastTimestamp: entry.lastTimestamp,
      });
    } catch (error) {
      console.warn('⚠️ Failed to dispatch monitoring alert:', error);
    }
  }
}

export const monitoringClient = new MonitoringClient();

