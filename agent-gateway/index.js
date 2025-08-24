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
const agents = new Map(); // id -> {url, wallet}
const commits = new Map(); // jobId -> { address -> {approve, salt} }

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
  if (!id || !url || !wallet) {
    return res.status(400).json({ error: 'id, url and wallet required' });
  }
  agents.set(id, { url, wallet });
  res.json({ id, url, wallet });
});

app.get('/agents', (req, res) => {
  res.json(Array.from(agents.entries()).map(([id, a]) => ({ id, ...a })));
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

// Commit validation decision
app.post('/jobs/:id/commit', async (req, res) => {
  if (!validation) {
    return res.status(500).json({ error: 'validation module not configured' });
  }
  const { address, approve } = req.body;
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const nonce = await validation.jobNonce(req.params.id);
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const commitHash = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32'],
      [BigInt(req.params.id), nonce, approve, salt]
    );
    const tx = await validation
      .connect(wallet)
      .commitValidation(req.params.id, commitHash);
    await tx.wait();
    if (!commits.has(req.params.id)) commits.set(req.params.id, {});
    const jobCommits = commits.get(req.params.id);
    jobCommits[address.toLowerCase()] = { approve, salt };
    res.json({ tx: tx.hash, salt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reveal validation decision
app.post('/jobs/:id/reveal', async (req, res) => {
  if (!validation) {
    return res.status(500).json({ error: 'validation module not configured' });
  }
  const { address } = req.body;
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  const jobCommits = commits.get(req.params.id) || {};
  const data = jobCommits[address.toLowerCase()];
  if (!data) return res.status(400).json({ error: 'no commit found' });
  try {
    const tx = await validation
      .connect(wallet)
      .revealValidation(req.params.id, data.approve, data.salt);
    await tx.wait();
    delete jobCommits[address.toLowerCase()];
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

// Dispatch jobs to registered agents via HTTP
function dispatch(job) {
  agents.forEach(({ url }) => {
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(job)
    }).catch((err) => console.error('dispatch error', err));
  });
}

server.listen(PORT, () => {
  console.log(`Agent gateway listening on port ${PORT}`);
  console.log('Wallets:', walletManager.list());
});
