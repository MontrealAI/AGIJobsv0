const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { ethers } = require('ethers');
const WalletManager = require('./wallet');

// Environment configuration
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const JOB_REGISTRY_ADDRESS = process.env.JOB_REGISTRY_ADDRESS || '';
const VALIDATION_MODULE_ADDRESS = process.env.VALIDATION_MODULE_ADDRESS || '';
const WALLET_KEYS = process.env.WALLET_KEYS || '';
const PORT = process.env.PORT || 3000;

// Provider and wallet manager
const provider = new ethers.JsonRpcProvider(RPC_URL);
const walletManager = new WalletManager(WALLET_KEYS, provider);

// Minimal ABI for JobRegistry interactions
const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee)',
  'function applyForJob(uint256 jobId, string subdomain, bytes proof) external',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI, string subdomain, bytes proof) external'
];

// Minimal ABI for ValidationModule interactions
const VALIDATION_MODULE_ABI = [
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256 jobId, bytes32 commitHash)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 salt)'
];

const registry = new ethers.Contract(JOB_REGISTRY_ADDRESS, JOB_REGISTRY_ABI, provider);
const validation = VALIDATION_MODULE_ADDRESS
  ? new ethers.Contract(VALIDATION_MODULE_ADDRESS, VALIDATION_MODULE_ABI, provider)
  : null;

// In-memory stores
const jobs = new Map();
const agents = new Map(); // id -> { url, wallet, ws }
const commits = new Map(); // jobId -> { address -> {approve, salt} }
const pendingJobs = new Map(); // id -> [job]

function queueJob(id, job) {
  if (!pendingJobs.has(id)) pendingJobs.set(id, []);
  pendingJobs.get(id).push(job);
}

// Listen for JobCreated events
registry.on('JobCreated', (jobId, employer, agentAddr, reward, stake, fee) => {
  const job = {
    jobId: jobId.toString(),
    employer,
    agent: agentAddr,
    reward: reward.toString(),
    stake: stake.toString(),
    fee: fee.toString()
  };
  jobs.set(job.jobId, job);
  broadcast({ type: 'JobCreated', job });
  dispatch(job);
  console.log('JobCreated', job);
});

// Express app setup
const app = express();
app.use(express.json());

// Register an agent to receive job dispatches
app.post('/agents', (req, res) => {
  const { id, url, wallet } = req.body;
  if (!id || !wallet) {
    return res.status(400).json({ error: 'id and wallet required' });
  }
  agents.set(id, { url, wallet, ws: agents.get(id)?.ws || null });
  if (!pendingJobs.has(id)) pendingJobs.set(id, []);
  res.json({ id, url, wallet });
});

app.get('/agents', (req, res) => {
  res.json(Array.from(agents.entries()).map(([id, a]) => ({ id, url: a.url, wallet: a.wallet })));
});

// REST endpoint to list jobs
app.get('/jobs', (req, res) => {
  res.json(Array.from(jobs.values()));
});

// Apply for a job with a managed wallet
app.post('/jobs/:id/apply', async (req, res) => {
  const { address } = req.body;
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const tx = await registry.connect(wallet).applyForJob(req.params.id, '', '0x');
    await tx.wait();
    res.json({ tx: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit job result
app.post('/jobs/:id/submit', async (req, res) => {
  const { address, result } = req.body;
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const hash = ethers.id(result || '');
    const tx = await registry
      .connect(wallet)
      .submit(req.params.id, hash, result || '', '', '0x');
    await tx.wait();
    res.json({ tx: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helpers for commit/reveal workflow
async function commitHelper(jobId, wallet, approve) {
  if (!validation) throw new Error('validation module not configured');
  const nonce = await validation.jobNonce(jobId);
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32'],
    [BigInt(jobId), nonce, approve, salt]
  );
  const tx = await validation.connect(wallet).commitValidation(jobId, commitHash);
  await tx.wait();
  if (!commits.has(jobId)) commits.set(jobId, {});
  const jobCommits = commits.get(jobId);
  jobCommits[wallet.address.toLowerCase()] = { approve, salt };
  return { tx: tx.hash, salt };
}

async function revealHelper(jobId, wallet) {
  if (!validation) throw new Error('validation module not configured');
  const jobCommits = commits.get(jobId) || {};
  const data = jobCommits[wallet.address.toLowerCase()];
  if (!data) throw new Error('no commit found');
  const tx = await validation
    .connect(wallet)
    .revealValidation(jobId, data.approve, data.salt);
  await tx.wait();
  delete jobCommits[wallet.address.toLowerCase()];
  return { tx: tx.hash };
}

// Commit validation decision
app.post('/jobs/:id/commit', async (req, res) => {
  const { address, approve } = req.body;
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const result = await commitHelper(req.params.id, wallet, approve);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reveal validation decision
app.post('/jobs/:id/reveal', async (req, res) => {
  const { address } = req.body;
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const result = await revealHelper(req.params.id, wallet);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// HTTP & WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      return;
    }
    if (msg.type === 'register') {
      const { id, wallet } = msg;
      if (!id || !wallet) return;
      const existing = agents.get(id) || {};
      agents.set(id, { url: existing.url, wallet, ws });
      if (!pendingJobs.has(id)) pendingJobs.set(id, []);
      pendingJobs.get(id).forEach((job) => {
        ws.send(JSON.stringify({ type: 'job', job }));
      });
    } else if (msg.type === 'ack') {
      const { id, jobId } = msg;
      const queue = pendingJobs.get(id) || [];
      pendingJobs.set(
        id,
        queue.filter((j) => j.jobId !== String(jobId))
      );
    }
  });

  ws.on('close', () => {
    agents.forEach((info) => {
      if (info.ws === ws) info.ws = null;
    });
  });
});

function broadcast(payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  });
}

// Dispatch jobs to registered agents
function dispatch(job) {
  agents.forEach((info, id) => {
    queueJob(id, job);
    if (info.ws && info.ws.readyState === 1) {
      info.ws.send(JSON.stringify({ type: 'job', job }));
    } else if (info.url) {
      fetch(info.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(job)
      }).catch((err) => console.error('dispatch error', err));
    }
  });
}

server.listen(PORT, () => {
  console.log(`Agent gateway listening on port ${PORT}`);
  console.log('Wallets:', walletManager.list());
});

module.exports = { app, server, commitHelper, revealHelper };
