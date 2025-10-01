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
  TOKEN_DECIMALS,
} from './utils';
import { postJob, listPostedJobs } from './employer';
import { getRetrainingQueue, getSpawnRequests } from './learning';
import { getSpawnPipelineReport, createSpawnBlueprint } from './agentFactory';
import { quarantineReport, releaseAgent } from './security';
import {
  telemetryQueueLength,
  getEnergyAnomalyReport,
  getEnergyAnomalyParameters,
  getPrometheusRegistry,
  publishEnergySample,
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
import { buildPerformanceDashboard } from './performanceDashboard';
import { evaluateSystemHealth } from './systemHealth';
import {
  recordDeliverable,
  listDeliverables,
  recordHeartbeat,
  listHeartbeats,
  recordTelemetryReport,
  listTelemetryReports,
  getDeliverableById,
  getHeartbeatById,
  getTelemetryReportById,
  loadStoredPayload,
  type DeliverableContributor,
  listContributorSummaries,
  type ContributorQueryOptions,
} from './deliverableStore';
import {
  ensureStake,
  getStakeBalance,
  getMinStake,
  requestStakeWithdrawal,
  finalizeStakeWithdrawal,
  withdrawStakeAmount,
  autoClaimRewards,
  ROLE_AGENT,
  ROLE_VALIDATOR,
  ROLE_PLATFORM,
  acknowledgeTaxPolicy as ensureTaxAcknowledgement,
} from './stakeCoordinator';
import {
  parseBooleanFlag,
  parsePositiveInteger,
  pickQueryValue,
  parseFloatParam,
  parseTokenAmount,
  formatTokenAmount,
  resolveAgentAddress,
  parseRoleInput,
  normaliseMetadata,
  parseContributors,
} from './apiHelpers';
import { getRewardPayouts } from './events';
import { submitDeliverable } from './agentActions';
import { serialiseChainJob } from './jobSerialization';

const app = express();
app.use(express.json());

app.get('/metrics', async (_req, res) => {
  try {
    const registry = getPrometheusRegistry();
    res.set('Content-Type', registry.contentType);
    const metrics = await registry.metrics();
    res.send(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

let nonce = ethers.hexlify(ethers.randomBytes(16));
function rotateNonce() {
  nonce = ethers.hexlify(ethers.randomBytes(16));
}

app.get('/auth/challenge', (_req, res) => {
  res.json({
    nonce,
    message: AUTH_MESSAGE,
    challenge: `${AUTH_MESSAGE}${nonce}`,
  });
});

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
      // Agents sign the static AUTH_MESSAGE concatenated with the most recent
      // nonce retrieved from /auth/challenge. The nonce is only rotated after a
      // signature has been verified to ensure concurrent requests cannot render
      // an in-flight challenge invalid.
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

  res.status(401).json({
    error: 'unauthorized',
    nonce,
    message: AUTH_MESSAGE,
    challenge: `${AUTH_MESSAGE}${nonce}`,
  });
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
class GatewayError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

const TRUE_STRINGS = new Set(['true', '1', 'yes', 'y', 'on', 'enabled']);

const FALSE_STRINGS = new Set(['false', '0', 'no', 'n', 'off', 'disabled']);

function normaliseAddressInput(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GatewayError(400, `${field} is required`);
  }
  try {
    return ethers.getAddress(value.trim());
  } catch {
    throw new GatewayError(400, `${field} must be a valid address`);
  }
}

function requireWalletManagerInstance() {
  if (!walletManager) {
    throw new GatewayError(503, 'wallet manager is not initialised');
  }
  return walletManager;
}

function parseBooleanBody(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (TRUE_STRINGS.has(normalised)) {
      return true;
    }
    if (FALSE_STRINGS.has(normalised)) {
      return false;
    }
  }
  throw new GatewayError(400, `${field} must be a boolean value`);
}

function parseOptionalBooleanBody(
  value: unknown,
  field: string
): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    throw new GatewayError(400, `${field} must be a boolean value`);
  }
  return parseBooleanBody(value, field);
}

function handleGatewayError(
  res: express.Response,
  err: unknown,
  fallbackStatus = 500
): void {
  if (err instanceof GatewayError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message =
    err instanceof Error ? err.message : 'unexpected gateway error';
  if (/invalid|missing|malformed|no valid/i.test(message)) {
    res.status(400).json({ error: message });
    return;
  }
  if (/not configured|no automation wallet|wallet manager/i.test(message)) {
    res.status(503).json({ error: message });
    return;
  }
  res.status(fallbackStatus).json({ error: message });
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

// Health check for orchestrator subsystems
app.get('/health', (req: express.Request, res: express.Response) => {
  const report = evaluateSystemHealth();
  res.json(report);
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

app.get(
  '/agents/:agent/jobs',
  async (req: express.Request, res: express.Response) => {
    const address = await resolveAgentAddress(req.params.agent);
    if (!address) {
      res.status(400).json({ error: 'invalid-agent' });
      return;
    }
    const role = parseRoleInput(req.query.role);
    const deliverableLimit = parsePositiveInteger(req.query.deliverables);
    const heartbeatLimit = parsePositiveInteger(req.query.heartbeats);
    const telemetryLimit = parsePositiveInteger(req.query.telemetry);
    let stakeBalance: bigint | undefined;
    let minStake: bigint | undefined;
    try {
      stakeBalance = await getStakeBalance(address, role);
    } catch (err) {
      console.warn('stake balance lookup failed', address, err);
    }
    try {
      minStake = await getMinStake();
    } catch (err) {
      console.warn('min stake lookup failed', err);
    }
    const assignedJobs = Array.from(jobs.values()).filter(
      (job) => job.agent && job.agent.toLowerCase() === address.toLowerCase()
    );
    const pending =
      pendingJobs.get(address) || pendingJobs.get(address.toLowerCase()) || [];
    res.json({
      agent: address,
      role,
      stakeBalanceRaw: stakeBalance?.toString() ?? null,
      stakeBalanceFormatted:
        stakeBalance !== undefined ? formatTokenAmount(stakeBalance) : null,
      minStakeRaw: minStake?.toString() ?? null,
      minStakeFormatted:
        minStake !== undefined ? formatTokenAmount(minStake) : null,
      assignedJobs,
      pendingJobs: pending,
      deliverables: listDeliverables({
        agent: address,
        limit: deliverableLimit,
      }),
      heartbeats: listHeartbeats({
        agent: address,
        limit: heartbeatLimit,
      }),
      telemetry: listTelemetryReports({
        agent: address,
        limit: telemetryLimit,
      }),
    });
  }
);

app.get(
  '/agents/:agent/stake',
  async (req: express.Request, res: express.Response) => {
    const address = await resolveAgentAddress(req.params.agent);
    if (!address) {
      res.status(400).json({ error: 'invalid-agent' });
      return;
    }
    const role = parseRoleInput(req.query.role);
    try {
      const [balance, minStake] = await Promise.all([
        getStakeBalance(address, role),
        getMinStake(),
      ]);
      res.json({
        agent: address,
        role,
        stakeBalanceRaw: balance.toString(),
        stakeBalanceFormatted: formatTokenAmount(balance),
        minStakeRaw: minStake.toString(),
        minStakeFormatted: formatTokenAmount(minStake),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  }
);

app.post(
  '/agents/:agent/stake/ensure',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const address = await resolveAgentAddress(req.params.agent);
    if (!address) {
      res.status(400).json({ error: 'invalid-agent' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const role = parseRoleInput(body?.role ?? req.query.role);
    const requiredStake = parseTokenAmount(
      (body?.requiredStake ?? body?.targetStake) as unknown
    );
    const amount = parseTokenAmount(body?.amount);
    if (requiredStake === undefined && amount === undefined) {
      res
        .status(400)
        .json({ error: 'requiredStake or amount must be provided' });
      return;
    }
    try {
      if (requiredStake !== undefined) {
        await ensureStake(wallet, requiredStake, role);
      } else if (amount !== undefined) {
        const current = await getStakeBalance(wallet.address, role);
        await ensureStake(wallet, current + amount, role);
      }
      const balance = await getStakeBalance(wallet.address, role);
      res.json({
        agent: wallet.address,
        role,
        stakeBalanceRaw: balance.toString(),
        stakeBalanceFormatted: formatTokenAmount(balance),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  }
);

app.post(
  '/agents/:agent/stake/request-withdraw',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const address = await resolveAgentAddress(req.params.agent);
    if (!address) {
      res.status(400).json({ error: 'invalid-agent' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const amount = parseTokenAmount(body?.amount);
    if (amount === undefined || amount <= 0n) {
      res.status(400).json({ error: 'amount must be greater than zero' });
      return;
    }
    const role = parseRoleInput(body?.role ?? req.query.role);
    try {
      const receipt = await requestStakeWithdrawal(wallet, amount, role);
      res.json({
        agent: wallet.address,
        role,
        method: receipt.method,
        tx: receipt.txHash,
        amountRaw: amount.toString(),
        amountFormatted: formatTokenAmount(amount),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  }
);

app.post(
  '/agents/:agent/stake/finalize-withdraw',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const address = await resolveAgentAddress(req.params.agent);
    if (!address) {
      res.status(400).json({ error: 'invalid-agent' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    const role = parseRoleInput(req.body?.role ?? req.query.role);
    try {
      const receipt = await finalizeStakeWithdrawal(wallet, role);
      res.json({
        agent: wallet.address,
        role,
        method: receipt.method,
        tx: receipt.txHash,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  }
);

app.post(
  '/agents/:agent/stake/withdraw',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const address = await resolveAgentAddress(req.params.agent);
    if (!address) {
      res.status(400).json({ error: 'invalid-agent' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const amount = parseTokenAmount(body?.amount);
    if (amount === undefined || amount <= 0n) {
      res.status(400).json({ error: 'amount must be greater than zero' });
      return;
    }
    const role = parseRoleInput(body?.role ?? req.query.role);
    try {
      const receipt = await withdrawStakeAmount(wallet, amount, role, {
        acknowledge: body?.acknowledge !== false,
      });
      res.json({
        agent: wallet.address,
        role,
        method: receipt.method,
        tx: receipt.txHash,
        amountRaw: amount.toString(),
        amountFormatted: formatTokenAmount(amount),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  }
);

app.post(
  '/agents/:agent/rewards/claim',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const address = await resolveAgentAddress(req.params.agent);
    if (!address) {
      res.status(400).json({ error: 'invalid-agent' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const role = parseRoleInput(body?.role ?? req.query.role);
    const amount = parseTokenAmount(body?.amount);
    const restakeAmount = parseTokenAmount(body?.restakeAmount);
    const restakePercent = body?.restakePercent ?? body?.restakePercentage;
    const destination =
      typeof body?.destination === 'string' ? body?.destination : undefined;
    try {
      const result = await autoClaimRewards(wallet, {
        amount: amount,
        restakeAmount,
        restakePercent:
          typeof restakePercent === 'number' || typeof restakePercent === 'string'
            ? restakePercent
            : undefined,
        destination,
        role,
        withdrawStake: parseBooleanFlag(body?.withdrawStake),
        acknowledge: body?.acknowledge !== false,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  }
);

// REST endpoint to list jobs
app.get('/jobs', (req: express.Request, res: express.Response) => {
  res.json(Array.from(jobs.values()));
});

app.get('/jobs/:id', async (req: express.Request, res: express.Response) => {
  const jobId = req.params.id;
  const deliverableLimit = parsePositiveInteger(req.query.deliverables);
  const heartbeatLimit = parsePositiveInteger(req.query.heartbeats);
  const telemetryLimit = parsePositiveInteger(req.query.telemetry);
  const includeContributorsParam =
    req.query.includeContributors ??
    (req.query as Record<string, unknown>).include_contributors ??
    req.query.contributors;
  const includeContributors =
    includeContributorsParam === undefined
      ? true
      : parseBooleanFlag(includeContributorsParam);
  const includePrimaryParam =
    req.query.includePrimary ??
    req.query.includeLead ??
    req.query.primary ??
    (req.query as Record<string, unknown>).contributorsIncludePrimary;
  const includePrimary =
    includePrimaryParam === undefined
      ? true
      : parseBooleanFlag(includePrimaryParam);
  let chainJob: Record<string, unknown> | null = null;
  try {
    const onChain = await registry.jobs(jobId);
    chainJob = serialiseChainJob(onChain);
  } catch (err) {
    console.warn('Failed to load job from registry', jobId, err);
  }
  const contributorSummaries = includeContributors
    ? listContributorSummaries({ jobId, includePrimary })
    : [];
  res.json({
    jobId,
    job: jobs.get(jobId) || null,
    chain: chainJob,
    deliverables: listDeliverables({ jobId, limit: deliverableLimit }),
    heartbeats: listHeartbeats({ jobId, limit: heartbeatLimit }),
    telemetry: listTelemetryReports({ jobId, limit: telemetryLimit }),
    payouts: getRewardPayouts(jobId),
    contributors: includeContributors ? contributorSummaries : undefined,
    contributorCount: includeContributors ? contributorSummaries.length : undefined,
  });
});

app.get(
  '/jobs/:id/deliverables',
  (req: express.Request, res: express.Response) => {
    const limit = parsePositiveInteger(req.query.limit);
    const agentFilter = pickQueryValue(req.query.agent);
    const records = listDeliverables({
      jobId: req.params.id,
      agent: agentFilter,
      limit,
    });
    res.json(records);
  }
);

app.get(
  '/jobs/:id/heartbeats',
  (req: express.Request, res: express.Response) => {
    const limit = parsePositiveInteger(req.query.limit);
    const agentFilter = pickQueryValue(req.query.agent);
    res.json(
      listHeartbeats({ jobId: req.params.id, agent: agentFilter, limit })
    );
  }
);

app.get(
  '/jobs/:id/telemetry',
  (req: express.Request, res: express.Response) => {
    const limit = parsePositiveInteger(req.query.limit);
    const agentFilter = pickQueryValue(req.query.agent);
    res.json(
      listTelemetryReports({ jobId: req.params.id, agent: agentFilter, limit })
    );
  }
);

app.get(
  '/deliverables/:id',
  (req: express.Request, res: express.Response) => {
    const record = getDeliverableById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    const includeTelemetry = parseBooleanFlag(
      req.query.includeTelemetry ?? req.query.includePayload
    );
    const response: Record<string, unknown> = { ...record };
    if (includeTelemetry) {
      response.telemetryPayload = loadStoredPayload(record.telemetry);
    }
    res.json(response);
  }
);

app.get(
  '/heartbeats/:id',
  (req: express.Request, res: express.Response) => {
    const record = getHeartbeatById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    const includeTelemetry = parseBooleanFlag(
      req.query.includeTelemetry ?? req.query.includePayload
    );
    const response: Record<string, unknown> = { ...record };
    if (includeTelemetry) {
      response.telemetryPayload = loadStoredPayload(record.telemetry);
    }
    res.json(response);
  }
);

app.get(
  '/telemetry/reports/:id',
  (req: express.Request, res: express.Response) => {
    const record = getTelemetryReportById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    const includePayload = parseBooleanFlag(
      req.query.includePayload ?? req.query.include ?? req.query.payload
    );
    const response: Record<string, unknown> = { ...record };
    if (includePayload) {
      response.payloadContents = loadStoredPayload(record.payload);
    }
    res.json(response);
  }
);

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
  '/dashboard/performance',
  async (req: express.Request, res: express.Response) => {
    try {
      const limit = parsePositiveInteger(req.query.limit);
      const includeAnomaliesParam = req.query.includeAnomalies;
      const includeAnomalies =
        includeAnomaliesParam === undefined
          ? true
          : parseBooleanFlag(includeAnomaliesParam);

      const includeOpportunityHistory = parseBooleanFlag(
        req.query.includeOpportunityHistory ?? req.query.includeOpportunities
      );
      const includeBacktest =
        includeOpportunityHistory &&
        parseBooleanFlag(req.query.includeBacktest);
      const includeSpawnPipeline = parseBooleanFlag(
        req.query.includeSpawnPipeline ?? req.query.includeSpawn
      );
      const includeEfficiencyStats =
        req.query.includeEfficiencyStats === undefined
          ? true
          : parseBooleanFlag(req.query.includeEfficiencyStats);

      const opportunityLimit = parsePositiveInteger(
        req.query.opportunityLimit ?? req.query.opportunitiesLimit
      );
      const backtestLimit = parsePositiveInteger(
        req.query.backtestLimit ?? req.query.historyLimit
      );

      const dashboard = await buildPerformanceDashboard({
        agentLimit: limit,
        includeAnomalies,
        includeOpportunityHistory,
        opportunityLimit,
        includeBacktest,
        backtestLimit,
        includeSpawnPipeline,
        includeEfficiencyStats,
      });

      res.json(dashboard);
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
      await ensureTaxAcknowledgement(wallet);
      const tx = await (registry as any)
        .connect(wallet)
        .submit(req.params.id, hash, result || '', '', '0x');
      await tx.wait();
      const deliverable = recordDeliverable({
        jobId: req.params.id,
        agent: wallet.address,
        success: true,
        resultUri: result || undefined,
        resultHash: hash,
        metadata: {
          source: 'legacy-submit-endpoint',
        },
        submissionMethod: 'submit',
        txHash: tx.hash,
      });
      res.json({ tx: tx.hash, deliverable });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/jobs/:id/deliverables',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const address = typeof body.address === 'string' ? body.address : '';
    if (!address) {
      res.status(400).json({ error: 'address is required' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    try {
      await checkEnsSubdomain(wallet.address);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
      return;
    }

    const jobId = req.params.id;
    const resultUri = typeof body.resultUri === 'string' ? body.resultUri : '';
    const resultCid = typeof body.resultCid === 'string' ? body.resultCid : '';
    const resultRef =
      typeof body.resultRef === 'string' && body.resultRef
        ? body.resultRef
        : resultCid || resultUri;
    let resultHash =
      typeof body.resultHash === 'string' && body.resultHash
        ? body.resultHash
        : resultRef
        ? ethers.id(resultRef)
        : ethers.ZeroHash;
    const proofBytes =
      typeof body.proofBytes === 'string' && body.proofBytes
        ? body.proofBytes
        : typeof body.proof === 'string' && body.proof
        ? body.proof
        : '0x';

    let contributors: DeliverableContributor[] | undefined;
    try {
      contributors = parseContributors(body.contributors);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
      return;
    }
    const signature =
      typeof body.signature === 'string' && body.signature
        ? body.signature
        : undefined;
    const signedPayload = (body as { signedPayload?: unknown }).signedPayload;
    const preferFinalize = body.finalize !== false && Boolean(resultRef);
    try {
      const submission = await submitDeliverable({
        jobId,
        wallet,
        resultUri,
        resultCid,
        resultRef,
        resultHash,
        proofBytes,
        proof: (body as { proof?: unknown }).proof,
        success: body.success !== false,
        finalize: body.finalize !== false,
        finalizeOnly: Boolean(body.finalizeOnly),
        preferFinalize,
        metadata: normaliseMetadata(body.metadata),
        telemetry: (body as { telemetry?: unknown }).telemetry,
        telemetryCid:
          typeof body.telemetryCid === 'string'
            ? body.telemetryCid
            : undefined,
        telemetryUri:
          typeof body.telemetryUri === 'string'
            ? body.telemetryUri
            : undefined,
        contributors,
        digest: typeof body.digest === 'string' ? body.digest : undefined,
        signature,
        signedPayload,
      });

      res.json({
        tx: submission.txHash,
        method: submission.submissionMethod,
        resultHash: submission.resultHash,
        deliverable: submission.deliverable,
      });
    } catch (err: any) {
      const message = err?.message || String(err);
      const status = message && message.includes('signature') ? 400 : 500;
      res.status(status).json({ error: message });
    }
  }
);

app.get(
  '/jobs/:id/contributors',
  (req: express.Request, res: express.Response) => {
    const includePrimaryParam =
      req.query.includePrimary ?? req.query.includeLead ?? req.query.primary;
    const includePrimary =
      includePrimaryParam === undefined
        ? true
        : parseBooleanFlag(includePrimaryParam);
    const leadFilter = pickQueryValue(req.query.agent);
    const options: ContributorQueryOptions = {
      jobId: req.params.id,
      includePrimary,
    };
    if (leadFilter) {
      options.agent = leadFilter;
    }
    let summaries = listContributorSummaries(options);
    const addressFilter = pickQueryValue(
      req.query.address ?? req.query.contributor
    );
    if (addressFilter) {
      let normalised: string | null = null;
      try {
        normalised = ethers.getAddress(addressFilter).toLowerCase();
      } catch {
        normalised = addressFilter.trim().toLowerCase();
      }
      summaries = summaries.filter((entry) => {
        if (!normalised) return true;
        return (
          entry.address.toLowerCase() === normalised ||
          entry.ensNames.some(
            (name) => name.toLowerCase() === normalised
          )
        );
      });
    }
    res.json(summaries);
  }
);

app.post(
  '/jobs/:id/heartbeat',
  authMiddleware,
  (req: express.Request, res: express.Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const address = typeof body.address === 'string' ? body.address : '';
    if (!address) {
      res.status(400).json({ error: 'address is required' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const record = recordHeartbeat({
      jobId: req.params.id,
      agent: wallet.address,
      status,
      note: typeof body.note === 'string' ? body.note : undefined,
      telemetry: (body as { telemetry?: unknown }).telemetry,
      telemetryCid:
        typeof body.telemetryCid === 'string' ? body.telemetryCid : undefined,
      telemetryUri:
        typeof body.telemetryUri === 'string' ? body.telemetryUri : undefined,
      metadata: normaliseMetadata(body.metadata),
    });
    res.json(record);
  }
);

app.post(
  '/jobs/:id/telemetry',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const address = typeof body.address === 'string' ? body.address : '';
    if (!address) {
      res.status(400).json({ error: 'address is required' });
      return;
    }
    const wallet = walletManager.get(address);
    if (!wallet) {
      res.status(400).json({ error: 'unknown wallet' });
      return;
    }
    const { address: _ignored, ...payload } = body;
    const canonicalPayload =
      (payload as { payload?: unknown }).payload ??
      (payload as { metrics?: unknown }).metrics ??
      (payload as { telemetry?: unknown }).telemetry ??
      payload;
    const record = recordTelemetryReport({
      jobId: req.params.id,
      agent: wallet.address,
      payload: canonicalPayload,
      cid:
        typeof body.cid === 'string'
          ? body.cid
          : typeof body.telemetryCid === 'string'
          ? body.telemetryCid
          : undefined,
      uri:
        typeof body.uri === 'string'
          ? body.uri
          : typeof body.telemetryUri === 'string'
          ? body.telemetryUri
          : undefined,
      signature:
        typeof body.signature === 'string' ? body.signature : undefined,
      proof: normaliseMetadata(body.proof),
      metadata: normaliseMetadata(body.metadata),
      spanId: typeof body.spanId === 'string' ? body.spanId : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
    });

    const samples: unknown[] = [];
    if (Array.isArray((body as { samples?: unknown }).samples)) {
      samples.push(...((body as { samples: unknown[] }).samples || []));
    }
    if (Array.isArray((body as { energySamples?: unknown }).energySamples)) {
      samples.push(...((body as { energySamples: unknown[] }).energySamples || []));
    }
    if ((body as { sample?: unknown }).sample) {
      samples.push((body as { sample: unknown }).sample);
    }
    if ((body as { energySample?: unknown }).energySample) {
      samples.push((body as { energySample: unknown }).energySample);
    }

    let published = 0;
    for (const sample of samples) {
      if (sample && typeof sample === 'object') {
        try {
          const enriched = {
            ...(sample as Record<string, unknown>),
            jobId: req.params.id,
            agent: wallet.address,
          };
          await publishEnergySample(enriched as any);
          published += 1;
        } catch (err) {
          console.warn('Failed to publish telemetry sample', err);
        }
      }
    }

    res.json({
      telemetry: record,
      energySamplesPublished: published,
    });
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
    try {
      const manager = requireWalletManagerInstance();
      const address = normaliseAddressInput(req.body?.address, 'address');
      const wallet = manager.get(address);
      if (!wallet) {
        throw new GatewayError(400, `unknown wallet: ${address}`);
      }
      const approve = parseBooleanBody(req.body?.approve, 'approve');
      const saltRaw =
        typeof req.body?.salt === 'string' ? req.body.salt.trim() : undefined;
      const salt = saltRaw && saltRaw.length > 0 ? saltRaw : undefined;
      const result = await commitHelper(req.params.id, wallet, approve, salt);
      res.json(result);
    } catch (err: any) {
      handleGatewayError(res, err);
    }
  }
);

// Reveal validation decision
app.post(
  '/jobs/:id/reveal',
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    try {
      const manager = requireWalletManagerInstance();
      const address = normaliseAddressInput(req.body?.address, 'address');
      const wallet = manager.get(address);
      if (!wallet) {
        throw new GatewayError(400, `unknown wallet: ${address}`);
      }
      const approve = parseOptionalBooleanBody(req.body?.approve, 'approve');
      const saltRaw =
        typeof req.body?.salt === 'string' ? req.body.salt.trim() : undefined;
      const salt = saltRaw && saltRaw.length > 0 ? saltRaw : undefined;
      const result = await revealHelper(req.params.id, wallet, approve, salt);
      res.json(result);
    } catch (err: any) {
      handleGatewayError(res, err);
    }
  }
);

export default app;
