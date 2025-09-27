import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ethers,
  type Provider,
} from 'ethers';
import {
  PlannerClient,
  type PlannerMessage,
  type PlannerPlanResult,
} from '../../packages/onebox-orchestrator/src';
import type {
  IntentEnvelope,
  ConstraintForIntent,
} from '../../packages/onebox-orchestrator/src/ics/types';
import type {
  ExecuteResponse,
  JobAttachment,
  JobIntent,
  JobStatusCard,
  PlanResponse,
  StatusResponse,
} from '../../packages/onebox-sdk/src';
import { postJob, prepareJobArtifacts } from './employer';
import { finalizeJob } from './submission';
import { JOB_REGISTRY_ADDRESS, RPC_URL } from './config';
import {
  now,
  recordExecute,
  recordPlan,
  recordStatus,
  renderMetrics,
} from './oneboxMetrics';

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
  }
}

type LogLevel = 'info' | 'warn' | 'error';

function logEvent(level: LogLevel, event: string, fields: Record<string, unknown>): void {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const payload = JSON.stringify(entry);
  if (level === 'error') {
    console.error(payload);
  } else if (level === 'warn') {
    console.warn(payload);
  } else {
    console.log(payload);
  }
}

function getCorrelationId(req: express.Request): string {
  if (req.correlationId) return req.correlationId;
  const header = req.headers['x-correlation-id'] ?? req.headers['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  const correlationId = typeof value === 'string' && value.trim().length > 0 ? value.trim() : randomUUID();
  req.correlationId = correlationId;
  return correlationId;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unexpected error';
}

function statusFromError(error: unknown): number {
  if (error instanceof HttpError) return error.status;
  if (error && typeof (error as { status?: number }).status === 'number') {
    return (error as { status: number }).status;
  }
  return 500;
}

const STATUS_ABI = [
  'function nextJobId() view returns (uint256)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata)',
  'function createJob(uint256 reward,uint64 deadline,bytes32 specHash,string uri) returns (uint256)',
  'function createJobWithAgentTypes(uint256 reward,uint64 deadline,uint8 agentTypes,bytes32 specHash,string uri) returns (uint256)',
  'function finalize(uint256 jobId)',
];

const DEFAULT_STATUS_LIMIT = 5;
const DEFAULT_DEADLINE_DAYS = 7;

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface OneboxService {
  plan(text: string, expert?: boolean): Promise<PlanResponse>;
  execute(intent: JobIntent, mode: 'relayer' | 'wallet'): Promise<ExecuteResponse>;
  status(jobId?: number, limit?: number): Promise<StatusResponse>;
}

interface DefaultServiceOptions {
  planner?: PlannerClient;
  provider?: Provider;
  registryAddress?: string;
  relayerKey?: string;
  explorerBaseUrl?: string;
  tokenDecimals?: number;
  statusLimit?: number;
}

interface PlannerSummary {
  summary: string;
  warnings: string[];
}

export class DefaultOneboxService implements OneboxService {
  private readonly planner: PlannerClient;
  private readonly provider: Provider;
  private readonly registry: Contract;
  private readonly relayer?: Wallet;
  private readonly explorerBaseUrl?: string;
  private readonly tokenDecimals: number;
  private readonly defaultStatusLimit: number;

  constructor(options: DefaultServiceOptions = {}) {
    this.planner = options.planner ?? PlannerClient.fromEnv();
    this.provider = options.provider ?? new JsonRpcProvider(RPC_URL);
    const registryAddress = options.registryAddress ?? JOB_REGISTRY_ADDRESS;
    if (!registryAddress) {
      throw new Error('JOB_REGISTRY_ADDRESS must be configured for one-box service');
    }
    this.registry = new Contract(registryAddress, STATUS_ABI, this.provider);

    const relayerKey = options.relayerKey ?? process.env.ONEBOX_RELAYER_PRIVATE_KEY ?? '';
    if (relayerKey) {
      this.relayer = new Wallet(relayerKey, this.provider);
    }

    this.explorerBaseUrl = options.explorerBaseUrl ?? process.env.ONEBOX_EXPLORER_TX_BASE ?? undefined;
    this.tokenDecimals = options.tokenDecimals ?? Number(process.env.ONEBOX_TOKEN_DECIMALS ?? 18);
    this.defaultStatusLimit = options.statusLimit ?? Number(process.env.ONEBOX_STATUS_LIMIT ?? DEFAULT_STATUS_LIMIT);
  }

  async plan(text: string, expert = false): Promise<PlanResponse> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new HttpError(400, 'Provide a description of what you would like to do.');
    }

    const messages: PlannerMessage[] = [{ role: 'user', content: trimmed }];
    const result = await this.planner.plan(messages);

    if (!result.intent.ok) {
      throw new HttpError(
        400,
        result.message || result.intent.issues?.[0] || 'The planner could not understand the request.'
      );
    }

    const envelope = result.intent.data;
    const intent = plannerIntentToJobIntent(envelope, expert);
    const { summary, warnings } = buildPlannerSummary(envelope, intent, result);

    return {
      summary,
      intent,
      requiresConfirmation: envelope.payload.confirm ?? true,
      warnings,
    };
  }

  async execute(intent: JobIntent, mode: 'relayer' | 'wallet'): Promise<ExecuteResponse> {
    switch (intent.action) {
      case 'post_job':
        return this.executePostJob(intent, mode);
      case 'finalize_job':
        return this.executeFinalizeJob(intent, mode);
      case 'check_status':
        return {
          ok: true,
          jobId: intent.payload?.jobId ? Number(normaliseJobId(intent.payload.jobId)) : undefined,
        };
      default:
        throw new HttpError(400, `Intent ${intent.action} is not supported yet.`);
    }
  }

  async status(jobId?: number, limit?: number): Promise<StatusResponse> {
    const jobs: JobStatusCard[] = [];
    if (typeof jobId === 'number' && Number.isFinite(jobId) && jobId > 0) {
      const card = await this.fetchJobCard(BigInt(jobId));
      if (card) jobs.push(card);
      return { jobs };
    }

    const nextJobId = (await this.registry.nextJobId()) as bigint;
    if (nextJobId <= 0n) {
      return { jobs: [] };
    }

    const max = Number.isFinite(limit) && (limit ?? 0) > 0 ? Number(limit) : this.defaultStatusLimit;
    for (let index = 0; index < max; index += 1) {
      const current = nextJobId - BigInt(index);
      if (current <= 0n) break;
      const card = await this.fetchJobCard(current);
      if (card) jobs.push(card);
    }

    return { jobs };
  }

  private async executePostJob(
    intent: JobIntent,
    mode: 'relayer' | 'wallet'
  ): Promise<ExecuteResponse> {
    const payload = intent.payload ?? {};
    const rewardWei = parseReward(payload.reward, this.tokenDecimals);
    const deadlineDays = parseDeadlineDays(payload.deadlineDays);
    const metadata = buildJobMetadata(intent, deadlineDays);
    const deadlineSeconds = Math.floor(Date.now() / 1000 + deadlineDays * 24 * 60 * 60);
    const agentTypes = determineAgentTypes(intent);

    if (mode === 'wallet') {
      const artifacts = await this.prepareWalletArtifacts(metadata);
      const fnName =
        typeof agentTypes === 'number' ? 'createJobWithAgentTypes' : 'createJob';
      const args =
        typeof agentTypes === 'number'
          ? [rewardWei, deadlineSeconds, agentTypes, artifacts.specHash, artifacts.jsonUri]
          : [rewardWei, deadlineSeconds, artifacts.specHash, artifacts.jsonUri];
      const data = this.registry.interface.encodeFunctionData(fnName, args);
      const to = await this.resolveRegistryAddress();
      const chainId = await this.resolveChainId();
      return {
        ok: true,
        to,
        data,
        value: '0x0',
        chainId,
      };
    }

    if (!this.relayer) {
      throw new HttpError(503, 'Relayer is not configured. Set ONEBOX_RELAYER_PRIVATE_KEY.');
    }

    const { jobId, txHash } = await postJob({
      wallet: this.relayer,
      reward: rewardWei,
      deadline: deadlineSeconds,
      metadata,
      agentTypes: typeof agentTypes === 'number' ? agentTypes : undefined,
    });

    const receiptUrl = buildReceiptUrl(this.explorerBaseUrl, txHash);
    const numericJobId = Number.parseInt(jobId, 10);

    return {
      ok: true,
      jobId: Number.isFinite(numericJobId) ? numericJobId : undefined,
      txHash,
      receiptUrl,
    };
  }

  private async executeFinalizeJob(
    intent: JobIntent,
    mode: 'relayer' | 'wallet'
  ): Promise<ExecuteResponse> {
    const jobId = normaliseJobId(intent.payload?.jobId);

    if (mode === 'wallet') {
      const data = this.registry.interface.encodeFunctionData('finalize', [jobId]);
      const to = await this.resolveRegistryAddress();
      const chainId = await this.resolveChainId();
      return {
        ok: true,
        jobId: Number(jobId),
        to,
        data,
        value: '0x0',
        chainId,
      };
    }

    if (!this.relayer) {
      throw new HttpError(503, 'Relayer is not configured. Set ONEBOX_RELAYER_PRIVATE_KEY.');
    }

    await finalizeJob(jobId.toString(), this.relayer);
    return { ok: true, jobId: Number(jobId) };
  }

  private async prepareWalletArtifacts(
    metadata: Record<string, unknown>
  ): Promise<{ jsonUri: string; specHash: string }> {
    try {
      const artifacts = await prepareJobArtifacts(metadata);
      return { jsonUri: artifacts.jsonUri, specHash: artifacts.specHash };
    } catch (error) {
      logEvent('error', 'onebox.prepare_wallet_artifacts_failed', {
        error: errorMessage(error),
      });
      throw new HttpError(
        502,
        'I could not package the job details for wallet execution. Please try again.'
      );
    }
  }

  private async resolveRegistryAddress(): Promise<string> {
    const target = (this.registry as unknown as { target?: string }).target;
    if (typeof target === 'string' && target) {
      return target;
    }
    if (typeof (this.registry as { getAddress?: () => Promise<string> }).getAddress === 'function') {
      return this.registry.getAddress();
    }
    throw new Error('Unable to determine registry address');
  }

  private async resolveChainId(): Promise<number> {
    const network = await this.provider.getNetwork();
    const raw = (network as { chainId: bigint | number | string }).chainId;
    if (typeof raw === 'number') {
      return raw;
    }
    if (typeof raw === 'bigint') {
      const asNumber = Number(raw);
      if (!Number.isSafeInteger(asNumber)) {
        throw new Error('Chain id exceeds safe integer range');
      }
      return asNumber;
    }
    if (typeof raw === 'string') {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    throw new Error('Unsupported chain id from provider');
  }

  private async fetchJobCard(jobId: bigint): Promise<JobStatusCard | undefined> {
    try {
      const record = await this.registry.jobs(jobId);
      const metadata = decodePackedJobMetadata(record.packedMetadata ?? record[8]);
      const status = mapJobStateToStatus(metadata.state);
      const reward = formatReward(record.reward ?? record[2], this.tokenDecimals);
      const deadline = metadata.deadline
        ? formatDeadline(BigInt(metadata.deadline))
        : undefined;
      const assignee = record.agent ?? record[1];

      return {
        jobId: Number(jobId),
        status: status.code,
        statusLabel: status.label,
        reward,
        rewardToken: 'AGIALPHA',
        deadline,
        assignee: isZeroAddress(assignee) ? undefined : String(assignee),
      };
    } catch (error) {
      logEvent('warn', 'onebox.fetch_job_status_failed', {
        jobId: jobId.toString(),
        error: errorMessage(error),
      });
      return undefined;
    }
  }
}

export function createOneboxRouter(service: OneboxService = new DefaultOneboxService()): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    const correlationId = getCorrelationId(req);
    res.setHeader('x-correlation-id', correlationId);
    next();
  });

  router.post('/plan', async (req, res) => {
    const start = now();
    const correlationId = getCorrelationId(req);
    let intentType = 'unknown';
    let httpStatus = 200;
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      const expert = Boolean(req.body?.expert);
      const response = await service.plan(text, expert);
      intentType = response.intent?.action ?? 'unknown';
      logEvent('info', 'onebox.plan.success', {
        correlationId,
        intentType,
        httpStatus,
        expert,
      });
      res.json(response);
    } catch (error) {
      httpStatus = statusFromError(error);
      const level: LogLevel = httpStatus >= 500 ? 'error' : 'warn';
      logEvent(level, 'onebox.plan.error', {
        correlationId,
        intentType,
        httpStatus,
        error: errorMessage(error),
      });
      handleError(req, res, error);
    } finally {
      recordPlan(intentType, httpStatus, now() - start);
    }
  });

  router.post('/execute', async (req, res) => {
    const start = now();
    const correlationId = getCorrelationId(req);
    let intentType = 'unknown';
    let httpStatus = 200;
    let mode: 'wallet' | 'relayer' = 'relayer';
    try {
      const intent = req.body?.intent as JobIntent | undefined;
      if (!intent || typeof intent !== 'object') {
        throw new HttpError(400, 'Execution requires a validated intent payload.');
      }
      intentType = typeof intent.action === 'string' ? intent.action : 'unknown';
      mode = req.body?.mode === 'wallet' ? 'wallet' : 'relayer';
      const response = await service.execute(intent, mode);
      logEvent('info', 'onebox.execute.success', {
        correlationId,
        intentType,
        httpStatus,
        mode,
        jobId: response.jobId,
        status: response.status,
      });
      res.json(response);
    } catch (error) {
      httpStatus = statusFromError(error);
      const level: LogLevel = httpStatus >= 500 ? 'error' : 'warn';
      logEvent(level, 'onebox.execute.error', {
        correlationId,
        intentType,
        httpStatus,
        mode,
        error: errorMessage(error),
      });
      handleError(req, res, error);
    } finally {
      recordExecute(intentType, httpStatus, now() - start);
    }
  });

  router.get('/status', async (req, res) => {
    const start = now();
    const correlationId = getCorrelationId(req);
    const intentType = 'status';
    let httpStatus = 200;
    const jobIdParam = req.query.jobId;
    const limitParam = req.query.limit;
    const jobId = jobIdParam !== undefined ? Number(jobIdParam) : undefined;
    const limit = limitParam !== undefined ? Number(limitParam) : undefined;

    try {
      if (jobId !== undefined && (!Number.isFinite(jobId) || jobId < 0)) {
        throw new HttpError(400, 'jobId must be a positive integer.');
      }

      if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
        throw new HttpError(400, 'limit must be a positive integer.');
      }

      const response = await service.status(jobId, limit);
      logEvent('info', 'onebox.status.success', {
        correlationId,
        intentType,
        httpStatus,
        jobId,
        limit,
      });
      res.json(response);
    } catch (error) {
      httpStatus = statusFromError(error);
      const level: LogLevel = httpStatus >= 500 ? 'error' : 'warn';
      logEvent(level, 'onebox.status.error', {
        correlationId,
        intentType,
        httpStatus,
        jobId,
        limit,
        error: errorMessage(error),
      });
      handleError(req, res, error);
    } finally {
      recordStatus(intentType, httpStatus, now() - start);
    }
  });

  router.get('/metrics', (_req, res) => {
    res.type('text/plain; version=0.0.4');
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderMetrics());
  });

  return router;
}

function handleError(req: express.Request, res: express.Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: errorMessage(error) });
}

export function plannerIntentToJobIntent(
  envelope: IntentEnvelope,
  expert = false
): JobIntent {
  const constraints: Record<string, unknown> = {};
  if (envelope.payload.confirm !== undefined) {
    constraints.confirm = envelope.payload.confirm;
  }
  if (envelope.payload.confirmationText) {
    constraints.confirmationText = envelope.payload.confirmationText;
  }

  switch (envelope.intent) {
    case 'create_job': {
      const createParams = (
        envelope.payload as ConstraintForIntent<'create_job'>
      ).params;
      const job = createParams.job;
      if (createParams.autoApprove !== undefined) {
        constraints.autoApprove = createParams.autoApprove;
      }
      return {
        action: 'post_job',
        payload: {
          title: job.title,
          description: job.description,
          reward: job.rewardAmount,
          rewardToken: job.rewardTokenSymbol ?? 'AGIALPHA',
          deadlineDays: job.deadlineDays,
          attachments: normaliseAttachments(job.attachments),
        },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    }
    case 'finalize':
      return {
        action: 'finalize_job',
        payload: {
          jobId: toSerializableId(
            (envelope.payload as ConstraintForIntent<'finalize'>).params.jobId
          ),
        },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    case 'apply_job':
      const applyParams = (
        envelope.payload as ConstraintForIntent<'apply_job'>
      ).params;
      return {
        action: 'apply_job',
        payload: {
          jobId: toSerializableId(applyParams.jobId),
          ensName: applyParams.ensName,
          stakeAmount: applyParams.stakeAmount,
        },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    case 'submit_work':
      const submitParams = (
        envelope.payload as ConstraintForIntent<'submit_work'>
      ).params;
      return {
        action: 'submit_work',
        payload: {
          jobId: toSerializableId(submitParams.jobId),
          result: submitParams.result,
        },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    case 'validate':
      const validateParams = (
        envelope.payload as ConstraintForIntent<'validate'>
      ).params;
      return {
        action: 'validate',
        payload: {
          jobId: toSerializableId(validateParams.jobId),
          outcome: validateParams.outcome,
          notes: validateParams.notes,
        },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    case 'dispute':
      const disputeParams = (
        envelope.payload as ConstraintForIntent<'dispute'>
      ).params;
      return {
        action: 'dispute',
        payload: {
          jobId: toSerializableId(disputeParams.jobId),
          reason: disputeParams.reason,
          evidenceUri: disputeParams.evidenceUri,
        },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    case 'stake':
      const stakeParams = (
        envelope.payload as ConstraintForIntent<'stake'>
      ).params;
      return {
        action: 'stake',
        payload: { amount: stakeParams.amount, role: stakeParams.role },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    case 'withdraw':
      const withdrawParams = (
        envelope.payload as ConstraintForIntent<'withdraw'>
      ).params;
      return {
        action: 'withdraw',
        payload: { amount: withdrawParams.amount, role: withdrawParams.role },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
    case 'admin_set':
      const adminParams = (
        envelope.payload as ConstraintForIntent<'admin_set'>
      ).params;
      return {
        action: 'admin_set',
        payload: { key: adminParams.key, value: adminParams.value },
        constraints,
        userContext: buildUserContext(envelope.payload.meta, expert),
      };
  }
}

function buildPlannerSummary(
  envelope: IntentEnvelope,
  intent: JobIntent,
  result: PlannerPlanResult
): PlannerSummary {
  const warnings: string[] = [];
  if (result.source === 'fallback') {
    warnings.push(
      'Planner fallback mode was used. Configure AGI-Alpha orchestrator for richer plans.'
    );
    if (result.message) {
      warnings.push(result.message);
    }
  }

  const confirmation = envelope.payload.confirmationText?.trim();
  if (confirmation) {
    return { summary: confirmation, warnings };
  }

  let summary: string;
  switch (intent.action) {
    case 'post_job': {
      const title = typeof intent.payload?.title === 'string' ? intent.payload.title : 'a job';
      const reward = intent.payload?.reward ?? '?';
      const rewardToken = intent.payload?.rewardToken ?? 'AGIALPHA';
      const deadline = intent.payload?.deadlineDays ?? DEFAULT_DEADLINE_DAYS;
      summary = `Post “${title}” paying ${reward} ${rewardToken} with a ${deadline}-day deadline.`;
      break;
    }
    case 'finalize_job':
      summary = `Finalize job ${intent.payload?.jobId ?? ''}.`;
      break;
    case 'apply_job':
      summary = `Apply to job ${intent.payload?.jobId ?? ''}.`;
      break;
    case 'validate':
      summary = `Submit a ${intent.payload?.outcome ?? 'validation'} for job ${
        intent.payload?.jobId ?? ''
      }.`;
      break;
    default:
      summary = result.message || `Ready to run ${intent.action}.`;
  }

  return { summary, warnings };
}

function buildUserContext(
  meta: IntentEnvelope['payload']['meta'],
  expert: boolean
): Record<string, unknown> | undefined {
  if (!meta && !expert) return undefined;
  const context: Record<string, unknown> = {};
  if (meta?.traceId) context.traceId = meta.traceId;
  if (meta?.userId) context.userId = meta.userId;
  if (meta?.planner) context.planner = meta.planner;
  if (expert) context.expertMode = true;
  return Object.keys(context).length > 0 ? context : undefined;
}

function normaliseAttachments(input: unknown): JobAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry, index): JobAttachment | undefined => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (!trimmed) return undefined;
        return {
          name: deriveAttachmentName(trimmed, index),
          ipfs: trimmed.startsWith('ipfs://') ? trimmed : undefined,
          url: trimmed.startsWith('ipfs://') ? undefined : trimmed,
        };
      }
      if (entry && typeof entry === 'object') {
        const { name, ipfs, url, type } = entry as Record<string, unknown>;
        return {
          name: typeof name === 'string' && name ? name : deriveAttachmentName(String(url ?? ipfs ?? ''), index),
          ipfs: typeof ipfs === 'string' ? ipfs : undefined,
          url: typeof url === 'string' ? url : undefined,
          type: typeof type === 'string' ? type : undefined,
        };
      }
      return undefined;
    })
    .filter((attachment): attachment is JobAttachment => Boolean(attachment));
}

function deriveAttachmentName(value: string, index: number): string {
  const cleaned = value.split('/').pop() ?? '';
  if (cleaned) return cleaned;
  return `attachment-${index + 1}`;
}

function buildJobMetadata(intent: JobIntent, deadlineDays: number): Record<string, unknown> {
  return {
    title: intent.payload?.title ?? 'Untitled job',
    description: intent.payload?.description ?? '',
    reward: intent.payload?.reward,
    rewardToken: intent.payload?.rewardToken ?? 'AGIALPHA',
    deadlineDays,
    attachments: intent.payload?.attachments ?? [],
    constraints: intent.constraints ?? {},
    userContext: intent.userContext ?? {},
    createdAt: new Date().toISOString(),
    source: 'apps/orchestrator/onebox',
  };
}

function determineAgentTypes(intent: JobIntent): number | undefined {
  const payloadAgentTypes = (intent.payload as Record<string, unknown> | undefined)?.['agentTypes'];
  if (typeof payloadAgentTypes === 'number' && Number.isFinite(payloadAgentTypes)) {
    const candidate = Math.trunc(payloadAgentTypes);
    return candidate >= 0 ? candidate : undefined;
  }

  const constraintAgentTypes = intent.constraints?.['agentTypes'];
  if (typeof constraintAgentTypes === 'number' && Number.isFinite(constraintAgentTypes)) {
    const candidate = Math.trunc(constraintAgentTypes);
    return candidate >= 0 ? candidate : undefined;
  }

  return undefined;
}

function parseReward(value: unknown, decimals: number): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return ethers.parseUnits(value.toString(), decimals);
  }
  if (typeof value === 'string' && value.trim()) {
    return ethers.parseUnits(value.trim(), decimals);
  }
  throw new HttpError(400, 'Specify the reward amount in AGIALPHA.');
}

function parseDeadlineDays(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }
  return Number(process.env.ONEBOX_DEFAULT_DEADLINE_DAYS ?? DEFAULT_DEADLINE_DAYS);
}

function buildReceiptUrl(base: string | undefined, txHash: string): string | undefined {
  if (!base) return undefined;
  const normalised = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${normalised}/${txHash}`;
}

function normaliseJobId(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    if (value.startsWith('0x')) {
      return BigInt(value);
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return BigInt(parsed);
    }
  }
  throw new HttpError(400, 'Job id must be a positive integer.');
}

function toSerializableId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  if (typeof value === 'bigint') return value.toString();
  throw new HttpError(400, 'Job id must be serialisable.');
}

export function decodePackedJobMetadata(
  packed: unknown
): { state?: number; deadline?: bigint } {
  if (packed === undefined || packed === null) {
    return {};
  }
  let value: bigint;
  if (typeof packed === 'bigint') {
    value = packed;
  } else if (typeof packed === 'number' && Number.isFinite(packed)) {
    value = BigInt(packed);
  } else if (typeof packed === 'string') {
    value = BigInt(packed);
  } else if (typeof (packed as any).toString === 'function') {
    value = BigInt((packed as any).toString());
  } else {
    return {};
  }

  const state = Number((value & (0x7n << 0n)) >> 0n);
  const deadline = (value & (0xffffffffffffffffn << 77n)) >> 77n;
  return { state, deadline };
}

const STATE_LABELS: Record<number, { code: string; label: string }> = {
  0: { code: 'none', label: 'Unknown' },
  1: { code: 'open', label: 'Open' },
  2: { code: 'applied', label: 'Applied' },
  3: { code: 'submitted', label: 'Submitted' },
  4: { code: 'completed', label: 'Completed' },
  5: { code: 'disputed', label: 'Disputed' },
  6: { code: 'finalized', label: 'Finalized' },
  7: { code: 'cancelled', label: 'Cancelled' },
};

export function mapJobStateToStatus(state?: number): { code: string; label: string } {
  if (state === undefined) {
    return STATE_LABELS[0];
  }
  return STATE_LABELS[state] ?? STATE_LABELS[0];
}

export function formatDeadline(deadline: bigint): string {
  if (!deadline || deadline <= 0n) {
    return 'not set';
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  const diff = deadline - now;
  if (diff <= 0n) {
    return 'expired';
  }
  const days = diff / 86_400n;
  if (days > 0n) {
    return `in ${days} day${days === 1n ? '' : 's'}`;
  }
  const hours = diff / 3_600n;
  if (hours > 0n) {
    return `in ${hours} hour${hours === 1n ? '' : 's'}`;
  }
  const minutes = diff / 60n;
  if (minutes > 0n) {
    return `in ${minutes} minute${minutes === 1n ? '' : 's'}`;
  }
  return 'less than a minute';
}

function formatReward(value: unknown, decimals: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    const amount =
      typeof value === 'bigint'
        ? value
        : typeof value === 'number'
        ? BigInt(value)
        : BigInt(value as any);
    return ethers.formatUnits(amount, decimals);
  } catch {
    return undefined;
  }
}

function isZeroAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^0x0{40}$/iu.test(value);
}
