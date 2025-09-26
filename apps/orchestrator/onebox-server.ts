import express from 'express';
import { createOneboxRouter } from './oneboxRouter';

function configureCors(app: express.Express): void {
  const allowOrigin = process.env.ONEBOX_CORS_ALLOW ?? '*';
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', allowOrigin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

export function startOneboxServer(): void {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  configureCors(app);

  app.use('/onebox', createOneboxRouter());

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  const port = Number(process.env.ONEBOX_PORT ?? 8080);
  app.listen(port, () => {
    console.log(`One-box orchestrator listening on http://0.0.0.0:${port}`);
  });
}

if (require.main === module) {
  startOneboxServer();
}
