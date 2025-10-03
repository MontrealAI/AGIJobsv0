const fs = require('fs/promises');
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: process.env.NOTIFICATIONS_MAX_PAYLOAD || '512kb' }));

const storageDir = process.env.NOTIFICATIONS_STORAGE_DIR || path.join(__dirname, '..', '..', 'storage', 'notifications');
const logFile = () => path.join(storageDir, 'notifications.log');

async function ensureStorage() {
  await fs.mkdir(storageDir, { recursive: true });
}

async function appendNotification(entry) {
  const payload = {
    receivedAt: new Date().toISOString(),
    ...entry,
  };
  await fs.appendFile(logFile(), `${JSON.stringify(payload)}\n`, 'utf8');
  return payload;
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/notifications', async (_req, res) => {
  try {
    const data = await fs.readFile(logFile(), 'utf8');
    const lines = data.trim() ? data.trim().split(/\n+/) : [];
    const parsed = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return { raw: line, error: err?.message || 'Failed to parse' };
      }
    });
    res.json({ notifications: parsed });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      res.json({ notifications: [] });
      return;
    }
    console.error('Failed to read notification log', err);
    res.status(500).json({ error: 'Failed to read notifications' });
  }
});

app.post('/notify', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Payload must be a JSON object' });
      return;
    }
    const recorded = await appendNotification(payload);
    console.info('Notification recorded', recorded);
    res.status(202).json({ ok: true });
  } catch (err) {
    console.error('Failed to record notification', err);
    res.status(500).json({ error: 'Failed to persist notification' });
  }
});

async function start() {
  try {
    await ensureStorage();
    const port = Number(process.env.NOTIFICATIONS_PORT || 8075);
    app.listen(port, '0.0.0.0', () => {
      console.log(`Notification service listening on ${port}`);
    });
  } catch (err) {
    console.error('Notification service failed to start', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
