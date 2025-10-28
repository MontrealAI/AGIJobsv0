import { Contract, JsonRpcProvider, Wallet } from 'ethers';

import { createLogger } from '../utils/telemetry.js';
import { deriveOperatorId } from '../utils/security.js';

const logger = createLogger('job-mesh');

const JOB_REGISTRY_ABI = [
  'event JobPosted(uint256 indexed jobId, string metadata)',
  'event JobAssigned(uint256 indexed jobId, address indexed agent)',
  'event JobCompleted(uint256 indexed jobId, address indexed agent, string resultHash)',
  'function applyForJob(uint256 jobId, string agentData) external',
  'function completeJob(uint256 jobId, string resultHash) external',
  'function claimRewards(uint256 jobId) external'
];

interface JobMeshConfig {
  providerUrl: string;
  jobRegistry: string;
  platformIncentives: string;
  signerPrivateKey: string;
  capabilityTags: string[];
}

interface JobIntent {
  jobId: bigint;
  metadata: string;
}

export class JobMesh {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly jobRegistry: Contract;
  private readonly config: JobMeshConfig;
  private streamListener?: Promise<void>;

  constructor(config: JobMeshConfig) {
    this.provider = new JsonRpcProvider(config.providerUrl);
    this.wallet = new Wallet(config.signerPrivateKey, this.provider);
    this.jobRegistry = new Contract(config.jobRegistry, JOB_REGISTRY_ABI, this.wallet);
    this.config = config;
  }

  async subscribe(onJob: (intent: JobIntent) => Promise<void>): Promise<void> {
    const filter = this.jobRegistry.filters.JobPosted();
    this.streamListener = new Promise((resolve) => {
      this.jobRegistry.on(filter, async (jobId: bigint, metadata: string) => {
        logger.info({ jobId: jobId.toString() }, 'New job detected');
        try {
          await onJob({ jobId, metadata });
        } catch (error) {
          logger.error({ error, jobId: jobId.toString() }, 'Job handler failed');
        }
      });
      this.provider.on('error', (error) => {
        logger.error({ error }, 'Provider error encountered');
      });
      resolve();
    });
    await this.streamListener;
  }

  async apply(jobId: bigint, agentData: string): Promise<void> {
    const tx = await this.jobRegistry.applyForJob(jobId, agentData);
    logger.info({ jobId: jobId.toString(), hash: tx.hash }, 'Applied for job');
    await tx.wait();
  }

  async complete(jobId: bigint, resultHash: string): Promise<void> {
    const tx = await this.jobRegistry.completeJob(jobId, resultHash);
    logger.info({ jobId: jobId.toString(), hash: tx.hash }, 'Submitted job result');
    await tx.wait();
  }

  async claim(jobId: bigint): Promise<void> {
    const tx = await this.jobRegistry.claimRewards(jobId);
    logger.info({ jobId: jobId.toString(), hash: tx.hash }, 'Claimed rewards');
    await tx.wait();
  }

  async buildAgentData(): Promise<string> {
    const operatorId = deriveOperatorId(this.wallet.address);
    const payload = {
      operator: this.wallet.address,
      operatorId,
      capabilities: this.config.capabilityTags,
      timestamp: new Date().toISOString()
    };
    return JSON.stringify(payload);
  }
}
