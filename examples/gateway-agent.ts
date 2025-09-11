import WebSocket from 'ws';
import fetch from 'node-fetch';

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:3000';
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || '5000');
const id = 'agent-1';
const wallet = '0xYourWalletAddress';

async function fetchWithTimeout(url: string, options: any = {}, retries = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError' && retries > 0) {
      console.warn(`Request to ${url} timed out, retrying...`);
      return fetchWithTimeout(url, options, retries - 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await fetchWithTimeout(`${GATEWAY}/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, wallet }),
  });

  const ws = new WebSocket(GATEWAY.replace('http', 'ws'));

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'register', id, wallet }));
  });

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'job') {
      console.log('job received', msg.job);
      ws.send(JSON.stringify({ type: 'ack', id, jobId: msg.job.jobId }));
      await fetchWithTimeout(`${GATEWAY}/jobs/${msg.job.jobId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: wallet, result: 'result data' }),
      });
    }
  });
}

main().catch(console.error);
