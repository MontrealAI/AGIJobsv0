import { performance } from 'node:perf_hooks';

type CounterLabels = {
  intentType: string;
  httpStatus: string;
};

type CounterVec = Map<string, number>;

interface HistogramEntry {
  sum: number;
  count: number;
  buckets: number[];
}

interface MetricsState {
  plan: CounterVec;
  execute: CounterVec;
  status: CounterVec;
  histogram: Map<string, HistogramEntry>;
}

const HISTOGRAM_BUCKETS = [0.1, 0.5, 1, 2.5, 5, 10];

const metrics: MetricsState = {
  plan: new Map(),
  execute: new Map(),
  status: new Map(),
  histogram: new Map(),
};

function counterKey(labels: CounterLabels): string {
  return `${labels.intentType}|${labels.httpStatus}`;
}

function parseCounterKey(key: string): CounterLabels {
  const [intentType, httpStatus] = key.split('|', 2);
  return {
    intentType: intentType ?? 'unknown',
    httpStatus: httpStatus ?? '0',
  };
}

function incrementCounter(vec: CounterVec, labels: CounterLabels): void {
  const key = counterKey(labels);
  vec.set(key, (vec.get(key) ?? 0) + 1);
}

function observeHistogram(endpoint: string, seconds: number): void {
  let entry = metrics.histogram.get(endpoint);
  if (!entry) {
    entry = {
      sum: 0,
      count: 0,
      buckets: HISTOGRAM_BUCKETS.map(() => 0),
    };
    metrics.histogram.set(endpoint, entry);
  }

  entry.sum += seconds;
  entry.count += 1;
  for (let index = 0; index < HISTOGRAM_BUCKETS.length; index += 1) {
    if (seconds <= HISTOGRAM_BUCKETS[index]) {
      entry.buckets[index] += 1;
    }
  }
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function formatLine(name: string, value: number, labels?: Record<string, string>): string {
  const parts: string[] = [name];
  if (labels && Object.keys(labels).length > 0) {
    const encoded = Object.entries(labels)
      .map(([key, val]) => `${key}="${escapeLabelValue(val)}"`)
      .join(',');
    parts[0] += `{${encoded}}`;
  }
  parts.push(String(value));
  return parts.join(' ');
}

function renderCounterVec(metricName: string, vec: CounterVec): string[] {
  const lines: string[] = [];
  lines.push(
    `# HELP ${metricName} Total ${metricName.replace('_total', '')} requests handled by the one-box orchestrator.`,
    `# TYPE ${metricName} counter`
  );
  for (const [key, value] of vec.entries()) {
    const { intentType, httpStatus } = parseCounterKey(key);
    lines.push(
      formatLine(metricName, value, {
        intent_type: intentType,
        http_status: httpStatus,
      })
    );
  }
  return lines;
}

function renderHistogram(metricName: string): string[] {
  const lines: string[] = [];
  lines.push(
    `# HELP ${metricName} End-to-end time to outcome in seconds for one-box requests.`,
    `# TYPE ${metricName} histogram`
  );
  for (const [endpoint, entry] of metrics.histogram.entries()) {
    let cumulative = 0;
    for (let index = 0; index < HISTOGRAM_BUCKETS.length; index += 1) {
      cumulative += entry.buckets[index];
      lines.push(
        formatLine(`${metricName}_bucket`, cumulative, {
          endpoint,
          le: String(HISTOGRAM_BUCKETS[index]),
        })
      );
    }
    lines.push(
      formatLine(`${metricName}_bucket`, entry.count, { endpoint, le: '+Inf' }),
      formatLine(`${metricName}_sum`, entry.sum, { endpoint }),
      formatLine(`${metricName}_count`, entry.count, { endpoint })
    );
  }
  return lines;
}

export function now(): number {
  return performance.now();
}

function toCounterLabels(intentType: string, httpStatus: number | string): CounterLabels {
  return {
    intentType: intentType || 'unknown',
    httpStatus: String(httpStatus || 0),
  };
}

export function recordPlan(intentType: string, httpStatus: number, durationMs: number): void {
  incrementCounter(metrics.plan, toCounterLabels(intentType, httpStatus));
  observeHistogram('plan', durationMs / 1000);
}

export function recordExecute(intentType: string, httpStatus: number, durationMs: number): void {
  incrementCounter(metrics.execute, toCounterLabels(intentType, httpStatus));
  observeHistogram('execute', durationMs / 1000);
}

export function recordStatus(intentType: string, httpStatus: number, durationMs: number): void {
  incrementCounter(metrics.status, toCounterLabels(intentType, httpStatus));
  observeHistogram('status', durationMs / 1000);
}

export function renderMetrics(): string {
  const lines: string[] = [];
  lines.push(...renderCounterVec('plan_total', metrics.plan));
  lines.push(...renderCounterVec('execute_total', metrics.execute));
  lines.push(...renderCounterVec('status_total', metrics.status));
  lines.push(...renderHistogram('time_to_outcome_seconds'));
  return `${lines.join('\n')}\n`;
}

export function resetMetrics(): void {
  metrics.plan.clear();
  metrics.execute.clear();
  metrics.status.clear();
  metrics.histogram.clear();
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
