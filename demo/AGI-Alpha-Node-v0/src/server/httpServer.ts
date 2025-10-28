import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { AlphaNode } from '../node';
import { JobOpportunity } from '../ai/planner';
import { defaultOpportunities } from '../utils/opportunities';

export interface ServerOptions {
  readonly dashboardPort: number;
  readonly metricsPort: number;
}

export async function startAlphaNodeServer(
  node: AlphaNode,
  options: ServerOptions
): Promise<{ dashboard: http.Server; metrics: http.Server }> {
  const dashboardApp = express();
  dashboardApp.use(express.json());

  dashboardApp.get('/api/heartbeat', async (_req, res) => {
    const heartbeat = await node.heartbeat(defaultOpportunities());
    res.json(heartbeat);
  });

  dashboardApp.post('/api/plan', async (req, res) => {
    const jobs = (req.body?.jobs ?? []) as JobOpportunity[];
    const plan = node.plan(jobs);
    res.json(plan);
  });

  const staticDir = path.resolve(__dirname, '../../web');
  dashboardApp.use(express.static(staticDir));

  const metricsApp = express();
  metricsApp.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(await node.getMetrics().render());
  });

  const dashboardServer = dashboardApp.listen(options.dashboardPort);
  const metricsServer = metricsApp.listen(options.metricsPort);

  return { dashboard: dashboardServer, metrics: metricsServer };
}

