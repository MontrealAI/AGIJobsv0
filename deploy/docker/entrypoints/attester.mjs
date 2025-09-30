import express from 'express';

const app = express();
app.use(express.json({ limit: process.env.MAX_REQUEST_BYTES || '256kb' }));

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/attest', (req, res) => {
  res.json({ schemaUID: process.env.EAS_SCHEMA_UID || '0x0', receipt: req.body });
});

const port = Number(process.env.PORT || 7000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Attester mock on ${port}`);
});
