import WebSocket from 'ws';
import fetch from 'node-fetch';

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:3000';
const id = 'agent-1';
const wallet = '0xYourWalletAddress';

async function main() {
  await fetch(`${GATEWAY}/agents`, {
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
      await fetch(`${GATEWAY}/jobs/${msg.job.jobId}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: wallet, result: 'result data' }),
      });
    }
  });
}

main().catch(console.error);
