import express from 'express';
import { ethers } from 'ethers';
import {
  walletManager,
  registry,
  checkEnsSubdomain,
  commitHelper,
  revealHelper,
  jobs,
  agents,
  pendingJobs,
  GATEWAY_API_KEY,
  AUTH_MESSAGE,
} from './utils';

const app = express();
app.use(express.json());

function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const apiKey = req.header('x-api-key');
  if (GATEWAY_API_KEY && apiKey === GATEWAY_API_KEY) return next();

  const signature = req.header('x-signature');
  const address = req.header('x-address');
  if (signature && address) {
    try {
      const recovered = ethers
        .verifyMessage(AUTH_MESSAGE, signature)
        .toLowerCase();
      if (recovered === address.toLowerCase()) return next();
    } catch {
      // fall through to unauthorized
    }
  }

  res.status(401).json({ error: 'unauthorized' });
}

// Basic health check for service monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Register an agent to receive job dispatches
app.post('/agents', (req, res) => {
  const { id, url, wallet } = req.body as {
    id: string;
    url?: string;
    wallet: string;
  };
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
app.post('/jobs/:id/apply', authMiddleware, async (req, res) => {
  const { address } = req.body as { address: string };
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const warning = await checkEnsSubdomain(wallet.address);
    const tx = await (registry as any)
      .connect(wallet)
      .applyForJob(req.params.id, '', '0x');
    await tx.wait();
    res.json(warning ? { tx: tx.hash, warning } : { tx: tx.hash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Submit job result
app.post('/jobs/:id/submit', authMiddleware, async (req, res) => {
  const { address, result } = req.body as { address: string; result: string };
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const warning = await checkEnsSubdomain(wallet.address);
    const hash = ethers.id(result || '');
    const tx = await (registry as any)
      .connect(wallet)
      .submit(req.params.id, hash, result || '', '', '0x');
    await tx.wait();
    res.json(warning ? { tx: tx.hash, warning } : { tx: tx.hash });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Commit validation decision
app.post('/jobs/:id/commit', authMiddleware, async (req, res) => {
  const { address, approve } = req.body as {
    address: string;
    approve: boolean;
  };
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const result = await commitHelper(req.params.id, wallet, approve);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Reveal validation decision
app.post('/jobs/:id/reveal', authMiddleware, async (req, res) => {
  const { address } = req.body as { address: string };
  const wallet = walletManager.get(address);
  if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
  try {
    const result = await revealHelper(req.params.id, wallet);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default app;
