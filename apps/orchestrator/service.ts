import path from 'path';
import { Contract, JsonRpcProvider, Wallet, ethers, Provider } from 'ethers';
import { IdentityManager, AgentIdentity } from './identity';
import {
  ClassificationResult,
  JobSpec,
  classifyJob,
  extractPipeline,
  fetchCommittedJobSpec,
  ChainJobSummary,
} from './jobClassifier';
import { buildPipeline, PipelineContext } from './pipeline';
import { runJob, JobRunResult } from './execution';
import { submitJobResult } from './submission';
import {
  CapabilityMatrix,
  loadCapabilityMatrix,
  fetchJobRequirements,
  ensureStake,
  selectAgent,
  DEFAULT_MIN_PROFIT_MARGIN,
  type SelectAgentOptions,
} from './bidding';
import { auditLog } from './audit';
import { AuditAnchoringService, AuditAnchoringOptions } from './anchoring';
import { getWatchdog } from './monitor';
import { postJob } from './employer';
import { evaluateSubmission, needsIndependentReview } from './validation';
import { SettlementJournal } from './settlementJournal';
import { requireComputerWorkAdmission } from './computerWork';
import { LearningCoordinator } from './learning';
import {
  CompletedJobEvidence,
  loadCompletedJobEvidence,
  persistCompletedJobEvidence,
  prepareJobDisputeEvidence,
  PreparedDisputeEvidence,
  recordDisputeResolution,
  toCompletedJobEvidence,
  OnChainJobSnapshot,
} from './disputes';
import { getJobEnergyLog } from './metrics';
import { EnergyPolicy, type EnergyPolicyOptions } from './energyPolicy';

interface AppliedJobState {
  identity: AgentIdentity;
  wallet: Wallet;
  classification: ClassificationResult;
  spec: JobSpec | null;
  summary: ChainJobSummary;
  execution?: { runResult: JobRunResult; resultRef: string; chainJob: any };
}

interface CommitData {
  wallet: Wallet;
  salt: string;
  approve: boolean;
}

const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId,address indexed employer,address indexed agent,uint256 reward,uint256 stake,uint256 fee,bytes32 specHash,string uri)',
  'event ApplicationSubmitted(uint256 indexed jobId,address indexed applicant,string subdomain)',
  'event AgentAssigned(uint256 indexed jobId,address indexed agent,string subdomain)',
  'event ResultSubmitted(uint256 indexed jobId,address indexed worker,bytes32 resultHash,string resultURI,string subdomain)',
  'event JobCompleted(uint256 indexed jobId,bool success)',
  'event JobFinalized(uint256 indexed jobId,address indexed worker)',
  'event JobCancelled(uint256 indexed jobId)',
  'event JobDisputed(uint256 indexed jobId,address indexed caller)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint128 burnReceiptAmount,bytes32 uriHash,bytes32 resultHash,bytes32 specHash,uint256 packedMetadata)',
  'function applyForJob(uint256 jobId,string subdomain,bytes32[] proof)',
  'function submit(uint256 jobId,bytes32 resultHash,string resultURI,string subdomain,bytes32[] proof)',
];

const STAKE_MANAGER_ABI = [
  'function stakeOf(address user,uint8 role) view returns (uint256)',
  'function depositStake(uint8 role,uint256 amount)',
];

const VALIDATION_MODULE_ABI = [
  'event ValidatorsSelected(uint256 indexed jobId,address[] validators)',
  'event ValidationCommitted(uint256 indexed jobId,address indexed validator,bytes32 commitHash,string subdomain)',
  'event ValidationRevealed(uint256 indexed jobId,address indexed validator,bool approve,bytes32 burnTxHash,string subdomain)',
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function validators(uint256 jobId) view returns (address[])',
  'function commitments(uint256 jobId,address validator,uint256 nonce) view returns (bytes32)',
  'function commitValidation(uint256 jobId,bytes32 commitHash,string subdomain,bytes32[] proof)',
  'function revealValidation(uint256 jobId,bool approve,bytes32 salt,string subdomain,bytes32[] proof)',
  'function selectValidators(uint256 jobId,uint256 entropy)',
];

const DISPUTE_MODULE_ABI = [
  'event DisputeRaised(uint256 indexed jobId,address indexed claimant,bytes32 evidenceHash)',
  'event DisputeResolved(uint256 indexed jobId,address indexed resolver,bool employerWins)',
];

const DEFAULT_ASSIGNMENT_POLL_MS = Number(
  process.env.ASSIGNMENT_POLL_INTERVAL_MS || 15000
);
const DEFAULT_REVEAL_DELAY_MS = Number(
  process.env.VALIDATION_REVEAL_DELAY_MS || 60000
);
const REVIEW_TIMEOUT_MS = Number(
  process.env.VALIDATION_REVIEW_TIMEOUT_MS || 10 * 60 * 1000
);

export interface MetaOrchestratorConfig {
  rpcUrl: string;
  jobRegistryAddress: string;
  stakeManagerAddress?: string;
  validationModuleAddress?: string;
  disputeModuleAddress?: string;
  reputationEngineAddress?: string;
  capabilityMatrixPath: string;
  identityDirectory?: string;
  skipEnsVerification?: boolean;
  ipfsGateway?: string;
}

function resolveConfig(): MetaOrchestratorConfig {
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  const jobRegistryAddress = process.env.JOB_REGISTRY_ADDRESS || '';
  if (!jobRegistryAddress) {
    throw new Error('JOB_REGISTRY_ADDRESS is required for orchestrator');
  }
  const capabilityMatrixPath =
    process.env.CAPABILITY_MATRIX_PATH ||
    path.resolve(__dirname, '../../config/agents.json');
  return {
    rpcUrl,
    jobRegistryAddress,
    stakeManagerAddress: process.env.STAKE_MANAGER_ADDRESS || undefined,
    validationModuleAddress: process.env.VALIDATION_MODULE_ADDRESS || undefined,
    disputeModuleAddress: process.env.DISPUTE_MODULE_ADDRESS || undefined,
    reputationEngineAddress: process.env.REPUTATION_ENGINE_ADDRESS || undefined,
    capabilityMatrixPath,
    identityDirectory: process.env.AGENT_IDENTITY_DIR || undefined,
    skipEnsVerification: process.env.SKIP_ENS_VERIFICATION === '1',
    ipfsGateway: process.env.IPFS_GATEWAY_URL || undefined,
  };
}

const JOB_STATE_OFFSET = 0n;
const JOB_SUCCESS_OFFSET = 3n;
const JOB_BURN_CONFIRMED_OFFSET = 4n;
const JOB_AGENT_TYPES_OFFSET = 5n;
const JOB_FEE_PCT_OFFSET = 13n;
const JOB_AGENT_PCT_OFFSET = 45n;
const JOB_DEADLINE_OFFSET = 77n;
const JOB_ASSIGNED_AT_OFFSET = 141n;

const JOB_STATE_MASK = 0x7n << JOB_STATE_OFFSET;
const JOB_SUCCESS_MASK = 0x1n << JOB_SUCCESS_OFFSET;
const JOB_BURN_CONFIRMED_MASK = 0x1n << JOB_BURN_CONFIRMED_OFFSET;
const JOB_AGENT_TYPES_MASK = 0xffn << JOB_AGENT_TYPES_OFFSET;
const JOB_FEE_PCT_MASK = 0xffffffffn << JOB_FEE_PCT_OFFSET;
const JOB_AGENT_PCT_MASK = 0xffffffffn << JOB_AGENT_PCT_OFFSET;
const JOB_DEADLINE_MASK = 0xffffffffffffffffn << JOB_DEADLINE_OFFSET;
const JOB_ASSIGNED_AT_MASK = 0xffffffffffffffffn << JOB_ASSIGNED_AT_OFFSET;

function decodePackedJobMetadata(packed: any): {
  state?: number;
  success?: boolean;
  burnConfirmed?: boolean;
  agentTypes?: number;
  feePct?: bigint;
  agentPct?: bigint;
  deadline?: bigint;
  assignedAt?: bigint;
} {
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
  return {
    state: Number((value & JOB_STATE_MASK) >> JOB_STATE_OFFSET),
    success: (value & JOB_SUCCESS_MASK) !== 0n,
    burnConfirmed: (value & JOB_BURN_CONFIRMED_MASK) !== 0n,
    agentTypes: Number(
      (value & JOB_AGENT_TYPES_MASK) >> JOB_AGENT_TYPES_OFFSET
    ),
    feePct: (value & JOB_FEE_PCT_MASK) >> JOB_FEE_PCT_OFFSET,
    agentPct: (value & JOB_AGENT_PCT_MASK) >> JOB_AGENT_PCT_OFFSET,
    deadline: (value & JOB_DEADLINE_MASK) >> JOB_DEADLINE_OFFSET,
    assignedAt: (value & JOB_ASSIGNED_AT_MASK) >> JOB_ASSIGNED_AT_OFFSET,
  };
}

function toSubdomain(identity: AgentIdentity): string {
  if (identity.ens) {
    const parts = identity.ens.split('.');
    if (parts.length > 0) return parts[0];
  }
  if (identity.label) return identity.label;
  return identity.address;
}

function filterCapabilityMatrix(
  matrix: CapabilityMatrix,
  identities: IdentityManager
): CapabilityMatrix {
  const filtered: CapabilityMatrix = {};
  for (const [category, agents] of Object.entries(matrix)) {
    filtered[category] = agents.filter((agent) =>
      identities.getByAddress(agent.address)
    );
  }
  return filtered;
}

export class MetaOrchestrator {
  private readonly config: MetaOrchestratorConfig;
  private readonly provider: JsonRpcProvider;
  private readonly identityManager: IdentityManager;
  private registry!: Contract;
  private stakeManager: Contract | null = null;
  private validationModule: Contract | null = null;
  private disputeModule: Contract | null = null;
  private capabilityMatrix: CapabilityMatrix = {};
  private orchestratorIdentity: AgentIdentity | undefined;
  private validatorIdentities: AgentIdentity[] = [];
  private auditAnchor: AuditAnchoringService | null = null;
  private energyPolicy: EnergyPolicy | null = null;
  private readonly appliedJobs = new Map<string, AppliedJobState>();
  private readonly assignmentTimers = new Map<string, NodeJS.Timeout>();
  private readonly commitTimers = new Map<string, NodeJS.Timeout>();
  private readonly commits = new Map<string, CommitData>();
  private readonly reviewTimers = new Map<string, NodeJS.Timeout>();
  private readonly reviewSources = new Map<string, string>();
  private readonly fallbackSelections = new Set<string>();
  private readonly completedJobs = new Map<string, CompletedJobEvidence>();
  private readonly disputeEvidence = new Map<string, PreparedDisputeEvidence>();
  private readonly watchdog = getWatchdog();
  private readonly learning = new LearningCoordinator();
  private running = false;
  private settlementJournal!: SettlementJournal;
  private settlementRecoveryTimer: NodeJS.Timeout | null = null;
  private recoveringSettlements = false;

  constructor(config?: Partial<MetaOrchestratorConfig>) {
    this.config = { ...resolveConfig(), ...(config ?? {}) };
    this.provider = new JsonRpcProvider(this.config.rpcUrl);
    this.identityManager = new IdentityManager(this.provider, {
      skipEnsVerification: this.config.skipEnsVerification,
    });
  }

  async bootstrap(): Promise<void> {
    await this.identityManager.load({
      directory: this.config.identityDirectory,
    });
    this.orchestratorIdentity =
      this.identityManager.getPrimary('business') ||
      this.identityManager.getPrimary('employer');
    this.validatorIdentities = this.identityManager.listByRole('validator');
    this.capabilityMatrix = filterCapabilityMatrix(
      loadCapabilityMatrix(this.config.capabilityMatrixPath),
      this.identityManager
    );
    await this.instantiateContracts();
    await this.initializeAuditAnchoring();
    this.initializeEnergyPolicy();
    this.loadCompletedEvidenceCache();
    const network = await this.provider.getNetwork();
    this.settlementJournal = new SettlementJournal(
      process.env.ORCHESTRATOR_SETTLEMENT_STATE_DIR ||
        path.resolve('storage/orchestrator/settlement'),
      `${network.chainId}:${this.config.jobRegistryAddress.toLowerCase()}`
    );
    this.restorePendingSettlements();
  }

  private async instantiateContracts(): Promise<void> {
    this.registry = new Contract(
      this.config.jobRegistryAddress,
      JOB_REGISTRY_ABI,
      this.provider
    );
    if (this.config.stakeManagerAddress) {
      this.stakeManager = new Contract(
        this.config.stakeManagerAddress,
        STAKE_MANAGER_ABI,
        this.provider
      );
    }
    if (this.config.validationModuleAddress) {
      this.validationModule = new Contract(
        this.config.validationModuleAddress,
        VALIDATION_MODULE_ABI,
        this.provider
      );
    }
    if (this.config.disputeModuleAddress) {
      this.disputeModule = new Contract(
        this.config.disputeModuleAddress,
        DISPUTE_MODULE_ABI,
        this.provider
      );
    }
  }

  private async initializeAuditAnchoring(): Promise<void> {
    const maybeNumber = (value: string | undefined): number | undefined => {
      if (value === undefined) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    let wallet: Wallet | null = null;
    const overrideKey = process.env.AUDIT_ANCHOR_PRIVATE_KEY;
    if (overrideKey) {
      try {
        wallet = new Wallet(overrideKey, this.provider);
      } catch (err) {
        console.warn(
          'Invalid AUDIT_ANCHOR_PRIVATE_KEY provided; falling back to orchestrator identity.',
          err
        );
        wallet = null;
      }
    }

    if (!wallet && this.orchestratorIdentity) {
      wallet = this.orchestratorIdentity.wallet.connect(this.provider);
    }

    if (!wallet) {
      console.warn(
        'Audit anchoring disabled: no orchestrator identity or AUDIT_ANCHOR_PRIVATE_KEY available.'
      );
      return;
    }

    const options: AuditAnchoringOptions = {
      provider: this.provider,
      wallet,
    };
    if (process.env.AUDIT_ANCHOR_ADDRESS) {
      options.anchorAddress = process.env.AUDIT_ANCHOR_ADDRESS;
    }
    if (process.env.AUDIT_ANCHOR_STATE_FILE) {
      options.stateFile = process.env.AUDIT_ANCHOR_STATE_FILE;
    }
    const interval = maybeNumber(process.env.AUDIT_ANCHOR_INTERVAL_MS);
    if (interval !== undefined) {
      options.intervalMs = interval;
    }
    const minAge = maybeNumber(process.env.AUDIT_ANCHOR_MIN_FILE_AGE_MS);
    if (minAge !== undefined) {
      options.minFileAgeMs = minAge;
    }
    const maxFiles = maybeNumber(process.env.AUDIT_ANCHOR_MAX_FILES);
    if (maxFiles !== undefined) {
      options.maxFilesPerRun = maxFiles;
    }

    this.auditAnchor = new AuditAnchoringService(options);
    await this.auditAnchor.initialize();
  }

  private initializeEnergyPolicy(): void {
    const disabled = process.env.DISABLE_DYNAMIC_ENERGY_POLICY;
    if (disabled && disabled.trim().toLowerCase() !== '' && disabled !== '0') {
      const normalized = disabled.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
        this.energyPolicy = null;
        auditLog('energyPolicy.disabled', {
          actor: this.orchestratorIdentity?.address,
          details: {},
        });
        return;
      }
    }

    const parseNumeric = (value: string | undefined): number | undefined => {
      if (value === undefined) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const options: EnergyPolicyOptions = {};
    const efficiencyFloor = parseNumeric(
      process.env.ENERGY_POLICY_MIN_EFFICIENCY
    );
    if (efficiencyFloor !== undefined) {
      options.efficiencyFloor = efficiencyFloor;
    }
    const maxEnergy = parseNumeric(process.env.ENERGY_POLICY_MAX_ENERGY);
    if (maxEnergy !== undefined) {
      options.energyCeiling = maxEnergy;
    }
    const efficiencySigma = parseNumeric(
      process.env.ENERGY_POLICY_EFFICIENCY_SIGMA
    );
    if (efficiencySigma !== undefined) {
      options.efficiencyStdMultiplier = efficiencySigma;
    }
    const energySigma = parseNumeric(process.env.ENERGY_POLICY_ENERGY_SIGMA);
    if (energySigma !== undefined) {
      options.energyStdMultiplier = energySigma;
    }
    const efficiencyBias = parseNumeric(
      process.env.ENERGY_POLICY_EFFICIENCY_BIAS
    );
    if (efficiencyBias !== undefined) {
      options.efficiencyBias = efficiencyBias;
    }
    const energyBias = parseNumeric(process.env.ENERGY_POLICY_ENERGY_BIAS);
    if (energyBias !== undefined) {
      options.energyBias = energyBias;
    }
    const lookback = parseNumeric(process.env.ENERGY_POLICY_LOOKBACK);
    if (lookback !== undefined) {
      options.lookbackJobs = Math.trunc(lookback);
    }
    const refreshMs = parseNumeric(process.env.ENERGY_POLICY_REFRESH_MS);
    if (refreshMs !== undefined) {
      options.refreshIntervalMs = Math.trunc(refreshMs);
    }
    const fallback = process.env.ENERGY_POLICY_FALLBACK_GLOBAL;
    if (fallback !== undefined) {
      const normalized = fallback.trim().toLowerCase();
      options.fallbackToGlobal = !['0', 'false', 'no'].includes(normalized);
    }
    const anomalyWeight = parseNumeric(
      process.env.ENERGY_POLICY_ANOMALY_WEIGHT
    );
    if (anomalyWeight !== undefined) {
      options.anomalyProfitWeight = anomalyWeight;
    }
    const volatilityWeight = parseNumeric(
      process.env.ENERGY_POLICY_VOLATILITY_WEIGHT
    );
    if (volatilityWeight !== undefined) {
      options.volatilityProfitWeight = volatilityWeight;
    }
    const maxProfitMargin = parseNumeric(
      process.env.ENERGY_POLICY_MAX_PROFIT_MARGIN
    );
    if (maxProfitMargin !== undefined) {
      options.maxProfitMargin = maxProfitMargin;
    }

    const baseProfit = parseNumeric(
      process.env.ENERGY_POLICY_BASE_PROFIT_MARGIN
    );
    options.baseProfitMargin =
      baseProfit !== undefined ? baseProfit : DEFAULT_MIN_PROFIT_MARGIN;

    try {
      this.energyPolicy = new EnergyPolicy(options);
      this.energyPolicy.refresh();
      auditLog('energyPolicy.initialized', {
        actor: this.orchestratorIdentity?.address,
        details: {
          baseProfitMargin: this.energyPolicy.getBaseProfitMargin(),
          efficiencyFloor: options.efficiencyFloor,
          energyCeiling: options.energyCeiling,
          lookbackJobs: options.lookbackJobs,
          refreshIntervalMs: options.refreshIntervalMs,
          fallbackToGlobal: options.fallbackToGlobal,
        },
      });
    } catch (err) {
      console.warn('Failed to initialize energy policy', err);
      this.energyPolicy = null;
    }
  }

  private loadCompletedEvidenceCache(): void {
    try {
      const records = loadCompletedJobEvidence();
      this.completedJobs.clear();
      for (const [jobId, record] of records.entries()) {
        this.completedJobs.set(jobId, record);
      }
    } catch (err) {
      console.warn('Failed to load completed job evidence cache', err);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.restorePendingSettlements();
    this.registerEventHandlers();
    void this.recoverSettledOutcomes();
    this.settlementRecoveryTimer = setInterval(
      () => void this.recoverSettledOutcomes(),
      30_000
    );
    this.auditAnchor?.start();
    auditLog('orchestrator.started', {
      actor: this.orchestratorIdentity?.address,
      details: {
        validators: this.validatorIdentities.map((v) => v.address),
        agents: this.identityManager.listByRole('agent').map((a) => a.address),
      },
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.auditAnchor?.stop();
    if (this.settlementRecoveryTimer)
      clearInterval(this.settlementRecoveryTimer);
    this.settlementRecoveryTimer = null;
    this.registry.removeAllListeners();
    if (this.validationModule) this.validationModule.removeAllListeners();
    if (this.disputeModule) this.disputeModule.removeAllListeners();
    for (const timer of this.assignmentTimers.values()) clearInterval(timer);
    for (const timer of this.commitTimers.values()) clearTimeout(timer);
    for (const timer of this.reviewTimers.values()) clearTimeout(timer);
    this.assignmentTimers.clear();
    this.commitTimers.clear();
    this.reviewTimers.clear();
    this.reviewSources.clear();
    this.fallbackSelections.clear();
    this.appliedJobs.clear();
    this.commits.clear();
    this.disputeEvidence.clear();
  }

  private registerEventHandlers(): void {
    this.registry.on(
      'JobCreated',
      (
        jobId: bigint,
        employer: string,
        agent: string,
        reward: bigint,
        stake: bigint,
        fee: bigint,
        specHash: string,
        uri: string
      ) => {
        if (!this.running) return;
        const summary: ChainJobSummary = {
          jobId: jobId.toString(),
          employer,
          agent,
          reward: reward.toString(),
          stake: stake.toString(),
          uri,
          specHash,
        };
        this.handleJobCreated(summary).catch((err) => {
          console.error('JobCreated handler failed', err);
        });
      }
    );

    this.registry.on('JobCompleted', (jobId: bigint, success: boolean) => {
      this.recordSettledOutcome(jobId.toString())
        .then(() => {
          if (!this.appliedJobs.get(jobId.toString())?.execution)
            this.appliedJobs.delete(jobId.toString());
        })
        .catch((err) => {
          console.error('Settled outcome recording failed', err);
        });
      auditLog('job.completed', {
        jobId: jobId.toString(),
        details: { success },
      });
      if (this.auditAnchor) {
        this.auditAnchor
          .trigger()
          .catch((err) => console.error('audit anchor trigger failed', err));
      }
      const key = jobId.toString();
      const timer = this.assignmentTimers.get(key);
      if (timer) clearInterval(timer);
      this.assignmentTimers.delete(key);
      this.clearReviewTimer(key, 'job-completed');
    });

    this.registry.on('JobFinalized', (jobId: bigint) => {
      this.recordSettledOutcome(jobId.toString()).catch((error) =>
        console.error(
          'Finalized outcome recording failed; journal retained',
          error
        )
      );
    });

    this.registry.on('JobCancelled', (jobId: bigint) => {
      const key = jobId.toString();
      this.appliedJobs.delete(key);
      const timer = this.assignmentTimers.get(key);
      if (timer) clearInterval(timer);
      this.assignmentTimers.delete(key);
      this.clearReviewTimer(key, 'job-cancelled');
      auditLog('job.cancelled', { jobId: key, details: {} });
      if (this.auditAnchor) {
        this.auditAnchor
          .trigger()
          .catch((err) => console.error('audit anchor trigger failed', err));
      }
    });

    this.registry.on(
      'ResultSubmitted',
      (
        jobId: bigint,
        worker: string,
        resultHash: string,
        resultUri: string,
        subdomain: string
      ) => {
        if (!this.running) return;
        const key = jobId.toString();
        this.beginReviewPhase(key, 'submission-detected');
      }
    );

    this.registry.on('JobDisputed', (jobId: bigint, caller: string) => {
      if (!this.running) return;
      this.handleJobDisputed(jobId, caller).catch((err) => {
        console.error('JobDisputed handler failed', err);
      });
    });

    if (this.validationModule) {
      this.validationModule.on(
        'ValidatorsSelected',
        (jobId: bigint, validators: string[]) => {
          this.handleValidatorsSelected(jobId, validators).catch((err) => {
            console.error('Validator handler failed', err);
          });
        }
      );
      this.validationModule.on(
        'ValidationCommitted',
        (jobId: bigint, validator: string) => {
          if (!this.running) return;
          this.handleValidationProgress(jobId, validator, 'commit');
        }
      );
      this.validationModule.on(
        'ValidationRevealed',
        (jobId: bigint, validator: string) => {
          if (!this.running) return;
          this.handleValidationProgress(jobId, validator, 'reveal');
        }
      );
    }

    if (this.disputeModule) {
      this.disputeModule.on(
        'DisputeRaised',
        (jobId: bigint, claimant: string, evidenceHash: string) => {
          if (!this.running) return;
          this.handleDisputeRaised(jobId, claimant, evidenceHash).catch(
            (err) => {
              console.error('DisputeRaised handler failed', err);
            }
          );
        }
      );
      this.disputeModule.on(
        'DisputeResolved',
        (jobId: bigint, resolver: string, employerWins: boolean) => {
          if (!this.running) return;
          this.handleDisputeResolved(jobId, resolver, employerWins).catch(
            (err) => {
              console.error('DisputeResolved handler failed', err);
            }
          );
        }
      );
    }
  }

  private beginReviewPhase(jobId: string, source: string): void {
    this.reviewSources.set(jobId, source);
    if (this.reviewTimers.has(jobId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.handleReviewTimeout(jobId).catch((err) => {
        console.error('review timeout handler failed', err);
      });
    }, REVIEW_TIMEOUT_MS);
    this.reviewTimers.set(jobId, timer);
    this.fallbackSelections.delete(jobId);
    auditLog('validation.review_started', {
      jobId,
      details: { source, timeoutMs: REVIEW_TIMEOUT_MS },
    });
  }

  private clearReviewTimer(jobId: string, reason?: string): void {
    const timer = this.reviewTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
    }
    const hadTimer = this.reviewTimers.delete(jobId);
    const source = this.reviewSources.get(jobId);
    this.reviewSources.delete(jobId);
    this.fallbackSelections.delete(jobId);
    if (hadTimer && reason) {
      auditLog('validation.review_cleared', {
        jobId,
        details: { reason, source },
      });
    }
  }

  private async handleReviewTimeout(jobId: string): Promise<void> {
    const source = this.reviewSources.get(jobId) ?? 'unknown';
    this.clearReviewTimer(jobId, 'review-timeout');
    try {
      await this.triggerFallbackValidator(BigInt(jobId), 'timeout');
    } catch (err) {
      console.error('fallback validator dispatch failed', err);
      auditLog('validator.fallback_failed', {
        jobId,
        details: {
          reason: 'timeout',
          source,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private handleValidationProgress(
    jobId: bigint,
    validator: string,
    phase: 'commit' | 'reveal'
  ): void {
    const key = jobId.toString();
    if (!this.reviewTimers.has(key)) return;
    this.clearReviewTimer(key, `on-${phase}`);
    auditLog('validation.review_progress', {
      jobId: key,
      actor: validator,
      details: { phase },
    });
  }

  private getFallbackValidatorIdentity(): AgentIdentity | undefined {
    return (
      this.identityManager.getPrimary('validator') ||
      this.validatorIdentities[0]
    );
  }

  private async triggerFallbackValidator(
    jobId: bigint,
    reason: 'empty-selection' | 'timeout'
  ): Promise<void> {
    if (!this.validationModule) return;
    const jobKey = jobId.toString();
    if (this.fallbackSelections.has(jobKey)) return;
    const identity = this.getFallbackValidatorIdentity();
    if (!identity) return;
    this.fallbackSelections.add(jobKey);
    const wallet = identity.wallet.connect(this.provider);
    const writer = this.validationModule.connect(wallet) as any;
    const entropy = ethers.hexlify(ethers.randomBytes(32));
    try {
      const tx = await writer.selectValidators(jobId, entropy);
      await tx.wait();
      auditLog('validator.fallback', {
        jobId: jobKey,
        actor: identity.address,
        details: {
          reason,
          entropy,
          tx: tx.hash,
        },
      });
    } catch (err) {
      this.fallbackSelections.delete(jobKey);
      throw err;
    }
    try {
      await this.commitValidation(jobId, identity);
    } catch (err) {
      console.error('fallback commitValidation failed', err);
      auditLog('validator.fallback_commit_failed', {
        jobId: jobKey,
        actor: identity.address,
        details: {
          reason,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      this.fallbackSelections.delete(jobKey);
    }
  }

  private async handleJobCreated(summary: ChainJobSummary): Promise<void> {
    if (summary.agent && summary.agent !== ethers.ZeroAddress) {
      return;
    }
    const spec = await fetchCommittedJobSpec(
      summary.uri,
      summary.specHash,
      this.config.ipfsGateway
    );
    const classification = classifyJob(summary, spec ?? undefined);
    // Constructing stages is read-only: reject inconsistent categories, custom
    // computer stages and unapproved endpoints before economic commitment.
    buildPipeline(
      {
        jobId: summary.jobId,
        category: classification.category,
        tags: classification.tags,
        metadata: spec?.metadata,
      },
      extractPipeline(spec ?? undefined)
    );
    if (classification.category === 'computer-work') {
      // Admission must precede selection, stake deposits and applyForJob.
      // The handler reloads operator policy before any eventual dispatch.
      requireComputerWorkAdmission(summary.jobId, spec?.metadata?.computerWork);
    }
    auditLog('job.detected', {
      jobId: summary.jobId,
      details: {
        classification,
        uri: summary.uri,
        employer: summary.employer,
      },
    });
    const decision = await this.selectAgent(summary, classification, spec);
    const agentIdentity = decision.identity;
    if (!agentIdentity) {
      auditLog('job.skipped', {
        jobId: summary.jobId,
        details: {
          reason: decision.skipReason ?? 'no-eligible-agent',
          category: classification.category,
        },
      });
      await this.learning.recordJobSkipped({
        jobId: summary.jobId,
        classification,
        spec,
        reason: decision.skipReason ?? 'no-eligible-agent',
      });
      return;
    }
    await this.applyForJob(summary, classification, spec, agentIdentity);
  }

  private async selectAgent(
    summary: ChainJobSummary,
    classification: ClassificationResult,
    spec: JobSpec | null
  ): Promise<{ identity: AgentIdentity | null; skipReason?: string }> {
    const category = classification.category;
    if (this.config.reputationEngineAddress) {
      try {
        const matrix = this.capabilityMatrix;
        const candidates = matrix[category] ?? [];
        if (candidates.length === 0) {
          return { identity: this.fallbackAgent(category) };
        }
        const provider: Provider = this.provider;
        const reputationEngine = this.config.reputationEngineAddress;
        const requirements = await fetchJobRequirements(
          summary.jobId,
          provider
        );
        const requiredSkills =
          spec?.requiredSkills ?? classification.spec?.requiredSkills ?? [];
        const baseProfitMargin =
          spec?.thermodynamics?.minProfitMargin ??
          classification.spec?.thermodynamics?.minProfitMargin ??
          this.energyPolicy?.getBaseProfitMargin();
        const selectionOptions: SelectAgentOptions = {
          provider,
          jobId: summary.jobId,
          minEfficiencyScore:
            classification.spec?.thermodynamics?.minEfficiency,
          maxEnergyScore: classification.spec?.thermodynamics?.maxEnergy,
          requiredSkills,
          reward: requirements.reward,
          requiredStake: requirements.stake,
          stakeManagerAddress: this.config.stakeManagerAddress,
          energyPolicy: this.energyPolicy ?? undefined,
        };
        if (baseProfitMargin !== undefined) {
          selectionOptions.minProfitMargin = baseProfitMargin;
        }
        const decision = await selectAgent(
          category,
          matrix,
          reputationEngine,
          selectionOptions
        );
        if (decision.skipReason) {
          return { identity: null, skipReason: decision.skipReason };
        }
        if (decision.agent) {
          const identity = this.identityManager.getByAddress(
            decision.agent.address
          );
          if (identity) {
            return { identity };
          }
        }
      } catch (err) {
        console.warn('selectAgent failed, falling back', err);
      }
    }
    return { identity: this.fallbackAgent(category) };
  }

  private fallbackAgent(category: string): AgentIdentity | null {
    const agents = this.identityManager.listByRole('agent');
    if (agents.length === 0) return null;
    const matching = agents.filter((agent) =>
      agent.capabilities.some((cap) => cap === category || cap === 'general')
    );
    if (matching.length > 0) {
      return matching.sort((a, b) => a.address.localeCompare(b.address))[0];
    }
    return agents[0];
  }

  private async applyForJob(
    summary: ChainJobSummary,
    classification: ClassificationResult,
    spec: JobSpec | null,
    identity: AgentIdentity
  ): Promise<void> {
    const wallet = identity.wallet.connect(this.provider);
    const requirements = await fetchJobRequirements(
      summary.jobId,
      this.provider
    );
    if (this.stakeManager) {
      await ensureStake(wallet, requirements.stake, this.provider);
    }
    const registry = this.registry.connect(wallet) as any;
    const subdomain = toSubdomain(identity);
    const tx = await registry.applyForJob(summary.jobId, subdomain, []);
    await tx.wait();
    auditLog('job.applied', {
      actor: identity.address,
      jobId: summary.jobId,
      details: {
        category: classification.category,
        subdomain,
        tx: tx.hash,
      },
    });
    this.appliedJobs.set(summary.jobId, {
      identity,
      wallet,
      classification,
      spec,
      summary,
    });
    this.monitorAssignment(summary.jobId).catch((err) => {
      console.error('monitorAssignment error', err);
    });
  }

  private async monitorAssignment(jobId: string): Promise<void> {
    if (this.assignmentTimers.has(jobId)) return;
    const timer = setInterval(async () => {
      try {
        const job = await this.registry.jobs(jobId);
        const state = this.appliedJobs.get(jobId);
        if (!state) {
          clearInterval(timer);
          this.assignmentTimers.delete(jobId);
          return;
        }
        const assigned = (job.agent as string) || ethers.ZeroAddress;
        if (assigned.toLowerCase() === state.wallet.address.toLowerCase()) {
          clearInterval(timer);
          this.assignmentTimers.delete(jobId);
          await this.executeAssignedJob(jobId, state, job);
        }
      } catch (err) {
        console.warn('Assignment poll failed', err);
      }
    }, DEFAULT_ASSIGNMENT_POLL_MS);
    this.assignmentTimers.set(jobId, timer);
  }

  private async executeAssignedJob(
    jobId: string,
    state: AppliedJobState,
    chainJob: any
  ): Promise<void> {
    auditLog('job.assigned', {
      jobId,
      actor: state.identity.address,
      details: {
        category: state.classification.category,
        employer: chainJob.employer,
        reward: chainJob.reward?.toString?.(),
        stake: chainJob.stake?.toString?.(),
      },
    });
    const pipelineContext: PipelineContext = {
      jobId,
      category: state.classification.category,
      tags: state.classification.tags,
      metadata: state.spec?.metadata,
    };
    const stages = buildPipeline(
      pipelineContext,
      extractPipeline(state.spec ?? undefined)
    );
    const initialInput = {
      jobId,
      spec: state.spec,
      classification: state.classification,
      onChain: {
        reward: chainJob.reward?.toString?.(),
        stake: chainJob.stake?.toString?.(),
        employer: chainJob.employer,
      },
    };
    try {
      const runResult = await runJob(jobId, stages, initialInput);
      if (!runResult.stageCids.length) {
        throw new Error('No artifacts generated by pipeline');
      }
      const artifactCid = runResult.manifestCid;
      const resultRef = artifactCid.startsWith('ipfs://')
        ? artifactCid
        : `ipfs://${artifactCid}`;
      state.execution = {
        runResult,
        resultRef,
        chainJob: {
          employer: chainJob.employer,
          agent: chainJob.agent,
          reward: chainJob.reward?.toString(),
          stake: chainJob.stake?.toString(),
          packedMetadata: chainJob.packedMetadata?.toString(),
        },
      };
      this.settlementJournal.save({
        jobId,
        agentAddress: state.identity.address,
        fromBlock: await this.provider.getBlockNumber(),
        classification: state.classification,
        spec: state.spec,
        summary: state.summary,
        execution: state.execution,
      });
      if (!this.settlementJournal.claimSubmission(jobId))
        throw new Error('Submission outcome requires operator reconciliation');
      await submitJobResult(
        this.registry.connect(state.wallet) as Contract,
        jobId,
        runResult.manifest,
        resultRef,
        toSubdomain(state.identity)
      );
      this.beginReviewPhase(jobId, 'evidence-submitted');
      this.recordCompletedJob(jobId, state, runResult, resultRef, chainJob);
      auditLog('job.submitted', {
        jobId,
        actor: state.identity.address,
        details: {
          resultRef,
          manifestCid: runResult.manifestCid,
          manifestUrl: runResult.manifestUrl,
          finalStageCid: runResult.finalCid,
          stages: stages.map((s) => s.name),
          stageCount: runResult.snapshot.stageCount,
          keywords: runResult.snapshot.keywords.slice(0, 12),
        },
      });
      // Positive learning credit and dependent jobs wait for final settlement.
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.watchdog.recordFailure(state.identity.address, message);
      auditLog('job.execution_failed', {
        jobId,
        actor: state.identity.address,
        details: { error: message },
      });
      if (!state.execution)
        await this.learning.recordJobOutcome({
          jobId,
          identity: state.identity,
          classification: state.classification,
          spec: state.spec,
          summary: state.summary,
          chainJob,
          success: false,
          errorMessage: message,
        });
      throw err;
    }
  }

  private async recordSettledOutcome(jobId: string): Promise<void> {
    const state = this.appliedJobs.get(jobId);
    if (!state?.execution) return;
    // Validation may be reversed by a dispute. Train/spawn only after contract
    // finalization is also visible at the RPC's finalized consensus block.
    const job = await this.registry.jobs(jobId, { blockTag: 'finalized' });
    const finalState = decodePackedJobMetadata(job.packedMetadata);
    if (finalState.state !== 6) return;
    const success = finalState.success === true;
    const execution = state.execution;
    if (!this.settlementJournal.claim(jobId, success)) {
      auditLog('job.settlement_reconciliation_required', {
        jobId,
        details: {
          reason:
            'Outcome already claimed; inspect durable journal before any retry.',
        },
      });
      return;
    }
    await this.learning.recordJobOutcome({
      jobId,
      identity: state.identity,
      classification: state.classification,
      spec: state.spec,
      summary: state.summary,
      ...execution,
      success,
    });
    if (success) await this.spawnSubtasks(jobId, state.spec);
    this.settlementJournal.complete(jobId);
    delete state.execution;
    this.appliedJobs.delete(jobId);
  }

  private restorePendingSettlements(): void {
    for (const record of this.settlementJournal.pending()) {
      const identity = this.identityManager.getByAddress(record.agentAddress);
      if (!identity)
        throw new Error(
          `Missing identity for pending job ${record.jobId}; restore it before starting`
        );
      this.appliedJobs.set(record.jobId, {
        identity,
        wallet: identity.wallet.connect(this.provider),
        classification: record.classification,
        spec: record.spec,
        summary: record.summary,
        execution: record.execution,
      });
    }
  }

  private async recoverSettledOutcomes(): Promise<void> {
    if (this.recoveringSettlements) return;
    this.recoveringSettlements = true;
    try {
      for (const record of this.settlementJournal.pending()) {
        try {
          await this.recoverPreparedSubmission(record.jobId);
          await this.recordSettledOutcome(record.jobId);
        } catch (error) {
          console.error(
            `Pending job ${record.jobId} recovery failed; journal retained`,
            error
          );
        }
      }
    } catch (error) {
      console.error('Pending outcome recovery failed; journal retained', error);
    } finally {
      this.recoveringSettlements = false;
    }
  }

  private async recoverPreparedSubmission(jobId: string): Promise<void> {
    const state = this.appliedJobs.get(jobId);
    if (!state?.execution) return;
    const job = await this.registry.jobs(jobId);
    const metadata = decodePackedJobMetadata(job.packedMetadata);
    if ([3, 4, 5].includes(metadata.state ?? -1)) {
      const { runResult, resultRef } = state.execution;
      const expectedHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(runResult.manifest))
      );
      if (
        String(job.agent).toLowerCase() !==
          state.identity.address.toLowerCase() ||
        job.resultHash !== expectedHash
      )
        throw new Error(
          'Saved execution does not match the on-chain submission'
        );
      // Submission may have mined just before the process exited. Rebuild local
      // review/dispute evidence from the verified journal without broadcasting.
      if (!this.completedJobs.has(jobId))
        this.recordCompletedJob(jobId, state, runResult, resultRef, job);
      if (metadata.state === 3) {
        this.beginReviewPhase(jobId, 'submission-recovered');
        if (this.validationModule && this.validatorIdentities.length) {
          const validators = await this.validationModule.validators(jobId);
          await this.handleValidatorsSelected(BigInt(jobId), [...validators]);
        }
      } else {
        this.clearReviewTimer(jobId, 'submission-already-reviewed');
        if (metadata.state === 5)
          await this.prepareDisputeEvidenceForJob(jobId, {
            source: 'recovered-on-chain-dispute',
          });
      }
      return;
    }
    if (metadata.state !== 2) return; // Only an assigned, unsubmitted job may resume.
    if (
      String(job.agent).toLowerCase() !==
        state.identity.address.toLowerCase() ||
      job.resultHash !== ethers.ZeroHash
    )
      throw new Error(
        'Pending submission does not match the current on-chain assignment'
      );
    if (!this.settlementJournal.claimSubmission(jobId)) {
      auditLog('job.submission_reconciliation_required', {
        jobId,
        details: {
          reason:
            'A submission attempt may already have broadcast; inspect chain and wallet nonce before retry.',
        },
      });
      return;
    }
    const { runResult, resultRef, chainJob } = state.execution;
    await submitJobResult(
      this.registry.connect(state.wallet) as Contract,
      jobId,
      runResult.manifest,
      resultRef,
      toSubdomain(state.identity)
    );
    this.beginReviewPhase(jobId, 'evidence-submitted');
    this.recordCompletedJob(jobId, state, runResult, resultRef, chainJob);
  }

  private async validationContext(
    jobId: bigint
  ): Promise<{ classification: ClassificationResult; spec: JobSpec | null }> {
    // Cached classifications never authorize a vote. The saved URI is useful
    // after restart, but must match the contract's immutable URI commitment.
    let uri = this.appliedJobs.get(jobId.toString())?.summary?.uri;
    let specHash: string;
    if (typeof uri === 'string') {
      const job = await this.registry.jobs(jobId);
      if (ethers.keccak256(ethers.toUtf8Bytes(uri)) !== job.uriHash)
        throw new Error('Saved specification URI does not match the contract');
      specHash = job.specHash;
    } else {
      const latest = await this.provider.getBlockNumber();
      const filter = this.registry.filters.JobCreated(jobId);
      const find = (events: any[]) =>
        events.find((item) => item.args && !item.removed);
      let event: any;
      try {
        // Indexed event lookup covers the complete history, including week-long
        // jobs on fast-block chains. Most archival RPCs serve this in one call.
        event = find(await this.registry.queryFilter(filter, 0, latest));
      } catch {
        // Providers with getLogs range limits need bounded pages, not an age
        // cutoff. A failed page propagates so unavailable history fails closed.
        for (let to = latest; to >= 0 && !event; to -= 2000)
          event = find(
            await this.registry.queryFilter(filter, Math.max(0, to - 1999), to)
          );
      }
      if (!event)
        throw new Error('Authoritative job specification unavailable');
      uri = event.args.uri ?? event.args[7];
      specHash = event.args.specHash ?? event.args[6];
    }
    const spec = await fetchCommittedJobSpec(
      uri,
      specHash,
      this.config.ipfsGateway
    );
    return {
      classification: classifyJob(
        { jobId: jobId.toString(), uri },
        spec ?? undefined
      ),
      spec,
    };
  }

  private async spawnSubtasks(
    jobId: string,
    spec: JobSpec | null
  ): Promise<void> {
    if (!spec?.subtasks?.length) return;
    const employer =
      this.orchestratorIdentity ?? this.identityManager.getPrimary('employer');
    if (!employer) return;
    const wallet = employer.wallet.connect(this.provider);
    for (const subtask of spec.subtasks) {
      try {
        await postJob({
          wallet,
          reward: subtask.reward,
          deadline: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
          dependencies: [jobId],
          metadata: {
            parent: jobId,
            description: subtask.description,
            createdBy: 'meta-orchestrator',
          },
        });
      } catch (err) {
        console.warn(
          'Failed to spawn subtask; reconcile pending settlement claim',
          err
        );
        throw err;
      }
    }
  }

  private async handleValidatorsSelected(
    jobId: bigint,
    validators: string[]
  ): Promise<void> {
    if (!this.validationModule || this.validatorIdentities.length === 0) return;
    const jobKey = jobId.toString();
    this.beginReviewPhase(jobKey, 'validators-selected');
    const lower = validators.map((v) => v.toLowerCase());
    for (const identity of this.validatorIdentities) {
      if (!lower.includes(identity.address.toLowerCase())) continue;
      try {
        await this.commitValidation(jobId, identity);
      } catch (err) {
        console.error('commitValidation failed', err);
      }
    }
    if (validators.length === 0) {
      try {
        await this.triggerFallbackValidator(jobId, 'empty-selection');
      } catch (err) {
        console.error('fallback validator selection failed', err);
        auditLog('validator.fallback_failed', {
          jobId: jobKey,
          details: {
            reason: 'empty-selection',
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
  }

  private async commitValidation(
    jobId: bigint,
    identity: AgentIdentity
  ): Promise<void> {
    if (!this.validationModule) return;
    const wallet = identity.wallet.connect(this.provider);
    const jobKey = jobId.toString();
    const key = `${jobKey}:${identity.address.toLowerCase()}`;
    if (this.commits.has(key)) {
      return;
    }
    const cached = this.appliedJobs.get(jobKey);
    if (needsIndependentReview(cached?.classification, cached?.spec)) {
      auditLog('validator.independent_review_required', {
        jobId: jobKey,
        actor: identity.address,
      });
      return; // Safe abstention needs no RPC; cached data can never authorize a vote.
    }
    let applied: { classification: ClassificationResult; spec: JobSpec | null };
    try {
      applied = await this.validationContext(jobId);
    } catch (error) {
      auditLog('validator.context_unavailable', {
        jobId: jobKey,
        actor: identity.address,
        details: { error: String(error) },
      });
      return;
    }
    if (needsIndependentReview(applied.classification, applied.spec)) {
      auditLog('validator.independent_review_required', {
        jobId: jobKey,
        actor: identity.address,
      });
      return;
    }
    const nonce: bigint = await this.validationModule.jobNonce(jobId);
    const existingCommitment = await this.validationModule.commitments(
      jobId,
      identity.address,
      nonce
    );
    if (existingCommitment !== ethers.ZeroHash) {
      // Legacy validators retain reveal secrets in memory. A restart must not
      // replace a mined commitment with a new salt or imply it was recovered.
      auditLog('validator.commitment_reconciliation_required', {
        jobId: jobKey,
        actor: identity.address,
        details: { nonce: nonce.toString(), commitment: existingCommitment },
      });
      return;
    }
    let approve = false;
    try {
      const evaluation = await evaluateSubmission({
        registry: this.registry,
        provider: this.provider,
        jobId,
        classification: applied?.classification,
        spec: applied?.spec ?? null,
        ipfsGateway: this.config.ipfsGateway,
      });
      if (evaluation.requiresIndependentReview) {
        auditLog('validator.independent_review_required', {
          jobId: jobKey,
          actor: identity.address,
          details: { resultUri: evaluation.resultUri, notes: evaluation.notes },
        });
        return; // An abstention is not a negative vote against the worker.
      }
      approve = evaluation.approve;
      auditLog('validator.evaluation', {
        jobId: jobKey,
        actor: identity.address,
        details: {
          approve: evaluation.approve,
          confidence: evaluation.confidence,
          notes: evaluation.notes,
          resultUri: evaluation.resultUri,
          resultHash: evaluation.resultHash,
          payloadType: evaluation.payloadType,
          contentLength: evaluation.contentLength,
          worker: evaluation.worker,
          subdomain: evaluation.subdomain,
        },
      });
    } catch (err) {
      console.error('evaluateSubmission failed', err);
      auditLog('validator.evaluation', {
        jobId: jobKey,
        actor: identity.address,
        details: {
          approve: false,
          confidence: 0,
          notes: [
            {
              level: 'error',
              message: err instanceof Error ? err.message : String(err),
            },
          ],
        },
      });
      approve = false;
    }
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const commitHash = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32'],
      [jobId, nonce, approve, salt]
    );
    const writer = this.validationModule.connect(wallet) as any;
    const tx = await writer.commitValidation(jobId, commitHash, '', []);
    await tx.wait();
    auditLog('validator.commit', {
      jobId: jobId.toString(),
      actor: identity.address,
      details: { tx: tx.hash, approve },
    });
    this.commits.set(key, { wallet, salt, approve });
    this.clearReviewTimer(jobKey, 'validator-commit');
    const timer = setTimeout(() => {
      this.revealValidation(jobId, identity).catch((err) => {
        console.error('revealValidation error', err);
      });
    }, DEFAULT_REVEAL_DELAY_MS);
    this.commitTimers.set(key, timer);
  }

  private async revealValidation(
    jobId: bigint,
    identity: AgentIdentity
  ): Promise<void> {
    if (!this.validationModule) return;
    const key = `${jobId.toString()}:${identity.address.toLowerCase()}`;
    const data = this.commits.get(key);
    if (!data) return;
    const writer = this.validationModule.connect(data.wallet) as any;
    const tx = await writer.revealValidation(
      jobId,
      data.approve,
      data.salt,
      '',
      []
    );
    await tx.wait();
    auditLog('validator.reveal', {
      jobId: jobId.toString(),
      actor: identity.address,
      details: { tx: tx.hash },
    });
    this.clearReviewTimer(jobId.toString(), 'validator-reveal');
    this.commits.delete(key);
    const timer = this.commitTimers.get(key);
    if (timer) clearTimeout(timer);
    this.commitTimers.delete(key);
  }

  private normaliseChainJob(job: any): OnChainJobSnapshot {
    const toString = (value: any): string | undefined => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === 'string') return value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toString();
      }
      if (typeof value === 'bigint') return value.toString();
      try {
        if (typeof value.toString === 'function') {
          const result = value.toString();
          return typeof result === 'string' ? result : undefined;
        }
      } catch {
        return undefined;
      }
      return undefined;
    };
    const metadata = decodePackedJobMetadata(job?.packedMetadata);
    return {
      employer: job?.employer,
      agent: job?.agent,
      reward: toString(job?.reward),
      stake: toString(job?.stake),
      feePct: toString(metadata.feePct),
      agentPct: toString(metadata.agentPct),
      state: metadata.state,
      success: Boolean(metadata.success),
      assignedAt: toString(metadata.assignedAt),
      deadline: toString(metadata.deadline),
      agentTypes: metadata.agentTypes,
      resultHash: toString(job?.resultHash),
      specHash: toString(job?.specHash),
      uriHash: toString(job?.uriHash),
      burnReceiptAmount: toString(job?.burnReceiptAmount),
    };
  }

  private recordCompletedJob(
    jobId: string,
    state: AppliedJobState,
    runResult: JobRunResult,
    resultRef: string,
    chainJob: any
  ): void {
    const agentProfile = {
      address: state.identity.address,
      ens: state.identity.ens,
      label: state.identity.label ?? toSubdomain(state.identity),
      role: state.identity.role,
      capabilities: state.identity.capabilities,
    };
    const orchestratorAddress = this.orchestratorIdentity?.address;
    const onChain = this.normaliseChainJob(chainJob);
    const record = toCompletedJobEvidence(
      jobId,
      agentProfile,
      orchestratorAddress,
      state.classification,
      state.spec,
      state.summary,
      runResult,
      resultRef,
      onChain
    );
    try {
      const storagePath = persistCompletedJobEvidence(record);
      record.storagePath = storagePath;
      this.completedJobs.set(jobId, record);
      auditLog('job.evidence_persisted', {
        jobId,
        actor: state.identity.address,
        details: {
          storagePath,
          manifestCid: record.manifestCid,
          resultRef,
        },
      });
    } catch (err) {
      console.error('Failed to persist completed job evidence', err);
    }
  }

  private async prepareDisputeEvidenceForJob(
    jobId: string,
    context: { source: string; raisedBy?: string; evidenceHash?: string }
  ): Promise<void> {
    if (this.disputeEvidence.has(jobId)) {
      return;
    }
    const record = this.completedJobs.get(jobId);
    if (!record) {
      auditLog('dispute.missing_evidence', {
        jobId,
        level: 'warning',
        details: {
          source: context.source,
          raisedBy: context.raisedBy,
        },
      });
      return;
    }
    const notes: string[] = [`Trigger: ${context.source}`];
    if (context.raisedBy) {
      notes.push(`Raised by ${context.raisedBy}`);
    }
    if (context.evidenceHash && context.evidenceHash !== ethers.ZeroHash) {
      notes.push(`Counterparty evidence hash ${context.evidenceHash}`);
    }
    const energyLog = getJobEnergyLog(record.agent.address, jobId);
    try {
      const prepared = await prepareJobDisputeEvidence(record, {
        energyLog,
        additionalNotes: notes,
      });
      this.disputeEvidence.set(jobId, prepared);
      auditLog('dispute.evidence_prepared', {
        jobId,
        actor: record.agent.address,
        details: {
          hash: prepared.hash,
          cid: prepared.cid,
          uri: prepared.uri,
          storagePath: prepared.filePath,
          notes,
          uploadError: prepared.uploadError ?? null,
        },
      });
      if (prepared.uploadError) {
        console.warn(
          `Dispute evidence upload failed for job ${jobId}:`,
          prepared.uploadError
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      auditLog('dispute.evidence_failed', {
        jobId,
        actor: record.agent.address,
        level: 'error',
        details: {
          source: context.source,
          raisedBy: context.raisedBy,
          reason: message,
        },
      });
      throw err;
    }
  }

  private async handleJobDisputed(
    jobId: bigint,
    caller: string
  ): Promise<void> {
    const key = jobId.toString();
    auditLog('dispute.job_disputed', {
      jobId: key,
      details: { caller },
    });
    await this.prepareDisputeEvidenceForJob(key, {
      source: 'JobRegistry.JobDisputed',
      raisedBy: caller,
    });
  }

  private async handleDisputeRaised(
    jobId: bigint,
    claimant: string,
    evidenceHash: string
  ): Promise<void> {
    const key = jobId.toString();
    auditLog('dispute.raised', {
      jobId: key,
      details: { claimant, evidenceHash },
    });
    await this.prepareDisputeEvidenceForJob(key, {
      source: 'DisputeModule.DisputeRaised',
      raisedBy: claimant,
      evidenceHash,
    });
  }

  private async handleDisputeResolved(
    jobId: bigint,
    resolver: string,
    employerWins: boolean
  ): Promise<void> {
    const key = jobId.toString();
    auditLog('dispute.resolved', {
      jobId: key,
      details: { resolver, employerWins },
    });
    const record = this.completedJobs.get(key);
    if (record) {
      if (employerWins) {
        this.watchdog.recordFailure(record.agent.address, 'dispute-lost');
      } else {
        this.watchdog.recordSuccess(record.agent.address);
      }
    }
    const prepared = this.disputeEvidence.get(key);
    if (prepared) {
      try {
        const updated = recordDisputeResolution(prepared, {
          employerWins,
          resolver,
          resolvedAt: new Date().toISOString(),
        });
        this.disputeEvidence.set(key, updated);
      } catch (err) {
        console.warn('Failed to record dispute resolution for job', key, err);
      }
    }
  }
}
