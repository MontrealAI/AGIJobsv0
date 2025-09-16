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
  provider,
} from './utils';
import { postJob, listPostedJobs } from './employer';
import { getRetrainingQueue, getSpawnRequests } from './learning';
import { getSpawnPipelineReport, createSpawnBlueprint } from './agentFactory';
import { quarantineReport, releaseAgent } from './security';
import { telemetryQueueLength } from './telemetry';
import { listValidatorAssignments } from './validator';
import {
  getEfficiencyIndex,
  getAgentEfficiency,
  findCategoryBreakdown,
} from '../shared/efficiencyMetrics';

const app = express();
app.use(express.json());

let nonce = ethers.hexlify(ethers.randomBytes(16));
function rotateNonce() {
  nonce = ethers.hexlify(ethers.randomBytes(16));
}

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
        .verifyMessage(AUTH_MESSAGE + nonce, signature)
        .toLowerCase();
      if (recovered === address.toLowerCase()) {
        rotateNonce();
        return next();
      }
    } catch {
      // fall through to unauthorized
    }
  }

  res.status(401).json({ error: 'unauthorized' });
}

// Basic health check for service monitoring
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'ok' });
});

app.get('/nonce', (req: express.Request, res: express.Response) => {
  res.json({ nonce });
});

// Register an agent to receive job dispatches
app.post('/agents', (req: express.Request, res: express.Response) => {
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

app.get('/agents', (req: express.Request, res: express.Response) => {
  res.json(
    Array.from(agents.entries()).map(([id, a]) => ({
      id,
      url: a.url,
      wallet: a.wallet,
    }))
  );
});

// REST endpoint to list jobs
app.get('/jobs', (req: express.Request, res: express.Response) => {
  res.json(Array.from(jobs.values()));
});

app.get('/telemetry', (req: express.Request, res: express.Response) => {
  res.json({ pending: telemetryQueueLength() });
});

app.get(
  '/spawn/candidates',
  async (req: express.Request, res: express.Response) => {
    try {
      const report = await getSpawnPipelineReport();
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/spawn/blueprints',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const { category, minPriority, dryRun, persist, markConsumed } =
      (req.body as {
        category?: string;
        minPriority?: number;
        dryRun?: boolean;
        persist?: boolean;
        markConsumed?: boolean;
      }) || {};
    try {
      const blueprint = await createSpawnBlueprint({
        category,
        minPriority,
        dryRun,
        persist,
        markConsumed,
      });
      if (!blueprint) {
        res
          .status(404)
          .json({ error: 'no spawn candidates satisfied the constraints' });
        return;
      }
      res.json(blueprint);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/validator/assignments',
  (req: express.Request, res: express.Response) => {
    res.json(listValidatorAssignments());
  }
);

app.get('/efficiency', async (req: express.Request, res: express.Response) => {
  try {
    const index = await getEfficiencyIndex();
    res.json(Array.from(index.values()));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(
  '/efficiency/:agent',
  async (req: express.Request, res: express.Response) => {
    try {
      let key = req.params.agent;
      if (key.endsWith('.eth')) {
        try {
          const resolved = await provider.resolveName(key);
          if (resolved) {
            key = resolved;
          }
        } catch (err) {
          console.warn('ENS resolve failed for efficiency lookup', err);
        }
      }
      const report = await getAgentEfficiency(key);
      if (!report) {
        res.status(404).json({ error: 'agent not found' });
        return;
      }
      const category = req.query.category as string | undefined;
      if (category) {
        const breakdown = findCategoryBreakdown(report, category);
        if (!breakdown) {
          res.status(404).json({ error: 'category not found' });
          return;
        }
        res.json({ agent: report.agent, category: breakdown });
        return;
      }
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Apply for a job with a managed wallet
app.post(
  '/jobs/:id/apply',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const { address } = req.body as { address: string };
    const wallet = walletManager.get(address);
    if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
    try {
      await checkEnsSubdomain(wallet.address);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
    try {
      const tx = await (registry as any)
        .connect(wallet)
        .applyForJob(req.params.id, '', '0x');
      await tx.wait();
      res.json({ tx: tx.hash });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Submit job result
app.post(
  '/jobs/:id/submit',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const { address, result } = req.body as { address: string; result: string };
    const wallet = walletManager.get(address);
    if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
    try {
      await checkEnsSubdomain(wallet.address);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
    try {
      const hash = ethers.id(result || '');
      const tx = await (registry as any)
        .connect(wallet)
        .submit(req.params.id, hash, result || '', '', '0x');
      await tx.wait();
      res.json({ tx: tx.hash });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/employer/jobs',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    try {
      const record = await postJob(req.body);
      res.json(record);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/employer/jobs',
  async (req: express.Request, res: express.Response) => {
    res.json(await listPostedJobs());
  }
);

app.get(
  '/learning/retraining',
  async (req: express.Request, res: express.Response) => {
    res.json(await getRetrainingQueue());
  }
);

app.get(
  '/learning/spawn',
  async (req: express.Request, res: express.Response) => {
    res.json(await getSpawnRequests());
  }
);

app.get(
  '/security/quarantine',
  (req: express.Request, res: express.Response) => {
    res.json(quarantineReport());
  }
);

app.post(
  '/security/quarantine/release',
  authMiddleware,
  (req: express.Request, res: express.Response) => {
    const { address } = req.body as { address: string };
    if (!address) {
      return res.status(400).json({ error: 'address required' });
    }
    releaseAgent(address);
    res.json({ address });
  }
);

// Commit validation decision
app.post(
  '/jobs/:id/commit',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
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
  }
);

// Reveal validation decision
app.post(
  '/jobs/:id/reveal',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const { address } = req.body as { address: string };
    const wallet = walletManager.get(address);
    if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
    try {
      const result = await revealHelper(req.params.id, wallet);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default app;
