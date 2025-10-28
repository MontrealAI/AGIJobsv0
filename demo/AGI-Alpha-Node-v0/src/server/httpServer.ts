import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { AlphaNode, AlphaNodeHeartbeat } from '../node';
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
  let latestHeartbeat: AlphaNodeHeartbeat | null = null;

  const dashboardApp = express();
  dashboardApp.use(express.json());

  dashboardApp.get('/api/heartbeat', async (_req, res) => {
    if (!latestHeartbeat) {
      latestHeartbeat = await node.heartbeat(defaultOpportunities());
    }
    res.json(latestHeartbeat);
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

