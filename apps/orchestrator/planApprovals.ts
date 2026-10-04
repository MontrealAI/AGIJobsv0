import { createHash, randomUUID } from 'node:crypto';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Single-process approval boundary for One-Box. Restarts invalidate outstanding plans. */
export class PlanApprovalStore {
  private readonly plans = new Map<string, { intent: string; expires: number }>();
  constructor(private readonly clock = Date.now, private readonly ttlMs = 15 * 60_000, private readonly capacity = 1000) {}
  issue(intent: unknown): string {
    const now = this.clock();
    for (const [hash, plan] of this.plans) if (plan.expires <= now) this.plans.delete(hash);
    if (this.plans.size >= this.capacity) throw new Error('Too many outstanding plans. Wait for old plans to expire before planning again.');
    const encoded = canonical(intent);
    const hash = `0x${createHash('sha256').update(randomUUID()).update(encoded).digest('hex')}`;
    this.plans.set(hash, { intent: encoded, expires: now + this.ttlMs });
    return hash;
  }
  consume(hash: string | undefined, intent: unknown): void {
    const plan = hash ? this.plans.get(hash) : undefined;
    if (!plan || plan.expires <= this.clock() || plan.intent !== canonical(intent)) {
      throw new Error('Plan is missing, expired, changed, or already attempted. Inspect the previous outcome and create a fresh plan.');
    }
    // Consume synchronously before any provider call: concurrent requests cannot execute twice.
    this.plans.delete(hash!);
  }
}
