import { createServer } from 'node:http';

import { createLogger } from '../utils/telemetry.js';

const logger = createLogger('metrics');

export interface MetricsOptions {
  port: number;
  namespace: string;
}

const METRICS: Record<string, number> = {
  jobsCompleted: 0,
  jobsFailed: 0,
  stakeBalance: 0,
  rewardsClaimed: 0
};

export function incrementMetric(key: keyof typeof METRICS, value = 1): void {
  METRICS[key] += value;
}

export function setMetric(key: keyof typeof METRICS, value: number): void {
  METRICS[key] = value;
}

export function startMetricsServer(options: MetricsOptions): void {
  const server = createServer((req, res) => {
    if (!req.url?.includes('/metrics')) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/plain');
    for (const [key, value] of Object.entries(METRICS)) {
      res.write(`${options.namespace}_${key} ${value}\n`);
    }
    res.end();
  });

  server.listen(options.port, () => {
    logger.info({ port: options.port }, 'Metrics server listening');
  });
}
