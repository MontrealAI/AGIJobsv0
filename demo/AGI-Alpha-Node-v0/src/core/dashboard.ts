import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

import { createLogger } from '../utils/telemetry.js';

const logger = createLogger('dashboard');

export interface DashboardOptions {
  port: number;
  assetsDir: string;
}

interface DashboardEvent {
  type: string;
  payload: unknown;
}

const subscribers = new Set<NodeJS.WritableStream>();

export function broadcast(event: DashboardEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const stream of subscribers) {
    stream.write(data);
  }
}

export function startDashboard(options: DashboardOptions): void {
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache'
      });
      subscribers.add(res);
      req.on('close', () => {
        subscribers.delete(res);
      });
      return;
    }

    if (req.url.startsWith('/assets/')) {
      const filePath = path.join(options.assetsDir, req.url.replace('/assets/', ''));
      try {
        const file = await fs.readFile(filePath);
        res.writeHead(200);
        res.end(file);
      } catch (error) {
        res.statusCode = 404;
        res.end('Asset not found');
      }
      return;
    }

    const dashboardPath = path.join(options.assetsDir, '..', 'dashboard.html');
    const stream = createReadStream(dashboardPath);
    stream.pipe(res);
    stream.on('error', (error) => {
      logger.error({ error }, 'Failed to stream dashboard');
      res.statusCode = 500;
      res.end('Dashboard unavailable');
    });
  });

  server.listen(options.port, () => {
    logger.info({ port: options.port }, 'Dashboard available');
  });
}
