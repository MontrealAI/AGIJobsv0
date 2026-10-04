import express from 'express';
import { createOneboxRouter } from './oneboxRouter';
import type { Server } from 'node:http';

function configureCors(app: express.Express): void {
  const allowed = (process.env.ONEBOX_CORS_ALLOW ?? 'http://127.0.0.1:4173,http://localhost:4173').split(',').map(value => value.trim()).filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !allowed.includes(origin)) { res.status(403).json({ error: 'Origin is not allowed.' }); return; }
    if (origin) { res.header('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

export function createOneboxApp(service?: Parameters<typeof createOneboxRouter>[0]): express.Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  configureCors(app);

  const prefix = process.env.ONEBOX_PREFIX ?? '/onebox';
  if (prefix && !/^\/[a-zA-Z0-9/_-]*$/.test(prefix)) throw new Error('Invalid ONEBOX_PREFIX');
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(prefix || '/', createOneboxRouter(service));
  return app;
}

export function startOneboxServer(): Server {
  const app = createOneboxApp();

  const port = Number(process.env.ONEBOX_PORT ?? 8080);
  const host = process.env.ONEBOX_HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ONEBOX_PORT');
  const server = app.listen(port, host, () => {
    console.log(`One-box orchestrator listening on ${host}:${port}`);
  });
  return server;
}

if (require.main === module) {
  const server = startOneboxServer();
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
