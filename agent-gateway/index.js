const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { ethers } = require('ethers');

// Environment configuration
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS || '';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || '';
const PORT = process.env.PORT || 3000;

// Minimal ABI for JobRegistry interactions
const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee)',
  'function applyForJob(uint256 jobId, string subdomain, bytes proof) external',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI, string subdomain, bytes proof) external'
];

// Provider and signer
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = AGENT_PRIVATE_KEY ? new ethers.Wallet(AGENT_PRIVATE_KEY, provider) : provider;

const registry = new ethers.Contract(JOB_REGISTRY_ADDRESS, JOB_REGISTRY_ABI, signer);

// In-memory store of open jobs
const jobs = new Map();

// Listen for JobCreated events
registry.on('JobCreated', (jobId, employer, agent, reward, stake, fee) => {
  const job = {
    jobId: jobId.toString(),
    employer,
    reward: reward.toString(),
    stake: stake.toString(),
    fee: fee.toString()
  };
  jobs.set(job.jobId, job);
  broadcast({ type: 'JobCreated', job });
  console.log('JobCreated', job);
});

// Express app setup
const app = express();
app.use(express.json());

// REST endpoint to list jobs
app.get('/jobs', (req, res) => {
  res.json(Array.from(jobs.values()));
});

// Apply for a job
app.post('/jobs/:id/apply', async (req, res) => {
  try {
    const tx = await registry.applyForJob(req.params.id, '', '0x');
    await tx.wait();
    res.json({ tx: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit job result
app.post('/jobs/:id/submit', async (req, res) => {
  try {
    const { result } = req.body;
    const hash = ethers.id(result || '');
    const tx = await registry.submit(req.params.id, hash, result || '', '', '0x');
    await tx.wait();
    res.json({ tx: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HTTP & WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  });
}

server.listen(PORT, () => {
  console.log(`Agent gateway listening on port ${PORT}`);
});
