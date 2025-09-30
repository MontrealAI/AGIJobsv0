import express from 'express';

const app = express();
app.use(express.json({ limit: process.env.MAX_REQUEST_BYTES || '512kb' }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/policy', (req, res) => {
  console.log('Received policy update', req.body);
  res.status(202).json({ accepted: true });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Paymaster supervisor mock on ${port}`);
});
