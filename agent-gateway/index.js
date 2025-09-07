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
const BOT_WALLET = process.env.BOT_WALLET || '';
// $AGIALPHA token parameters
const {
  address: AGIALPHA_ADDRESS,
  decimals: AGIALPHA_DECIMALS,
} = require('../config/agialpha.json');
const TOKEN_DECIMALS = AGIALPHA_DECIMALS;

// Startup validation for required addresses
if (!JOB_REGISTRY_ADDRESS || !ethers.isAddress(JOB_REGISTRY_ADDRESS)) {
  console.error(
    'JOB_REGISTRY_ADDRESS is required and must be set to a valid Ethereum address.'
  );
  process.exit(1);
}

if ('VALIDATION_MODULE_ADDRESS' in process.env) {
  if (
    !VALIDATION_MODULE_ADDRESS ||
    !ethers.isAddress(VALIDATION_MODULE_ADDRESS)
  ) {
    console.error(
      'VALIDATION_MODULE_ADDRESS must be set to a valid Ethereum address when using validation features.'
    );
    process.exit(1);
  }
}

// Provider and wallet manager
const provider = new ethers.JsonRpcProvider(RPC_URL);

async function checkEnsSubdomain(address) {
  try {
    const name = await provider.lookupAddress(address);
    if (
      name &&
      (name.endsWith('.agent.agi.eth') || name.endsWith('.club.agi.eth')) &&
      name.split('.').length > 3
    ) {
      return null;
    }
  } catch (err) {
    // ignore lookup errors and fall through to warning
  }
  const warning =
    'No valid *.agent.agi.eth or *.club.agi.eth subdomain detected for this address. See docs/ens-identity-setup.md';
  console.warn(warning);
  return warning;
}

// verify on-chain token decimals against config to prevent misformatted broadcasts
async function verifyTokenDecimals() {
  try {
    const token = new ethers.Contract(
      AGIALPHA_ADDRESS,
      ['function decimals() view returns (uint8)'],
      provider
    );
    const chainDecimals = await token.decimals();
    if (Number(chainDecimals) !== Number(TOKEN_DECIMALS)) {
      throw new Error(
        `AGIALPHA decimals mismatch: config ${TOKEN_DECIMALS} vs chain ${chainDecimals}`
      );
    }
  } catch (err) {
    throw new Error(`Unable to verify AGIALPHA token decimals: ${err.message}`);
  }
}

const walletManager = new WalletManager(WALLET_KEYS, provider);
let automationWallet;
if (BOT_WALLET) {
  automationWallet = walletManager.get(BOT_WALLET);
} else {
  const [first] = walletManager.list();
  if (first) automationWallet = walletManager.get(first);
}

// Minimal ABI for JobRegistry interactions
const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee)',
  'event JobSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI)',
  'function applyForJob(uint256 jobId, string subdomain, bytes proof) external',
  'function submit(uint256 jobId, bytes32 resultHash, string resultURI, string subdomain, bytes proof) external',
  'function cancelExpiredJob(uint256 jobId) external',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint32 feePct,uint8 state,bool success,uint8 agentTypes,uint64 deadline,uint64 assignedAt,bytes32 uriHash,bytes32 resultHash)',
  'function expirationGracePeriod() view returns (uint256)',
];

// Minimal ABI for ValidationModule interactions
const VALIDATION_MODULE_ABI = [
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)',
  'function revealValidation(uint256 jobId, bool approve, bytes32 salt, string subdomain, bytes32[] proof)',
  'function finalize(uint256 jobId) external returns (bool)',
  'function rounds(uint256 jobId) view returns (address[] validators,address[] participants,uint256 commitDeadline,uint256 revealDeadline,uint256 approvals,uint256 rejections,bool tallied,uint256 committeeSize)',
  'event ValidatorsSelected(uint256 indexed jobId, address[] validators)',
];

const registry = new ethers.Contract(
  JOB_REGISTRY_ADDRESS,
  JOB_REGISTRY_ABI,
  provider
);
const validation = VALIDATION_MODULE_ADDRESS
  ? new ethers.Contract(
      VALIDATION_MODULE_ADDRESS,
      VALIDATION_MODULE_ABI,
      provider
    )
  : null;

// In-memory stores
const jobs = new Map();
const agents = new Map(); // id -> { url, wallet, ws }
const commits = new Map(); // jobId -> { address -> {approve, salt} }
const pendingJobs = new Map(); // id -> [job]
const finalizeTimers = new Map();
const expiryTimers = new Map();

function queueJob(id, job) {
  if (!pendingJobs.has(id)) pendingJobs.set(id, []);
  pendingJobs.get(id).push(job);
}

async function scheduleExpiration(jobId) {
  if (!automationWallet) return;
  try {
    const job = await registry.jobs(jobId);
    const grace = await registry.expirationGracePeriod();
    const deadline = Number(job.deadline) + Number(grace);
    const delay = deadline - Math.floor(Date.now() / 1000);
    if (delay <= 0) {
      expireJob(jobId);
    } else {
      if (expiryTimers.has(jobId)) clearTimeout(expiryTimers.get(jobId));
      expiryTimers.set(
        jobId,
        setTimeout(() => expireJob(jobId), delay * 1000)
      );
    }
  } catch (err) {
    console.error('scheduleExpiration error', err);
  }
}

async function expireJob(jobId) {
  if (!automationWallet) return;
  try {
    const tx = await registry.connect(automationWallet).cancelExpiredJob(jobId);
    await tx.wait();
    console.log('cancelExpired', jobId.toString(), tx.hash);
  } catch (err) {
    console.error('cancelExpired error', err);
  }
}

async function scheduleFinalize(jobId) {
  if (!validation || !automationWallet) return;
  try {
    const round = await validation.rounds(jobId);
    const revealDeadline = Number(round[3] || round.revealDeadline);
    const delay = revealDeadline - Math.floor(Date.now() / 1000);
    if (delay <= 0) {
      finalizeJob(jobId);
    } else {
      if (finalizeTimers.has(jobId)) clearTimeout(finalizeTimers.get(jobId));
      finalizeTimers.set(
        jobId,
        setTimeout(() => finalizeJob(jobId), delay * 1000)
      );
    }
  } catch (err) {
    console.error('scheduleFinalize error', err);
  }
}

async function finalizeJob(jobId) {
  if (!validation || !automationWallet) return;
  try {
    const tx = await validation.connect(automationWallet).finalize(jobId);
    await tx.wait();
    console.log('validationFinalized', jobId.toString(), tx.hash);
  } catch (err) {
    console.error('finalize error', err);
  }
}

// Listen for JobCreated events
registry.on('JobCreated', (jobId, employer, agentAddr, reward, stake, fee) => {
  const job = {
    jobId: jobId.toString(),
    employer,
    agent: agentAddr,
    // include raw values alongside formatted token strings
    rewardRaw: reward.toString(),
    reward: ethers.formatUnits(reward, TOKEN_DECIMALS),
    stakeRaw: stake.toString(),
    stake: ethers.formatUnits(stake, TOKEN_DECIMALS),
    feeRaw: fee.toString(),
    fee: ethers.formatUnits(fee, TOKEN_DECIMALS),
  };
  jobs.set(job.jobId, job);
  broadcast({ type: 'JobCreated', job });
  dispatch(job);
  console.log('JobCreated', job);
  scheduleExpiration(job.jobId);
});

registry.on('JobSubmitted', (jobId, worker, resultHash, resultURI) => {
  const id = jobId.toString();
  broadcast({ type: 'JobSubmitted', jobId: id, worker, resultHash, resultURI });
  scheduleFinalize(id);
  console.log('JobSubmitted', id);
});

if (validation) {
  validation.on('ValidatorsSelected', (jobId, validators) => {
    const id = jobId.toString();
    broadcast({ type: 'ValidationStarted', jobId: id, validators });
    scheduleFinalize(id);
    console.log('ValidationStarted', id);
  });
}

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
  res.json(
    Array.from(agents.entries()).map(([id, a]) => ({
      id,
      url: a.url,
      wallet: a.wallet,
    }))
  );
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
    const warning = await checkEnsSubdomain(wallet.address);
    const tx = await registry
      .connect(wallet)
      .applyForJob(req.params.id, '', '0x');
    await tx.wait();
    res.json(warning ? { tx: tx.hash, warning } : { tx: tx.hash });
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
    const warning = await checkEnsSubdomain(wallet.address);
    const hash = ethers.id(result || '');
    const tx = await registry
      .connect(wallet)
      .submit(req.params.id, hash, result || '', '', '0x');
    await tx.wait();
    res.json(warning ? { tx: tx.hash, warning } : { tx: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helpers for commit/reveal workflow
async function commitHelper(jobId, wallet, approve) {
  if (!validation) throw new Error('validation module not configured');
  const warning = await checkEnsSubdomain(wallet.address);
  const nonce = await validation.jobNonce(jobId);
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32'],
    [BigInt(jobId), nonce, approve, salt]
  );
  const tx = await validation
    .connect(wallet)
    .commitValidation(jobId, commitHash, '', []);
  await tx.wait();
  if (!commits.has(jobId)) commits.set(jobId, {});
  const jobCommits = commits.get(jobId);
  jobCommits[wallet.address.toLowerCase()] = { approve, salt };
  return warning ? { tx: tx.hash, salt, warning } : { tx: tx.hash, salt };
}

async function revealHelper(jobId, wallet) {
  if (!validation) throw new Error('validation module not configured');
  const jobCommits = commits.get(jobId) || {};
  const data = jobCommits[wallet.address.toLowerCase()];
  if (!data) throw new Error('no commit found');
  const warning = await checkEnsSubdomain(wallet.address);
  const tx = await validation
    .connect(wallet)
    .revealValidation(jobId, data.approve, data.salt, '', []);
  await tx.wait();
  delete jobCommits[wallet.address.toLowerCase()];
  return warning ? { tx: tx.hash, warning } : { tx: tx.hash };
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
let server;
let wss;

verifyTokenDecimals()
  .then(() => {
    server = http.createServer(app);
    wss = new WebSocketServer({ server });

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

    server.listen(PORT, () => {
      console.log(`Agent gateway listening on port ${PORT}`);
      console.log('Wallets:', walletManager.list());
    });
  })
  .catch((err) => {
    console.error('AGIALPHA decimals verification failed', err);
    process.exit(1);
  });

function broadcast(payload) {
  if (!wss) return;
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
        body: JSON.stringify(job),
      }).catch((err) => console.error('dispatch error', err));
    }
  });
}

module.exports = { app, commitHelper, revealHelper };
Object.defineProperty(module.exports, 'server', {
  enumerable: true,
  get: () => server,
});
