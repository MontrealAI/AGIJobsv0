import { performance } from 'node:perf_hooks';

type Outcome = 'success' | 'failure';

type CounterSet = {
  total: number;
  success: number;
  failure: number;
  durationMs: number;
};

type ExecuteCounters = CounterSet & {
  byAction: Map<string, CounterSet>;
};

interface MetricsSnapshot {
  plan: CounterSet;
  execute: ExecuteCounters;
  status: CounterSet;
}

const DEFAULT_COUNTERS = (): CounterSet => ({ total: 0, success: 0, failure: 0, durationMs: 0 });

const metrics: MetricsSnapshot = {
  plan: DEFAULT_COUNTERS(),
  execute: { ...DEFAULT_COUNTERS(), byAction: new Map() },
  status: DEFAULT_COUNTERS(),
};

function recordCounter(counter: CounterSet, outcome: Outcome, durationMs: number): void {
  counter.total += 1;
  if (outcome === 'success') {
    counter.success += 1;
  } else {
    counter.failure += 1;
  }
  counter.durationMs += durationMs;
}

function recordExecuteAction(action: string | undefined, outcome: Outcome, durationMs: number): void {
  if (!action) return;
  const key = action.toLowerCase();
  let entry = metrics.execute.byAction.get(key);
  if (!entry) {
    entry = DEFAULT_COUNTERS();
    metrics.execute.byAction.set(key, entry);
  }
  recordCounter(entry, outcome, durationMs);
}

function toOutcome(error: unknown): Outcome {
  return error ? 'failure' : 'success';
}

function formatLine(name: string, value: number, labels?: Record<string, string>): string {
  const pieces: string[] = [name];
  if (labels && Object.keys(labels).length > 0) {
    const encoded = Object.entries(labels)
      .map(([key, val]) => `${key}="${escapeLabelValue(val)}"`)
      .join(',');
    pieces[0] += `{${encoded}}`;
  }
  pieces.push(String(value));
  return pieces.join(' ');
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function renderCounterMetrics(name: string, counter: CounterSet): string[] {
  return [
    `# HELP ${name}_requests_total Total ${name} requests received by the one-box orchestrator.`,
    `# TYPE ${name}_requests_total counter`,
    formatLine(`${name}_requests_total`, counter.total),
    formatLine(`${name}_requests_success_total`, counter.success),
    formatLine(`${name}_requests_failed_total`, counter.failure),
    formatLine(`${name}_request_duration_ms_sum`, counter.durationMs),
  ];
}

export function now(): number {
  return performance.now();
}

export function recordPlan(durationMs: number, error?: unknown): void {
  recordCounter(metrics.plan, toOutcome(error), durationMs);
}

export function recordExecute(durationMs: number, action?: string, error?: unknown): void {
  const outcome = toOutcome(error);
  recordCounter(metrics.execute, outcome, durationMs);
  recordExecuteAction(action, outcome, durationMs);
}

export function recordStatus(durationMs: number, error?: unknown): void {
  recordCounter(metrics.status, toOutcome(error), durationMs);
}

export function renderMetrics(): string {
  const lines: string[] = [];
  lines.push(...renderCounterMetrics('onebox_plan', metrics.plan));
  lines.push(...renderCounterMetrics('onebox_execute', metrics.execute));
  for (const [action, counter] of metrics.execute.byAction.entries()) {
    lines.push(
      formatLine('onebox_execute_action_total', counter.total, { action }),
      formatLine('onebox_execute_action_success_total', counter.success, { action }),
      formatLine('onebox_execute_action_failed_total', counter.failure, { action }),
      formatLine('onebox_execute_action_duration_ms_sum', counter.durationMs, { action })
    );
  }
  lines.push(...renderCounterMetrics('onebox_status', metrics.status));
  return lines.join('\n') + '\n';
}

export function resetMetrics(): void {
  metrics.plan = DEFAULT_COUNTERS();
  metrics.execute = { ...DEFAULT_COUNTERS(), byAction: new Map() };
  metrics.status = DEFAULT_COUNTERS();
}

export function withDuration<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; durationMs: number }>; 
export function withDuration<T>(fn: () => T): { value?: T; error?: unknown; durationMs: number };
export function withDuration<T>(fn: () => T | Promise<T>):
  | { value?: T; error?: unknown; durationMs: number }
  | Promise<{ value?: T; error?: unknown; durationMs: number }>
{
  const start = now();
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then((value) => ({ value, durationMs: now() - start }))
        .catch((error) => ({ error, durationMs: now() - start }));
    }
    return { value: result, durationMs: now() - start };
  } catch (error) {
    return { error, durationMs: now() - start };
  }
}
