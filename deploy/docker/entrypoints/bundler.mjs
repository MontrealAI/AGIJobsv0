import express from 'express';

const app = express();
app.use(express.json({ limit: process.env.MAX_REQUEST_BYTES || '1mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/rpc', (req, res) => {
  res.json({ id: req.body?.id ?? null, result: 'ok' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Bundler mock listening on ${port}`);
});
