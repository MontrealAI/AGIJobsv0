import fs from 'node:fs';
import path from 'node:path';
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
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
  ExecuteRequest,
  ExecuteResponse,
  JobAttachment,
  JobIntent,
  JobStatusCard,
  PlanResponse,
  StatusResponse,
} from '../../packages/onebox-sdk/src';
import { postJob, prepareJobArtifacts } from './employer';
import { uploadToIPFS } from './execution';
import { finalizeJob } from './submission';
import { JOB_REGISTRY_ADDRESS, RPC_URL } from './config';
import {
  now,
  recordExecute,
  recordPlan,
  recordStatus,
  renderMetrics,
} from './oneboxMetrics';
import { decorateReceipt } from './attestation';
import { ownerGovernanceSnapshot, ownerPreviewAction } from './ownerConsole';

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

function timingSafeStringCompare(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

function isValidBearer(header: string, secret: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const token = match[1].trim();
  return timingSafeStringCompare(token, secret);
}

function isValidHmac(header: string, secret: string, req: express.Request): boolean {
  const match = /^HMAC\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  const [timestampPart, signaturePart] = match[1].split(':');
  if (!timestampPart || !signaturePart) return false;

  const timestamp = Number(timestampPart);
  if (!Number.isFinite(timestamp)) return false;

  const nowMs = Date.now();
  const timestampMs = timestamp * 1000;
  const skewMs = Math.abs(nowMs - timestampMs);
  if (skewMs > 5 * 60 * 1000) {
    return false;
  }

  const canonical = `${req.method.toUpperCase()} ${req.originalUrl ?? req.url} ${timestampPart}`;
  const expectedSignature = createHmac('sha256', secret).update(canonical).digest('hex');
  return timingSafeStringCompare(signaturePart, expectedSignature);
}

const STATUS_ABI = [
  'function nextJobId() view returns (uint256)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata)',
  'function createJob(uint256 reward,uint64 deadline,bytes32 specHash,string uri) returns (uint256)',
  'function createJobWithAgentTypes(uint256 reward,uint64 deadline,uint8 agentTypes,bytes32 specHash,string uri) returns (uint256)',
  'function finalize(uint256 jobId)',
  'function feePct() view returns (uint256)',
  'function stakeManager() view returns (address)',
];

const DEFAULT_STATUS_LIMIT = 5;
const DEFAULT_DEADLINE_DAYS = 7;
const DEFAULT_FEE_PCT = Number.parseFloat(process.env.ONEBOX_DEFAULT_FEE_PCT ?? process.env.ONEBOX_FEE_PCT ?? '5');
const DEFAULT_BURN_PCT = Number.parseFloat(process.env.ONEBOX_DEFAULT_BURN_PCT ?? process.env.ONEBOX_BURN_PCT ?? '2');
const DEFAULT_POLICY_FILE = path.resolve(__dirname, '../storage/org-policies.json');

const VALID_PERCENTAGE = (value: number) => Number.isFinite(value) && value >= 0;

interface OrgPolicyRecord {
  maxBudgetWei?: bigint;
  maxDurationDays?: number;
  updatedAt: string;
}

interface OrgPolicyStoreOptions {
  policyPath?: string;
  defaultMaxBudgetWei?: bigint;
  defaultMaxDurationDays?: number;
  tokenDecimals?: number;
}

class OrgPolicyStore {
  private readonly filePath: string;

  private readonly defaultMaxBudgetWei?: bigint;

  private readonly defaultMaxDurationDays?: number;

  private readonly policies = new Map<string, OrgPolicyRecord>();

  private readonly tokenDecimals: number;

  constructor(options: OrgPolicyStoreOptions = {}) {
    this.filePath = options.policyPath ?? DEFAULT_POLICY_FILE;
    this.defaultMaxBudgetWei = options.defaultMaxBudgetWei;
    this.defaultMaxDurationDays = options.defaultMaxDurationDays;
    this.tokenDecimals = options.tokenDecimals ?? 18;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, { maxBudgetWei?: string; maxDurationDays?: number; updatedAt?: string }>;
      for (const [key, value] of Object.entries(parsed)) {
        const record: OrgPolicyRecord = {
          updatedAt: value.updatedAt ?? new Date().toISOString(),
        };
        if (typeof value.maxBudgetWei === 'string' && value.maxBudgetWei.trim().length > 0) {
          try {
            record.maxBudgetWei = BigInt(value.maxBudgetWei);
          } catch {
            // ignore malformed persisted value
          }
        }
        if (typeof value.maxDurationDays === 'number' && Number.isFinite(value.maxDurationDays) && value.maxDurationDays > 0) {
          record.maxDurationDays = Math.trunc(value.maxDurationDays);
        }
        this.policies.set(key, record);
      }
    } catch (error) {
      console.warn('Failed to load org policy store', error);
    }
  }

  private persist(): void {
    try {
      const serialisable: Record<string, { maxBudgetWei?: string; maxDurationDays?: number; updatedAt: string }> = {};
      for (const [key, value] of this.policies.entries()) {
        serialisable[key] = {
          ...(value.maxBudgetWei !== undefined ? { maxBudgetWei: value.maxBudgetWei.toString() } : {}),
          ...(value.maxDurationDays !== undefined ? { maxDurationDays: value.maxDurationDays } : {}),
          updatedAt: value.updatedAt,
        };
      }
      const directory = path.dirname(this.filePath);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(serialisable, null, 2));
    } catch (error) {
      console.warn('Failed to persist org policy store', error);
    }
  }

  private resolveKey(userId: string | undefined): string {
    return userId && userId.trim() ? userId.trim() : '__default__';
  }

  private getOrCreate(userId: string | undefined): OrgPolicyRecord {
    const key = this.resolveKey(userId);
    const existing = this.policies.get(key);
    if (existing) {
      return existing;
    }
    const created: OrgPolicyRecord = {
      maxBudgetWei: this.defaultMaxBudgetWei,
      maxDurationDays: this.defaultMaxDurationDays,
      updatedAt: new Date().toISOString(),
    };
    this.policies.set(key, created);
    this.persist();
    return created;
  }

  enforce(userId: string | undefined, rewardWei: bigint, deadlineDays: number): void {
    const policy = this.getOrCreate(userId);
    if (policy.maxBudgetWei !== undefined && rewardWei > policy.maxBudgetWei) {
      throw new HttpError(
        400,
        `Requested budget ${ethers.formatUnits(rewardWei, this.tokenDecimals)} AGIALPHA exceeds organisation cap of ${ethers.formatUnits(policy.maxBudgetWei, this.tokenDecimals)} AGIALPHA.`
      );
    }
    if (policy.maxDurationDays !== undefined && deadlineDays > policy.maxDurationDays) {
      throw new HttpError(400, `Requested deadline of ${deadlineDays} days exceeds organisation cap of ${policy.maxDurationDays} days.`);
    }
  }

  update(userId: string | undefined, overrides: Partial<OrgPolicyRecord>): void {
    const policy = this.getOrCreate(userId);
    if (overrides.maxBudgetWei !== undefined) {
      policy.maxBudgetWei = overrides.maxBudgetWei;
    }
    if (overrides.maxDurationDays !== undefined) {
      policy.maxDurationDays = overrides.maxDurationDays;
    }
    policy.updatedAt = new Date().toISOString();
    this.persist();
  }
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface OneboxService {
  plan(text: string, expert?: boolean): Promise<PlanResponse>;
  execute(
    intent: JobIntent,
    mode: 'relayer' | 'wallet',
    options?: ExecuteOptions
  ): Promise<ExecuteResponse>;
  status(jobId?: number, limit?: number): Promise<StatusResponse>;
}

interface ExecuteOptions {
  planHash?: string;
  createdAt?: string;
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
  private readonly orgPolicy: OrgPolicyStore;
  private readonly defaultFeePct: number;
  private readonly defaultBurnPct: number;
  private cachedFeePct?: number;
  private cachedBurnPct?: number;
  private feePolicyLoaded = false;

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

    const defaultBudgetEnv = options.maxJobBudgetAgia ?? process.env.ONEBOX_MAX_JOB_BUDGET_AGIA;
    const defaultDurationEnv = options.maxJobDurationDays ?? process.env.ONEBOX_MAX_JOB_DURATION_DAYS;
    let defaultBudgetWei: bigint | undefined;
    if (typeof defaultBudgetEnv === 'string' && defaultBudgetEnv.trim().length > 0) {
      try {
        defaultBudgetWei = ethers.parseUnits(defaultBudgetEnv.trim(), this.tokenDecimals);
      } catch (error) {
        console.warn('Failed to parse ONEBOX_MAX_JOB_BUDGET_AGIA', error);
      }
    }
    let defaultDurationDays: number | undefined;
    if (typeof defaultDurationEnv === 'string' && defaultDurationEnv.trim().length > 0) {
      const parsed = Number.parseInt(defaultDurationEnv.trim(), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        defaultDurationDays = parsed;
      } else {
        console.warn('Invalid ONEBOX_MAX_JOB_DURATION_DAYS value', defaultDurationEnv);
      }
    }
    this.orgPolicy = new OrgPolicyStore({
      policyPath: options.policyPath,
      defaultMaxBudgetWei: defaultBudgetWei,
      defaultMaxDurationDays: defaultDurationDays,
      tokenDecimals: this.tokenDecimals,
    });

    this.defaultFeePct = VALID_PERCENTAGE(DEFAULT_FEE_PCT) ? DEFAULT_FEE_PCT : 5;
    this.defaultBurnPct = VALID_PERCENTAGE(DEFAULT_BURN_PCT) ? DEFAULT_BURN_PCT : 2;
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
    const { summary, warnings } = await this.buildPlannerSummary(envelope, intent, result);

    return {
      summary,
      intent,
      requiresConfirmation: envelope.payload.confirm ?? true,
      warnings,
      planHash: computePlanHash(envelope),
    };
  }

  async execute(
    intent: JobIntent,
    mode: 'relayer' | 'wallet',
    options: ExecuteOptions = {}
  ): Promise<ExecuteResponse> {
    switch (intent.action) {
      case 'post_job':
        return this.executePostJob(intent, mode, options);
      case 'finalize_job':
        return this.executeFinalizeJob(intent, mode, options);
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
    mode: 'relayer' | 'wallet',
    options: ExecuteOptions
  ): Promise<ExecuteResponse> {
    const payload = intent.payload ?? {};
    const rewardWei = parseReward(payload.reward, this.tokenDecimals);
    const deadlineDays = parseDeadlineDays(payload.deadlineDays);
    const metadata = buildJobMetadata(intent, deadlineDays);
    const deadlineSeconds = Math.floor(Date.now() / 1000 + deadlineDays * 24 * 60 * 60);
    const agentTypes = determineAgentTypes(intent);
    const userId = extractUserId(intent);
    this.orgPolicy.enforce(userId, rewardWei, deadlineDays);

    await this.ensureFeePolicy();
    const planHash = options.planHash;
    const createdAt = options.createdAt ?? new Date().toISOString();
    const feePct = this.cachedFeePct ?? this.defaultFeePct;
    const burnPct = this.cachedBurnPct ?? this.defaultBurnPct;
    const { feeAmountWei, burnAmountWei } = calculateFeeBreakdown(rewardWei, feePct, burnPct);
    const feeAmount = feeAmountWei > 0n ? formatRewardFromWei(feeAmountWei, this.tokenDecimals) : undefined;
    const burnAmount = burnAmountWei > 0n ? formatRewardFromWei(burnAmountWei, this.tokenDecimals) : undefined;

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
        planHash,
        createdAt,
        feePct,
        burnPct,
        feeAmount,
        burnAmount,
        to,
        data,
        value: '0x0',
        chainId,
      };
    }

    if (!this.relayer) {
      throw new HttpError(503, 'Relayer is not configured. Set ONEBOX_RELAYER_PRIVATE_KEY.');
    }

    const { jobId, txHash, jsonUri, specHash } = await postJob({
      wallet: this.relayer,
      reward: rewardWei,
      deadline: deadlineSeconds,
      metadata,
      agentTypes: typeof agentTypes === 'number' ? agentTypes : undefined,
    });

    const receiptUrl = buildReceiptUrl(this.explorerBaseUrl, txHash);
    const numericJobId = Number.parseInt(jobId, 10);
    const rewardFormatted = formatRewardFromWei(rewardWei, this.tokenDecimals);
    const specCid = extractCid(jsonUri);
    const gatewayUrls = buildGatewayUrls(jsonUri);

    return {
      ok: true,
      planHash,
      createdAt,
      jobId: Number.isFinite(numericJobId) ? numericJobId : undefined,
      txHash,
      txHashes: txHash ? [txHash] : undefined,
      receiptUrl,
      reward: rewardFormatted,
      token: metadata.rewardToken,
      deadline: deadlineSeconds,
      specCid: specCid ?? undefined,
      specUri: jsonUri,
      specGatewayUrl: gatewayUrls[0],
      specGatewayUrls: gatewayUrls.length ? gatewayUrls : undefined,
      specHash,
      deliverableCid: undefined,
      feePct,
      burnPct,
      feeAmount,
      burnAmount,
    };
  }

  private async executeFinalizeJob(
    intent: JobIntent,
    mode: 'relayer' | 'wallet',
    options: ExecuteOptions
  ): Promise<ExecuteResponse> {
    const jobId = normaliseJobId(intent.payload?.jobId);
    const planHash = options.planHash;
    const createdAt = options.createdAt ?? new Date().toISOString();

    if (mode === 'wallet') {
      const data = this.registry.interface.encodeFunctionData('finalize', [jobId]);
      const to = await this.resolveRegistryAddress();
      const chainId = await this.resolveChainId();
      return {
        ok: true,
        jobId: Number(jobId),
        planHash,
        createdAt,
        to,
        data,
        value: '0x0',
        chainId,
      };
    }

    if (!this.relayer) {
      throw new HttpError(503, 'Relayer is not configured. Set ONEBOX_RELAYER_PRIVATE_KEY.');
    }

    const { txHash } = await finalizeJob(jobId.toString(), this.relayer);
    return {
      ok: true,
      jobId: Number(jobId),
      planHash,
      createdAt,
      txHash,
      txHashes: txHash ? [txHash] : undefined,
      receiptUrl: txHash ? buildReceiptUrl(this.explorerBaseUrl, txHash) : undefined,
    };
  }

  private async ensureFeePolicy(): Promise<void> {
    if (this.feePolicyLoaded) return;
    try {
      const feeRaw = await (this.registry as { feePct?: () => Promise<unknown> }).feePct?.();
      if (feeRaw !== undefined) {
        const parsedFee = Number(feeRaw);
        if (VALID_PERCENTAGE(parsedFee)) {
          this.cachedFeePct = parsedFee;
        }
      }
      const stakeManagerAddress = await (this.registry as { stakeManager?: () => Promise<string> }).stakeManager?.();
      if (stakeManagerAddress && ethers.isAddress(stakeManagerAddress) && stakeManagerAddress !== ethers.ZeroAddress) {
        const stakeManager = new Contract(stakeManagerAddress, ['function burnPct() view returns (uint256)'], this.provider);
        try {
          const burnRaw = await stakeManager.burnPct();
          const parsedBurn = Number(burnRaw);
          if (VALID_PERCENTAGE(parsedBurn)) {
            this.cachedBurnPct = parsedBurn;
          }
        } catch (error) {
          logEvent('warn', 'onebox.fee_policy.burn_lookup_failed', {
            error: errorMessage(error),
          });
        }
      }
    } catch (error) {
      logEvent('warn', 'onebox.fee_policy.lookup_failed', { error: errorMessage(error) });
    } finally {
      if (!VALID_PERCENTAGE(this.cachedFeePct ?? NaN)) {
        this.cachedFeePct = this.defaultFeePct;
      }
      if (!VALID_PERCENTAGE(this.cachedBurnPct ?? NaN)) {
        this.cachedBurnPct = this.defaultBurnPct;
      }
      this.feePolicyLoaded = true;
    }
  }

  private async buildPlannerSummary(
    envelope: IntentEnvelope,
    intent: JobIntent,
    result: PlannerPlanResult
  ): Promise<PlannerSummary> {
    await this.ensureFeePolicy();
    return buildPlannerSummary(envelope, intent, result, {
      tokenDecimals: this.tokenDecimals,
      feePct: this.cachedFeePct ?? this.defaultFeePct,
      burnPct: this.cachedBurnPct ?? this.defaultBurnPct,
    });
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
  const expectedSecret = (process.env.ONEBOX_API_TOKEN ?? process.env.API_TOKEN ?? '').trim();
  const router = express.Router();

  router.use((req, res, next) => {
    if (!expectedSecret) {
      logEvent('warn', 'onebox.auth.missing_secret', {
        correlationId: getCorrelationId(req),
      });
      res.status(401).json({ error: 'API token not configured.' });
      return;
    }

    const header = req.headers.authorization;
    if (typeof header !== 'string' || header.trim().length === 0) {
      logEvent('warn', 'onebox.auth.missing_header', {
        correlationId: getCorrelationId(req),
      });
      res.status(401).json({ error: 'Missing authorization header.' });
      return;
    }

    if (isValidBearer(header, expectedSecret) || isValidHmac(header, expectedSecret, req)) {
      next();
      return;
    }

    logEvent('warn', 'onebox.auth.invalid_token', {
      correlationId: getCorrelationId(req),
      scheme: header.split(' ')[0],
    });
    res.status(403).json({ error: 'Invalid authorization token.' });
  });

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
      const decorated = await decoratePlanResponse(response);
      intentType = decorated.intent?.action ?? 'unknown';
      logEvent('info', 'onebox.plan.success', {
        correlationId,
        intentType,
        httpStatus,
        expert,
        receiptDigest: decorated.receiptDigest,
        receiptAttestationUid: decorated.receiptAttestationUid,
      });
      res.json(decorated);
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
    let planHash: string | undefined;
    try {
      const executeRequest = req.body as ExecuteRequest | undefined;
      const intent = executeRequest?.intent as JobIntent | undefined;
      if (!intent || typeof intent !== 'object') {
        throw new HttpError(400, 'Execution requires a validated intent payload.');
      }
      intentType = typeof intent.action === 'string' ? intent.action : 'unknown';
      mode = executeRequest?.mode === 'wallet' ? 'wallet' : 'relayer';
      planHash = normalizePlanHash(executeRequest?.planHash);
      if (!planHash) {
        throw new HttpError(400, 'Execution requires the planHash returned by /onebox/plan.');
      }
      const createdAt = normalizeRequestTimestamp(executeRequest?.createdAt);
      const response = await service.execute(intent, mode, { planHash, createdAt });
      const decorated = await decorateExecuteResponse(response, {
        planHash,
        createdAt,
        mode,
        correlationId,
      });
      logEvent('info', 'onebox.execute.success', {
        correlationId,
        intentType,
        httpStatus,
        mode,
        planHash,
        jobId: decorated.jobId,
        status: decorated.status,
        receiptCid: decorated.receiptCid,
      });
      res.json(decorated);
    } catch (error) {
      httpStatus = statusFromError(error);
      const level: LogLevel = httpStatus >= 500 ? 'error' : 'warn';
      logEvent(level, 'onebox.execute.error', {
        correlationId,
        intentType,
        httpStatus,
        planHash,
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

  router.get('/governance/snapshot', async (req, res) => {
    const correlationId = getCorrelationId(req);
    try {
      const snapshot = await ownerGovernanceSnapshot();
      logEvent('info', 'onebox.governance.snapshot', { correlationId });
      res.json(snapshot);
    } catch (error) {
      const httpStatus = statusFromError(error);
      const level: LogLevel = httpStatus >= 500 ? 'error' : 'warn';
      logEvent(level, 'onebox.governance.snapshot_error', {
        correlationId,
        httpStatus,
        error: errorMessage(error),
      });
      handleError(req, res, error);
    }
  });

  router.post('/governance/preview', async (req, res) => {
    const correlationId = getCorrelationId(req);
    let httpStatus = 200;
    try {
      const body = (req.body ?? {}) as {
        key?: unknown;
        value?: unknown;
        meta?: { traceId?: string; userId?: string; safe?: string };
        persist?: boolean;
      };
      if (typeof body.key !== 'string' || !body.key.trim()) {
        throw new HttpError(400, 'Governance preview requires a key field.');
      }
      const preview = await ownerPreviewAction({
        key: body.key.trim(),
        value: body.value,
        meta: {
          traceId: body.meta?.traceId ?? correlationId,
          userId: body.meta?.userId,
          safe: body.meta?.safe,
        },
        persist: body.persist,
      });
      logEvent('info', 'onebox.governance.preview', {
        correlationId,
        key: body.key.trim(),
      });
      res.json(preview);
    } catch (error) {
      httpStatus = statusFromError(error);
      const level: LogLevel = httpStatus >= 500 ? 'error' : 'warn';
      logEvent(level, 'onebox.governance.preview_error', {
        correlationId,
        httpStatus,
        error: errorMessage(error),
      });
      handleError(req, res, error);
    }
  });

  return router;
}

interface ReceiptAttestationFields {
  receipt?: Record<string, unknown>;
  receiptDigest?: string;
  receiptAttestationUid?: string;
  receiptAttestationTxHash?: string;
  receiptAttestationCid?: string | null;
  receiptAttestationUri?: string | null;
}

type PlanResponseWithReceipt = PlanResponse & ReceiptAttestationFields;
type ExecuteResponseWithReceipt = ExecuteResponse & ReceiptAttestationFields;

interface DecorateExecuteOptions {
  planHash: string;
  createdAt?: string;
  mode: 'wallet' | 'relayer';
  correlationId: string;
}

function normalizePlanHash(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function normalizeRequestTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return undefined;
}

async function decoratePlanResponse(response: PlanResponse): Promise<PlanResponseWithReceipt> {
  const metadata: Record<string, unknown> = {
    summary: response.summary,
    intent: response.intent,
    requiresConfirmation: response.requiresConfirmation,
    warnings: response.warnings,
    planHash: response.planHash,
  };
  if (Array.isArray((response as any).missingFields)) {
    metadata.missingFields = (response as any).missingFields;
  }
  const attested = await decorateReceipt('PLAN', metadata, {
    context: {
      planHash: response.planHash,
    },
  });
  return {
    ...response,
    receipt: attested.metadata,
    receiptDigest: attested.digest,
    receiptAttestationUid: attested.attestationUid,
    receiptAttestationTxHash: attested.attestationTxHash,
    receiptAttestationCid: attested.attestationCid ?? null,
    receiptAttestationUri: attested.attestationUri ?? null,
  };
}

async function decorateExecuteResponse(
  response: ExecuteResponse,
  options: DecorateExecuteOptions
): Promise<ExecuteResponseWithReceipt> {
  const createdAt = response.createdAt ?? options.createdAt ?? new Date().toISOString();
  const planHash = response.planHash ?? options.planHash;
  const txHashes = collectTxHashes(response);
  const decorated: ExecuteResponseWithReceipt = {
    ...response,
    planHash,
    createdAt,
    txHashes: txHashes.length ? txHashes : response.txHashes,
  };

  if (!decorated.ok || options.mode !== 'relayer') {
    return decorated;
  }

  const receiptRecord = buildReceiptRecord(decorated, planHash, createdAt, txHashes);
  if (!receiptRecord) {
    return decorated;
  }

  decorated.receipt = receiptRecord;

  try {
    const pin = await uploadToIPFS(receiptRecord);
    const uri = pin.uri ?? `ipfs://${pin.cid}`;
    const gatewayUrls = pin.gatewayUrls?.length ? pin.gatewayUrls : undefined;
    decorated.receiptCid = pin.cid;
    decorated.receiptUri = uri;
    decorated.receiptGatewayUrls = gatewayUrls;
    decorated.receiptGatewayUrl = gatewayUrls ? gatewayUrls[0] : undefined;
    const deliverableUrls = gatewayUrls ?? decorated.deliverableGatewayUrls;
    decorated.deliverableCid = pin.cid;
    decorated.deliverableUri = uri;
    decorated.deliverableGatewayUrls = deliverableUrls;
    decorated.deliverableGatewayUrl = deliverableUrls ? deliverableUrls[0] : undefined;
    decorated.receipt = {
      ...receiptRecord,
      receiptCid: pin.cid,
      receiptUri: uri,
      receiptGatewayUrls: gatewayUrls,
    };
  } catch (error) {
    logEvent('warn', 'onebox.execute.receipt_pin_failed', {
      correlationId: options.correlationId,
      planHash,
      error: errorMessage(error),
    });
  }

  await applyExecutionReceiptAttestation(decorated, decorated.receipt ?? receiptRecord, {
    planHash,
    createdAt,
    txHashes,
  });

  return decorated;
}

async function applyExecutionReceiptAttestation(
  response: ExecuteResponseWithReceipt,
  receiptRecord: Record<string, unknown> | null,
  context: { planHash: string; createdAt: string; txHashes: string[] }
): Promise<void> {
  if (!receiptRecord) {
    return;
  }
  const attested = await decorateReceipt('EXECUTION', receiptRecord, {
    cid:
      response.receiptCid ?? response.deliverableCid ?? response.specCid ?? null,
    uri:
      response.receiptUri ?? response.deliverableUri ?? response.specUri ?? null,
    context: {
      planHash: context.planHash,
      createdAt: context.createdAt,
      jobId: response.jobId,
      txHashes: context.txHashes,
    },
  });
  response.receipt = attested.metadata;
  response.receiptDigest = attested.digest;
  response.receiptAttestationUid = attested.attestationUid;
  response.receiptAttestationTxHash = attested.attestationTxHash;
  response.receiptAttestationCid =
    attested.attestationCid ?? response.receiptCid ?? response.deliverableCid ?? null;
  response.receiptAttestationUri =
    attested.attestationUri ?? response.receiptUri ?? response.deliverableUri ?? null;
}

function collectTxHashes(response: ExecuteResponse): string[] {
  const hashes = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    hashes.add(trimmed);
  };
  if (Array.isArray(response.txHashes)) {
    for (const entry of response.txHashes) {
      push(entry);
    }
  }
  push(response.txHash);
  return Array.from(hashes);
}

function buildReceiptRecord(
  response: ExecuteResponse,
  planHash: string,
  createdAt: string,
  txHashes: string[]
): Record<string, unknown> | null {
  if (!txHashes.length) {
    return null;
  }

  const record: Record<string, unknown> = {
    planHash,
    jobId: response.jobId,
    txHashes,
    timestamp: createdAt,
  };

  const relevantCid = response.deliverableCid ?? response.specCid ?? response.receiptCid;
  if (relevantCid) {
    record.relevantCid = relevantCid;
  }
  if (response.specCid) {
    record.specCid = response.specCid;
  }
  if (response.deliverableCid) {
    record.deliverableCid = response.deliverableCid;
  }
  if (response.receiptUrl) {
    record.receiptUrl = response.receiptUrl;
  }
  if (response.reward) {
    record.reward = response.reward;
  }
  if (response.token) {
    record.token = response.token;
  }
  if (response.status) {
    record.status = response.status;
  }

  const fees: Record<string, unknown> = {};
  if (typeof response.feePct === 'number') {
    fees.feePct = response.feePct;
  }
  if (typeof response.feeAmount === 'string') {
    fees.feeAmount = response.feeAmount;
  }
  if (typeof response.burnPct === 'number') {
    fees.burnPct = response.burnPct;
  }
  if (typeof response.burnAmount === 'string') {
    fees.burnAmount = response.burnAmount;
  }
  if (Object.keys(fees).length > 0) {
    record.fees = fees;
  }

  return record;
}

interface FeeBreakdown {
  feeAmountWei: bigint;
  burnAmountWei: bigint;
}

function calculateFeeBreakdown(
  rewardWei: bigint,
  feePct: number,
  burnPct: number
): FeeBreakdown {
  return {
    feeAmountWei: multiplyByPercentage(rewardWei, feePct),
    burnAmountWei: multiplyByPercentage(rewardWei, burnPct),
  };
}

function multiplyByPercentage(value: bigint, percentage: number): bigint {
  if (!Number.isFinite(percentage) || percentage <= 0) {
    return 0n;
  }
  const basisPoints = toBasisPoints(percentage);
  if (basisPoints <= 0) {
    return 0n;
  }
  return (value * BigInt(basisPoints)) / 1_000_000n;
}

function toBasisPoints(percentage: number): number {
  if (!Number.isFinite(percentage)) {
    return 0;
  }
  return Math.round(percentage * 10_000);
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

interface PlannerSummaryOptions {
  tokenDecimals: number;
  feePct: number;
  burnPct: number;
}

function buildPlannerSummary(
  envelope: IntentEnvelope,
  intent: JobIntent,
  result: PlannerPlanResult,
  options: PlannerSummaryOptions
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
      const reward = formatRewardForSummary(intent.payload?.reward, options.tokenDecimals);
      const rewardToken = typeof intent.payload?.rewardToken === 'string' && intent.payload.rewardToken.trim()
        ? intent.payload.rewardToken.trim()
        : 'AGIALPHA';
      const deadlineRaw = Number(intent.payload?.deadlineDays ?? DEFAULT_DEADLINE_DAYS);
      const deadline = Number.isFinite(deadlineRaw) && deadlineRaw > 0 ? Math.round(deadlineRaw) : DEFAULT_DEADLINE_DAYS;
      const feePct = options.feePct;
      const burnPct = options.burnPct;
      summary = `Post job ${reward} ${rewardToken}, ${deadline} day${deadline === 1 ? '' : 's'}. Fee ${feePct}%, burn ${burnPct}%. Proceed?`;
      break;
    }
    case 'finalize_job':
      summary = `Finalize job ${formatJobId(intent.payload?.jobId)}. Proceed?`;
      break;
    case 'apply_job':
      summary = `Apply to job ${formatJobId(intent.payload?.jobId)}. Proceed?`;
      break;
    case 'validate':
      summary = `Submit ${String(intent.payload?.outcome ?? 'validation')} for job ${formatJobId(intent.payload?.jobId)}. Proceed?`;
      break;
    default:
      summary = `${result.message || `Run ${intent.action}`}. Proceed?`;
  }

  return { summary: ensureSummaryLimit(summary), warnings };
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

function formatRewardFromWei(value: bigint, decimals: number): string {
  const formatted = ethers.formatUnits(value, decimals);
  const [whole, fractional = ''] = formatted.split('.');
  const trimmedFraction = fractional.replace(/0+$/u, '').slice(0, 4);
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole;
}

function formatRewardForSummary(value: unknown, decimals: number): string {
  if (value === undefined || value === null) return '?';
  try {
    const wei =
      typeof value === 'bigint'
        ? value
        : typeof value === 'number'
        ? ethers.parseUnits(value.toString(), decimals)
        : ethers.parseUnits(String(value), decimals);
    return formatRewardFromWei(wei, decimals);
  } catch {
    return String(value);
  }
}

function ensureSummaryLimit(value: string): string {
  if (value.length <= 140) {
    return value;
  }
  const suffix = ' Proceed?';
  const base = value.replace(/\s*Proceed\?$/u, '');
  const truncated = base.slice(0, Math.max(0, 140 - suffix.length - 1)).trimEnd();
  return `${truncated}…${suffix}`;
}

function formatJobId(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return `#${value.replace(/^#/u, '')}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${Math.trunc(value)}`;
  }
  if (typeof value === 'bigint') {
    return `#${value.toString()}`;
  }
  return '#?';
}

function extractUserId(intent: JobIntent): string | undefined {
  const context = intent.userContext as { userId?: unknown } | undefined;
  if (context && typeof context.userId === 'string' && context.userId.trim()) {
    return context.userId.trim();
  }
  return undefined;
}

function extractCid(uri: string | undefined): string | null {
  if (!uri) return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('ipfs://')) {
    return trimmed.slice('ipfs://'.length);
  }
  const match = /\/ipfs\/([^/?#]+)/u.exec(trimmed);
  return match ? match[1] : null;
}

function buildGatewayUrls(uri: string | undefined): string[] {
  const cid = extractCid(uri);
  if (!cid) {
    return uri ? [uri] : [];
  }
  return [
    `https://w3s.link/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
  ];
}

function computePlanHash(envelope: IntentEnvelope): string {
  const canonical = stableStringify(envelope);
  return `0x${createHash('sha256').update(canonical).digest('hex')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const content = entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(',');
    return `{${content}}`;
  }
  return JSON.stringify(value);
}

function isZeroAddress(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^0x0{40}$/iu.test(value);
}
