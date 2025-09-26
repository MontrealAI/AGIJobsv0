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
import { postJob } from './employer';
import { finalizeJob } from './submission';
import { JOB_REGISTRY_ADDRESS, RPC_URL } from './config';
import {
  now,
  recordExecute,
  recordPlan,
  recordStatus,
  renderMetrics,
} from './oneboxMetrics';

const STATUS_ABI = [
  'function nextJobId() view returns (uint256)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata)',
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
    if (mode === 'wallet') {
      throw new HttpError(
        501,
        'Wallet execution is not available yet. Disable expert mode to continue with the relayer path.'
      );
    }

    switch (intent.action) {
      case 'post_job':
        return this.executePostJob(intent);
      case 'finalize_job': {
        const jobId = normaliseJobId(intent.payload?.jobId);
        const resultRef = String(intent.payload?.resultUri ?? intent.payload?.resultRef ?? '');
        if (!this.relayer) {
          throw new HttpError(503, 'Relayer is not configured. Set ONEBOX_RELAYER_PRIVATE_KEY.');
        }
        await finalizeJob(jobId.toString(), resultRef, this.relayer);
        return { ok: true, jobId: Number(jobId) };
      }
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

  private async executePostJob(intent: JobIntent): Promise<ExecuteResponse> {
    if (!this.relayer) {
      throw new HttpError(503, 'Relayer is not configured. Set ONEBOX_RELAYER_PRIVATE_KEY.');
    }

    const payload = intent.payload ?? {};
    const rewardWei = parseReward(payload.reward, this.tokenDecimals);
    const deadlineDays = parseDeadlineDays(payload.deadlineDays);
    const metadata = buildJobMetadata(intent, deadlineDays);
    const deadlineSeconds = Math.floor(Date.now() / 1000 + deadlineDays * 24 * 60 * 60);

    const { jobId, txHash } = await postJob({
      wallet: this.relayer,
      reward: rewardWei,
      deadline: deadlineSeconds,
      metadata,
      agentTypes: typeof payload.agentTypes === 'number' ? payload.agentTypes : undefined,
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
      console.warn('Failed to load job status', {
        jobId: jobId.toString(),
        error: error instanceof Error ? error.message : error,
      });
      return undefined;
    }
  }
}

export function createOneboxRouter(service: OneboxService = new DefaultOneboxService()): express.Router {
  const router = express.Router();

  router.post('/plan', async (req, res) => {
    const start = now();
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text : '';
      const expert = Boolean(req.body?.expert);
      const response = await service.plan(text, expert);
      recordPlan(now() - start);
      res.json(response);
    } catch (error) {
      recordPlan(now() - start, error);
      handleError(res, error);
    }
  });

  router.post('/execute', async (req, res) => {
    const start = now();
    let intentAction: string | undefined;
    try {
      const intent = req.body?.intent as JobIntent | undefined;
      if (!intent || typeof intent !== 'object') {
        throw new HttpError(400, 'Execution requires a validated intent payload.');
      }
      intentAction = typeof intent.action === 'string' ? intent.action : undefined;
      const mode = req.body?.mode === 'wallet' ? 'wallet' : 'relayer';
      const response = await service.execute(intent, mode);
      recordExecute(now() - start, intentAction);
      res.json(response);
    } catch (error) {
      recordExecute(now() - start, intentAction, error);
      handleError(res, error);
    }
  });

  router.get('/status', async (req, res) => {
    const start = now();
    try {
      const jobIdParam = req.query.jobId;
      const limitParam = req.query.limit;
      const jobId = jobIdParam !== undefined ? Number(jobIdParam) : undefined;
      const limit = limitParam !== undefined ? Number(limitParam) : undefined;

      if (jobId !== undefined && (!Number.isFinite(jobId) || jobId < 0)) {
        throw new HttpError(400, 'jobId must be a positive integer.');
      }

      if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
        throw new HttpError(400, 'limit must be a positive integer.');
      }

      const response = await service.status(jobId, limit);
      recordStatus(now() - start);
      res.json(response);
    } catch (error) {
      recordStatus(now() - start, error);
      handleError(res, error);
    }
  });

  router.get('/metrics', (_req, res) => {
    res.type('text/plain; version=0.0.4');
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderMetrics());
  });

  return router;
}

function handleError(res: express.Response, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error('One-box router error', error);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  res.status(500).json({ error: message });
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
