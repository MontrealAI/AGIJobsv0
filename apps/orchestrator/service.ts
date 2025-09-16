import path from 'path';
import { Contract, JsonRpcProvider, Wallet, ethers, Provider } from 'ethers';
import { IdentityManager, AgentIdentity } from './identity';
import {
  ClassificationResult,
  JobSpec,
  classifyJob,
  extractPipeline,
  fetchJobSpec,
  ChainJobSummary,
} from './jobClassifier';
import { buildPipeline, PipelineContext } from './pipeline';
import { runJob } from './execution';
import { finalizeJob } from './submission';
import {
  CapabilityMatrix,
  loadCapabilityMatrix,
  fetchJobRequirements,
  ensureStake,
  selectAgent,
} from './bidding';
import { auditLog } from './audit';
import { AuditAnchoringService, AuditAnchoringOptions } from './anchoring';
import { getWatchdog } from './monitor';
import { postJob } from './employer';
import { evaluateSubmission } from './validation';
import { LearningCoordinator } from './learning';

interface AppliedJobState {
  identity: AgentIdentity;
  wallet: Wallet;
  classification: ClassificationResult;
  spec: JobSpec | null;
  summary: ChainJobSummary;
}

interface CommitData {
  wallet: Wallet;
  salt: string;
  approve: boolean;
}

const JOB_REGISTRY_ABI = [
  'event JobCreated(uint256 indexed jobId,address indexed employer,address indexed agent,uint256 reward,uint256 stake,uint256 fee,bytes32 specHash,string uri)',
  'event JobApplied(uint256 indexed jobId,address indexed agent,string subdomain)',
  'event JobSubmitted(uint256 indexed jobId,address indexed worker,bytes32 resultHash,string resultURI,string subdomain)',
  'event JobCompleted(uint256 indexed jobId,bool success)',
  'event JobCancelled(uint256 indexed jobId)',
  'function jobs(uint256 jobId) view returns (address employer,address agent,uint128 reward,uint96 stake,uint32 feePct,uint32 agentPct,uint8 state,bool success,bool burnConfirmed,uint128 burnReceiptAmount,uint8 agentTypes,uint64 deadline,uint64 assignedAt,bytes32 uriHash,bytes32 resultHash,bytes32 specHash)',
  'function applyForJob(uint256 jobId,string subdomain,bytes32[] proof)',
];

const STAKE_MANAGER_ABI = [
  'function stakeOf(address user,uint8 role) view returns (uint256)',
  'function depositStake(uint8 role,uint256 amount)',
];

const VALIDATION_MODULE_ABI = [
  'event ValidatorsSelected(uint256 indexed jobId,address[] validators)',
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function commitValidation(uint256 jobId,bytes32 commitHash,string subdomain,bytes32[] proof)',
  'function revealValidation(uint256 jobId,bool approve,bytes32 salt,string subdomain,bytes32[] proof)',
];

const DEFAULT_ASSIGNMENT_POLL_MS = Number(
  process.env.ASSIGNMENT_POLL_INTERVAL_MS || 15000
);
const DEFAULT_REVEAL_DELAY_MS = Number(
  process.env.VALIDATION_REVEAL_DELAY_MS || 60000
);

export interface MetaOrchestratorConfig {
  rpcUrl: string;
  jobRegistryAddress: string;
  stakeManagerAddress?: string;
  validationModuleAddress?: string;
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
    reputationEngineAddress: process.env.REPUTATION_ENGINE_ADDRESS || undefined,
    capabilityMatrixPath,
    identityDirectory: process.env.AGENT_IDENTITY_DIR || undefined,
    skipEnsVerification: process.env.SKIP_ENS_VERIFICATION === '1',
    ipfsGateway: process.env.IPFS_GATEWAY_URL || undefined,
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
  private capabilityMatrix: CapabilityMatrix = {};
  private orchestratorIdentity: AgentIdentity | undefined;
  private validatorIdentities: AgentIdentity[] = [];
  private auditAnchor: AuditAnchoringService | null = null;
  private readonly appliedJobs = new Map<string, AppliedJobState>();
  private readonly assignmentTimers = new Map<string, NodeJS.Timeout>();
  private readonly commitTimers = new Map<string, NodeJS.Timeout>();
  private readonly commits = new Map<string, CommitData>();
  private readonly watchdog = getWatchdog();
  private readonly learning = new LearningCoordinator();
  private running = false;

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

  start(): void {
    if (this.running) return;
    this.running = true;
    this.registerEventHandlers();
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
    this.registry.removeAllListeners();
    if (this.validationModule) this.validationModule.removeAllListeners();
    for (const timer of this.assignmentTimers.values()) clearInterval(timer);
    for (const timer of this.commitTimers.values()) clearTimeout(timer);
    this.assignmentTimers.clear();
    this.commitTimers.clear();
    this.appliedJobs.clear();
    this.commits.clear();
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
        };
        this.handleJobCreated(summary).catch((err) => {
          console.error('JobCreated handler failed', err);
        });
      }
    );

    this.registry.on('JobCompleted', (jobId: bigint, success: boolean) => {
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
      this.appliedJobs.delete(key);
      const timer = this.assignmentTimers.get(key);
      if (timer) clearInterval(timer);
      this.assignmentTimers.delete(key);
    });

    this.registry.on('JobCancelled', (jobId: bigint) => {
      const key = jobId.toString();
      this.appliedJobs.delete(key);
      const timer = this.assignmentTimers.get(key);
      if (timer) clearInterval(timer);
      this.assignmentTimers.delete(key);
      auditLog('job.cancelled', { jobId: key, details: {} });
      if (this.auditAnchor) {
        this.auditAnchor
          .trigger()
          .catch((err) => console.error('audit anchor trigger failed', err));
      }
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
    }
  }

  private async handleJobCreated(summary: ChainJobSummary): Promise<void> {
    if (summary.agent && summary.agent !== ethers.ZeroAddress) {
      return;
    }
    const spec = await fetchJobSpec(summary.uri, {
      gatewayUrl: this.config.ipfsGateway,
    });
    const classification = classifyJob(summary, spec ?? undefined);
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
        const decision = await selectAgent(category, matrix, reputationEngine, {
          provider,
          jobId: summary.jobId,
          minEfficiencyScore:
            classification.spec?.thermodynamics?.minEfficiency,
          maxEnergyScore: classification.spec?.thermodynamics?.maxEnergy,
          requiredSkills,
          reward: requirements.reward,
          requiredStake: requirements.stake,
          stakeManagerAddress: this.config.stakeManagerAddress,
        });
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
      await finalizeJob(jobId, resultRef, state.wallet);
      auditLog('job.submitted', {
        jobId,
        actor: state.identity.address,
        details: {
          resultRef,
          manifestCid: runResult.manifestCid,
          finalStageCid: runResult.finalCid,
          stages: stages.map((s) => s.name),
          stageCount: runResult.snapshot.stageCount,
          keywords: runResult.snapshot.keywords.slice(0, 12),
        },
      });
      await this.learning.recordJobOutcome({
        jobId,
        identity: state.identity,
        classification: state.classification,
        spec: state.spec,
        summary: state.summary,
        chainJob,
        runResult,
        resultRef,
        success: true,
      });
      await this.spawnSubtasks(jobId, state.spec);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.watchdog.recordFailure(state.identity.address, message);
      auditLog('job.execution_failed', {
        jobId,
        actor: state.identity.address,
        details: { error: message },
      });
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
        console.warn('Failed to spawn subtask', err);
      }
    }
  }

  private async handleValidatorsSelected(
    jobId: bigint,
    validators: string[]
  ): Promise<void> {
    if (!this.validationModule || this.validatorIdentities.length === 0) return;
    const lower = validators.map((v) => v.toLowerCase());
    for (const identity of this.validatorIdentities) {
      if (!lower.includes(identity.address.toLowerCase())) continue;
      try {
        await this.commitValidation(jobId, identity);
      } catch (err) {
        console.error('commitValidation failed', err);
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
    let approve = false;
    try {
      const applied = this.appliedJobs.get(jobKey);
      const evaluation = await evaluateSubmission({
        registry: this.registry,
        provider: this.provider,
        jobId,
        classification: applied?.classification,
        spec: applied?.spec ?? null,
        ipfsGateway: this.config.ipfsGateway,
      });
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
    const nonce: bigint = await this.validationModule.jobNonce(jobId);
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
    const key = `${jobKey}:${identity.address.toLowerCase()}`;
    this.commits.set(key, { wallet, salt, approve });
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
    this.commits.delete(key);
    const timer = this.commitTimers.get(key);
    if (timer) clearTimeout(timer);
    this.commitTimers.delete(key);
  }
}
