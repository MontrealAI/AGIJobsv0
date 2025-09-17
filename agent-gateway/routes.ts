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
import {
  telemetryQueueLength,
  getEnergyAnomalyReport,
  getEnergyAnomalyParameters,
} from './telemetry';
import { listValidatorAssignments } from './validator';
import {
  getEfficiencyIndex,
  getAgentEfficiency,
  findCategoryBreakdown,
} from '../shared/efficiencyMetrics';
import {
  listAuditAnchors,
  triggerAuditAnchor,
  getAuditAnchoringState,
} from './auditAnchoring';
import {
  listJobPlans,
  getJobPlan as fetchJobPlan,
  createJobPlan,
  launchJobPlan,
} from './jobPlanner';
import {
  listOpportunityForecasts,
  getOpportunityForecast as fetchOpportunityForecast,
} from './opportunities';
import { buildOpportunityBacktest } from './opportunityBacktest';
import {
  getEnergyInsightsSnapshot,
  getAgentEnergyInsight,
  getJobEnergyInsight,
  type AgentEnergyInsight,
  type JobEnergyInsight,
} from '../shared/energyInsights';
import {
  getEnergyTrendsSnapshot,
  getAgentEnergyTrend,
  type AgentEnergyTrend,
} from '../shared/energyTrends';
import {
  buildThermodynamicSummary,
  type ThermodynamicSummarySortKey,
} from './thermodynamics';

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

function plannerErrorStatus(err: unknown): number {
  if (!err || typeof err !== 'object') {
    return 500;
  }
  const message = String((err as any).message || '');
  if (message.includes('no orchestrator wallet')) {
    return 503;
  }
  if (
    message.includes('plan ') ||
    message.includes('task ') ||
    message.includes('job plan') ||
    message.includes('identifier')
  ) {
    return 400;
  }
  return 500;
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalised);
  }
  return false;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function pickQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function parseFloatParam(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseThermodynamicSortKey(
  value: unknown
): ThermodynamicSummarySortKey | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return undefined;
  }
  const compact = normalised.replace(/[-_\s]+/g, '');
  switch (compact) {
    case 'score':
      return 'score';
    case 'energy':
    case 'avgenergy':
    case 'averageenergy':
      return 'energy';
    case 'rewarddensity':
    case 'rewardperenergy':
    case 'density':
    case 'thermodensity':
      return 'rewardDensity';
    case 'anomaly':
    case 'anomalyrate':
    case 'stability':
      return 'anomaly';
    case 'success':
    case 'successrate':
      return 'success';
    case 'efficiency':
      return 'efficiency';
    default:
      return undefined;
  }
}

type EnergyTrendSortKey =
  | 'momentum'
  | 'efficiency'
  | 'anomaly'
  | 'reward'
  | 'energy';

function parseEnergyTrendSortKey(
  value: unknown
): EnergyTrendSortKey | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return undefined;
  }
  const compact = normalised.replace(/[-_\s]+/g, '');
  switch (compact) {
    case 'momentum':
    case 'trend':
    case 'energytrend':
      return 'momentum';
    case 'efficiency':
    case 'efficiencymomentum':
      return 'efficiency';
    case 'anomaly':
    case 'anomalyrate':
    case 'stability':
      return 'anomaly';
    case 'reward':
    case 'value':
    case 'avgreward':
      return 'reward';
    case 'energy':
    case 'baselineenergy':
    case 'longenergy':
      return 'energy';
    default:
      return undefined;
  }
}

async function normaliseAgentIdentifier(
  identifier: string
): Promise<string | null> {
  if (!identifier) {
    return null;
  }
  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.endsWith('.eth')) {
    try {
      const resolved = await provider.resolveName(trimmed);
      if (resolved) {
        return resolved.toLowerCase();
      }
    } catch (err) {
      console.warn('ENS resolve failed for energy insight lookup', err);
    }
  }
  try {
    return ethers.getAddress(trimmed).toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function countTotalJobs(
  jobs: Record<string, Record<string, JobEnergyInsight>>
): number {
  let total = 0;
  for (const bucket of Object.values(jobs)) {
    total += Object.keys(bucket ?? {}).length;
  }
  return total;
}

function collectAgentJobs(
  agentId: string,
  jobs: Record<string, Record<string, JobEnergyInsight>>,
  limit?: number
): JobEnergyInsight[] {
  const key = agentId ? agentId.toLowerCase() : 'unknown';
  const bucket = jobs[key];
  if (!bucket) {
    return [];
  }
  const entries = Object.values(bucket);
  entries.sort((a, b) => {
    if (b.totalEnergy !== a.totalEnergy) {
      return b.totalEnergy - a.totalEnergy;
    }
    if (b.efficiencyScore !== a.efficiencyScore) {
      return b.efficiencyScore - a.efficiencyScore;
    }
    if (b.samples !== a.samples) {
      return b.samples - a.samples;
    }
    return b.averageEnergy - a.averageEnergy;
  });
  if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
    return entries.slice(0, limit);
  }
  return entries;
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
  '/telemetry/insights',
  (req: express.Request, res: express.Response) => {
    try {
      const snapshot = getEnergyInsightsSnapshot();
      const limit = parsePositiveInteger(req.query.limit);
      const includeJobs = parseBooleanFlag(req.query.includeJobs);
      const jobsPerAgent = includeJobs
        ? parsePositiveInteger(req.query.jobsPerAgent)
        : undefined;

      const agentsAll = Object.values(snapshot.agents);
      const totalAgents = agentsAll.length;
      const totalJobs = countTotalJobs(snapshot.jobs);
      const sortedAgents = [...agentsAll].sort((a, b) => {
        if (b.totalEnergy !== a.totalEnergy) {
          return b.totalEnergy - a.totalEnergy;
        }
        if (b.averageEfficiency !== a.averageEfficiency) {
          return b.averageEfficiency - a.averageEfficiency;
        }
        return b.jobCount - a.jobCount;
      });
      const selectedAgents =
        typeof limit === 'number' ? sortedAgents.slice(0, limit) : sortedAgents;

      const response: Record<string, unknown> = {
        updatedAt: snapshot.updatedAt,
        totalAgents,
        totalJobs,
        returnedAgents: selectedAgents.length,
        agents: selectedAgents,
      };

      let returnedJobs = 0;
      if (includeJobs) {
        const jobsByAgent: Record<string, JobEnergyInsight[]> = {};
        for (const agent of selectedAgents) {
          const jobs = collectAgentJobs(
            agent.agent,
            snapshot.jobs,
            jobsPerAgent
          );
          jobsByAgent[agent.agent] = jobs;
          returnedJobs += jobs.length;
        }
        response.jobs = jobsByAgent;
      } else {
        returnedJobs = selectedAgents.reduce((sum, agent) => {
          const key = agent.agent ? agent.agent.toLowerCase() : 'unknown';
          const bucket = snapshot.jobs[key];
          return sum + (bucket ? Object.keys(bucket).length : 0);
        }, 0);
      }
      response.returnedJobs = returnedJobs;

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/telemetry/insights/:agent',
  async (req: express.Request, res: express.Response) => {
    try {
      const agentKey = await normaliseAgentIdentifier(req.params.agent);
      if (!agentKey) {
        res.status(400).json({ error: 'invalid-agent' });
        return;
      }
      const snapshot = getEnergyInsightsSnapshot();
      const insight = getAgentEnergyInsight(agentKey, snapshot);
      if (!insight) {
        res.status(404).json({ error: 'agent-not-found' });
        return;
      }
      const includeJobs = parseBooleanFlag(req.query.includeJobs);
      const jobLimit = includeJobs
        ? parsePositiveInteger(req.query.jobLimit ?? req.query.jobsPerAgent)
        : undefined;

      const payload: Record<string, unknown> = {
        updatedAt: snapshot.updatedAt,
        agent: insight,
      };

      if (includeJobs) {
        const jobs = collectAgentJobs(agentKey, snapshot.jobs, jobLimit);
        payload.jobs = jobs;
        payload.jobCount = jobs.length;
      } else {
        const bucket = snapshot.jobs[agentKey.toLowerCase()];
        payload.jobCount = bucket ? Object.keys(bucket).length : 0;
      }

      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/telemetry/insights/:agent/jobs/:jobId',
  async (req: express.Request, res: express.Response) => {
    try {
      const agentKey = await normaliseAgentIdentifier(req.params.agent);
      if (!agentKey) {
        res.status(400).json({ error: 'invalid-agent' });
        return;
      }
      const snapshot = getEnergyInsightsSnapshot();
      const job = getJobEnergyInsight(agentKey, req.params.jobId, snapshot);
      if (!job) {
        res.status(404).json({ error: 'job-not-found' });
        return;
      }
      const agentInsight = getAgentEnergyInsight(agentKey, snapshot);
      const payload: Record<string, unknown> = {
        updatedAt: snapshot.updatedAt,
        job,
      };
      if (agentInsight) {
        payload.agent = agentInsight;
      } else {
        payload.agent = { agent: agentKey } as Partial<AgentEnergyInsight>;
      }
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/opportunities/backtest',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    try {
      const limit = parsePositiveInteger(pickQueryValue(req.query.limit));
      const minConfidence = parseFloatParam(
        pickQueryValue(req.query.minConfidence)
      );
      const maxAgeHours = parseFloatParam(
        pickQueryValue(req.query.maxAgeHours)
      );
      const successThreshold = parseFloatParam(
        pickQueryValue(req.query.successThreshold)
      );
      const includeFailedQuery = req.query.includeFailed;
      const includeFailed =
        includeFailedQuery === undefined
          ? undefined
          : parseBooleanFlag(includeFailedQuery);
      const since = pickQueryValue(req.query.since);

      const report = await buildOpportunityBacktest({
        limit,
        since,
        minConfidence,
        maxAgeHours,
        includeFailed,
        successThreshold,
      });
      res.json(report);
    } catch (err) {
      console.error('Failed to build opportunity backtest', err);
      res.status(500).json({ error: 'failed-to-build-backtest' });
    }
  }
);

app.get(
  '/opportunities',
  async (req: express.Request, res: express.Response) => {
    try {
      const limitParam = req.query.limit;
      let limit: number | undefined;
      if (typeof limitParam === 'string' && limitParam.trim().length > 0) {
        const parsed = Number.parseInt(limitParam, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          limit = parsed;
        }
      }
      const forecasts = await listOpportunityForecasts(limit);
      res.json({ forecasts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/opportunities/:jobId',
  async (req: express.Request, res: express.Response) => {
    try {
      const record = await fetchOpportunityForecast(req.params.jobId);
      if (!record) {
        res.status(404).json({ error: 'not-found' });
        return;
      }
      res.json(record);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/audit/anchors',
  async (req: express.Request, res: express.Response) => {
    try {
      const limitParam = req.query.limit;
      let limit: number | undefined;
      if (typeof limitParam === 'string' && limitParam.trim().length > 0) {
        const parsed = Number.parseInt(limitParam, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          limit = parsed;
        }
      }
      const anchors = await listAuditAnchors(limit);
      res.json({ anchors, state: getAuditAnchoringState() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/audit/anchors',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const { force, minNewEvents } =
      (req.body as { force?: boolean; minNewEvents?: number }) || {};
    try {
      const anchor = await triggerAuditAnchor({
        force: Boolean(force),
        minNewEvents:
          typeof minNewEvents === 'number' && Number.isFinite(minNewEvents)
            ? minNewEvents
            : undefined,
      });
      const state = getAuditAnchoringState();
      if (!anchor) {
        res.status(202).json({
          status: 'skipped',
          reason: state.lastSkipReason,
          state,
        });
        return;
      }
      res.json({ status: 'anchored', anchor, state });
    } catch (err: any) {
      res.status(500).json({
        error: err.message,
        state: getAuditAnchoringState(),
      });
    }
  }
);

app.get(
  '/telemetry/anomalies',
  async (req: express.Request, res: express.Response) => {
    try {
      let agentFilter = req.query.agent as string | undefined;
      if (agentFilter && agentFilter.endsWith('.eth')) {
        try {
          const resolved = await provider.resolveName(agentFilter);
          if (resolved) {
            agentFilter = resolved;
          }
        } catch (err) {
          console.warn('ENS resolve failed for anomaly lookup', err);
        }
      }
      const anomalies = getEnergyAnomalyReport(agentFilter);
      res.json({
        config: getEnergyAnomalyParameters(),
        anomalies,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/telemetry/energy-trends',
  async (req: express.Request, res: express.Response) => {
    try {
      const snapshot = getEnergyTrendsSnapshot();
      const agentFilter =
        typeof req.query.agent === 'string' ? req.query.agent : undefined;
      const sortKey =
        parseEnergyTrendSortKey(req.query.sort) ??
        parseEnergyTrendSortKey(req.query.orderBy) ??
        'momentum';
      const orderParam =
        (typeof req.query.order === 'string' &&
          req.query.order.toLowerCase()) ||
        (typeof req.query.sortOrder === 'string' &&
          req.query.sortOrder.toLowerCase()) ||
        undefined;
      const order: 'asc' | 'desc' = orderParam === 'asc' ? 'asc' : 'desc';
      const limit = parsePositiveInteger(req.query.limit);

      if (agentFilter) {
        const resolved = await normaliseAgentIdentifier(agentFilter);
        const trend =
          (resolved && getAgentEnergyTrend(resolved, snapshot)) ||
          getAgentEnergyTrend(agentFilter, snapshot);
        if (!trend) {
          res.status(404).json({ error: 'agent trend not found' });
          return;
        }
        res.json({
          updatedAt: snapshot.updatedAt,
          totals: snapshot.totals,
          agents: [trend],
        });
        return;
      }

      const trends: AgentEnergyTrend[] = Object.values(snapshot.agents);

      const sortValue = (trend: AgentEnergyTrend): number => {
        switch (sortKey) {
          case 'efficiency':
            return trend.efficiencyMomentum;
          case 'anomaly':
            return trend.anomalyRate;
          case 'reward':
            return trend.averageReward;
          case 'energy':
            return trend.longTermEnergy;
          case 'momentum':
          default:
            return trend.energyMomentumRatio;
        }
      };

      trends.sort((a, b) => {
        const diff = sortValue(a) - sortValue(b);
        if (diff === 0) {
          return b.sampleCount - a.sampleCount;
        }
        return order === 'asc' ? diff : -diff;
      });

      const limited = limit ? trends.slice(0, limit) : trends;

      res.json({
        updatedAt: snapshot.updatedAt,
        totals: snapshot.totals,
        agents: limited,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/thermodynamics/summary',
  async (req: express.Request, res: express.Response) => {
    try {
      const limit = parsePositiveInteger(req.query.limit);
      const includeAnomaliesParam = req.query.includeAnomalies;
      const includeAnomalies =
        includeAnomaliesParam === undefined
          ? true
          : parseBooleanFlag(includeAnomaliesParam);
      const refreshIdentities = parseBooleanFlag(req.query.refreshIdentities);

      const sortParam =
        (typeof req.query.sort === 'string' && req.query.sort) ||
        (typeof req.query.sortBy === 'string' && req.query.sortBy) ||
        (typeof req.query.orderBy === 'string' && req.query.orderBy) ||
        undefined;
      const sortKey = parseThermodynamicSortKey(sortParam);

      const orderParam =
        (typeof req.query.order === 'string' &&
          req.query.order.toLowerCase()) ||
        (typeof req.query.sortOrder === 'string' &&
          req.query.sortOrder.toLowerCase()) ||
        undefined;
      const order =
        orderParam === 'asc' || orderParam === 'desc'
          ? (orderParam as 'asc' | 'desc')
          : undefined;

      const summary = await buildThermodynamicSummary({
        limit,
        includeAnomalies,
        refreshIdentities,
        sortBy: sortKey,
        order,
      });

      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

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

app.get(
  '/employer/plans',
  async (req: express.Request, res: express.Response) => {
    try {
      const plans = await listJobPlans();
      res.json(plans);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  '/employer/plans/:planId',
  async (req: express.Request, res: express.Response) => {
    try {
      const plan = await fetchJobPlan(req.params.planId);
      if (!plan) {
        res.status(404).json({ error: 'plan not found' });
        return;
      }
      res.json(plan);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/employer/plans',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    try {
      const plan = await createJobPlan(req.body);
      res.json(plan);
    } catch (err: any) {
      const status = plannerErrorStatus(err);
      res.status(status).json({ error: err.message });
    }
  }
);

app.post(
  '/employer/plans/:planId/launch',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const { taskIds, maxTasks } =
      (req.body as { taskIds?: string[] | string; maxTasks?: number }) || {};
    let tasks: string[] | undefined;
    if (Array.isArray(taskIds)) {
      tasks = taskIds.map((value) => String(value).trim()).filter(Boolean);
    } else if (typeof taskIds === 'string' && taskIds.trim().length > 0) {
      tasks = taskIds
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }
    const max =
      typeof maxTasks === 'number' && Number.isFinite(maxTasks)
        ? Number(maxTasks)
        : undefined;
    try {
      const result = await launchJobPlan(req.params.planId, {
        taskIds: tasks,
        maxTasks: max,
      });
      res.json(result);
    } catch (err: any) {
      const status = plannerErrorStatus(err);
      res.status(status).json({ error: err.message });
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
    const { address, approve, salt } = req.body as {
      address: string;
      approve: boolean;
      salt?: string;
    };
    const wallet = walletManager.get(address);
    if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
    try {
      const result = await commitHelper(req.params.id, wallet, approve, salt);
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
    const { address, approve, salt } = req.body as {
      address: string;
      approve?: boolean;
      salt?: string;
    };
    const wallet = walletManager.get(address);
    if (!wallet) return res.status(400).json({ error: 'unknown wallet' });
    try {
      const result = await revealHelper(req.params.id, wallet, approve, salt);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default app;
