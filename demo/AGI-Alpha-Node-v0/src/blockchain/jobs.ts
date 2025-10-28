import { formatUnits, keccak256, sha256, toUtf8Bytes, Wallet } from 'ethers';
import { NormalisedAlphaNodeConfig, makeEnsName } from '../config';
import { connectJobRegistry, JobRegistryContract } from './contracts';
import type { JobOpportunity } from '../ai/planner';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface JobLifecycleContext {
  readonly signer: Wallet;
  readonly config: NormalisedAlphaNodeConfig;
  readonly registry?: QueryableJobRegistry;
}

export interface JobDiscoveryOptions {
  readonly fromBlock?: number;
  readonly toBlock?: number;
  readonly limit?: number;
  readonly includeCompleted?: boolean;
}

export interface DiscoveredJob {
  readonly jobId: bigint;
  readonly employer: string;
  readonly assignedAgent: string;
  readonly rewardWei: bigint;
  readonly stakeWei: bigint;
  readonly protocolFeeWei: bigint;
  readonly uri: string;
  readonly specHash: string;
  readonly isOpen: boolean;
  readonly transactionHash: string;
  readonly blockNumber: number;
}

export interface JobActionOptions {
  readonly dryRun?: boolean;
  readonly proof?: readonly string[];
  readonly resultUri?: string;
  readonly resultHash?: string;
  readonly hashAlgorithm?: 'keccak256' | 'sha256';
}

export interface JobActionReceipt {
  readonly dryRun: boolean;
  readonly transactionHash?: string;
  readonly notes: string[];
}

export interface JobCycleReport {
  readonly application?: JobActionReceipt;
  readonly submission?: JobActionReceipt;
  readonly finalization?: JobActionReceipt;
}

type QueryableJobRegistry = JobRegistryContract & {
  queryFilter(eventName: string, from?: number, to?: number): Promise<EventLogLike[]>;
};

interface EventLogLike {
  readonly args: Record<string, unknown> & {
    jobId: bigint;
    employer: string;
    agent: string;
    reward: bigint;
    stake: bigint;
    fee: bigint;
    specHash: string;
    uri: string;
  };
  readonly transactionHash: string;
  readonly blockNumber: number;
}

interface JobStruct {
  employer: string;
  agent: string;
  reward: bigint;
  stake: bigint;
  burnReceiptAmount: bigint;
  specHash: string;
  uriHash: string;
  resultHash: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeResultHash(uri: string, algorithm: 'keccak256' | 'sha256'): string {
  const data = toUtf8Bytes(uri);
  return algorithm === 'sha256' ? sha256(data) : keccak256(data);
}

function deriveTags(uri: string, employer: string): string[] {
  const lowered = uri.toLowerCase();
  const tags = new Set<string>(['agi-core']);
  if (lowered.includes('govern')) {
    tags.add('governance');
  }
  if (lowered.includes('biotech') || lowered.includes('genomic')) {
    tags.add('biotech');
  }
  if (lowered.includes('manufactur') || lowered.includes('supply')) {
    tags.add('manufacturing');
  }
  if (lowered.includes('finance') || lowered.includes('alpha')) {
    tags.add('capital-markets');
  }
  if (lowered.includes('energy')) {
    tags.add('energy-optimization');
  }
  if (lowered.includes('safety') || employer.toLowerCase() === ZERO_ADDRESS) {
    tags.add('resilience');
  }
  return [...tags];
}

function normaliseJobStruct(raw: unknown): JobStruct {
  if (!Array.isArray(raw) || raw.length < 8) {
    throw new Error('Unexpected JobRegistry.jobs response shape.');
  }
  return {
    employer: String(raw[0]),
    agent: String(raw[1]),
    reward: BigInt(raw[2]),
    stake: BigInt(raw[3]),
    burnReceiptAmount: BigInt(raw[4] ?? 0),
    uriHash: String(raw[5] ?? '0x0'),
    resultHash: String(raw[6] ?? '0x0'),
    specHash: String(raw[7] ?? '0x0')
  };
}

function toOpportunity(job: DiscoveredJob): JobOpportunity {
  const reward = Number.parseFloat(formatUnits(job.rewardWei, 18));
  const stake = Number.parseFloat(formatUnits(job.stakeWei, 18));
  const rewardBase = Number.isFinite(reward) ? reward : 0;
  const stakeBase = Number.isFinite(stake) ? stake : 0;
  const ratio = rewardBase > 0 ? stakeBase / rewardBase : 0.2;
  const difficulty = clamp(0.25 + ratio * 0.35, 0.05, 0.95);
  const risk = clamp(0.15 + ratio * 0.4 + (job.isOpen ? 0 : 0.25), 0.05, 0.95);
  return {
    jobId: job.jobId.toString(),
    reward: rewardBase,
    difficulty,
    risk,
    tags: deriveTags(job.uri, job.employer)
  };
}

export class JobLifecycle {
  private readonly registry: QueryableJobRegistry;
  private readonly operatorEns: string;

  constructor(private readonly context: JobLifecycleContext) {
    this.registry = context.registry
      ? context.registry
      : (connectJobRegistry(context.config.contracts.jobRegistry, context.signer) as unknown as QueryableJobRegistry);
    this.operatorEns = makeEnsName(context.config);
  }

  async discover(options?: JobDiscoveryOptions): Promise<DiscoveredJob[]> {
    const provider = this.context.signer.provider;
    if (!provider) {
      throw new Error('Signer must be connected to a provider to discover jobs.');
    }
    const currentBlock = options?.toBlock ?? (await provider.getBlockNumber());
    const fromBlock = options?.fromBlock ?? Math.max(0, currentBlock - this.context.config.jobs.discovery.lookbackBlocks);
    const limit = options?.limit ?? this.context.config.jobs.discovery.maxJobs;
    const includeCompleted = options?.includeCompleted ?? this.context.config.jobs.discovery.includeCompleted;

    const logs = await this.registry.queryFilter('JobCreated', fromBlock, currentBlock);
    const jobs: DiscoveredJob[] = [];
    for (const log of [...logs].reverse()) {
      const decodedArgs = (log as any).args ?? this.registry.interface.parseLog(log).args;
      const args = decodedArgs as EventLogLike['args'];
      const rawJob = await this.registry.jobs(args.jobId);
      const parsed = normaliseJobStruct(rawJob);
      const isOpen = parsed.agent.toLowerCase() === ZERO_ADDRESS && parsed.resultHash === '0x0000000000000000000000000000000000000000000000000000000000000000';
      if (!includeCompleted && !isOpen) {
        continue;
      }
      jobs.push({
        jobId: args.jobId,
        employer: parsed.employer,
        assignedAgent: parsed.agent,
        rewardWei: parsed.reward,
        stakeWei: parsed.stake,
        protocolFeeWei: args.fee,
        uri: args.uri,
        specHash: parsed.specHash,
        isOpen,
        transactionHash: (log as any).transactionHash ?? '0x0',
        blockNumber: Number((log as any).blockNumber ?? currentBlock)
      });
      if (jobs.length >= limit) {
        break;
      }
    }
    return jobs;
  }

  toOpportunities(jobs: readonly DiscoveredJob[]): JobOpportunity[] {
    return jobs.map(toOpportunity);
  }

  async apply(jobId: bigint, options?: JobActionOptions): Promise<JobActionReceipt> {
    const notes: string[] = [];
    const proof = options?.proof ?? this.context.config.jobs.identityProof;
    if (options?.dryRun) {
      notes.push(`Dry run: would call applyForJob(${jobId}) for ${this.operatorEns}.`);
      return { dryRun: true, notes };
    }
    const tx = await this.registry.applyForJob(jobId, this.context.config.operator.ensLabel, proof);
    notes.push(`Job application submitted: ${tx.hash}`);
    const receipt = await tx.wait?.();
    if (receipt) {
      notes.push(`Included in block ${receipt.blockNumber}`);
    }
    return { dryRun: false, transactionHash: tx.hash, notes };
  }

  async submit(jobId: bigint, options?: JobActionOptions): Promise<JobActionReceipt> {
    const notes: string[] = [];
    const proof = options?.proof ?? this.context.config.jobs.identityProof;
    const resultUri = options?.resultUri ?? this.context.config.jobs.execution.defaultResultUri;
    if (!resultUri) {
      throw new Error('Result URI is required to submit a job.');
    }
    const hashAlgorithm = options?.hashAlgorithm ?? this.context.config.jobs.execution.resultHashAlgorithm;
    const resultHash = options?.resultHash ?? computeResultHash(resultUri, hashAlgorithm);
    if (options?.dryRun) {
      notes.push(`Dry run: would submit result ${resultHash} → ${resultUri} for job ${jobId}.`);
      return { dryRun: true, notes };
    }
    const tx = await this.registry.submit(jobId, resultHash, resultUri, this.context.config.operator.ensLabel, proof);
    notes.push(`Result submission broadcast: ${tx.hash}`);
    const receipt = await tx.wait?.();
    if (receipt) {
      notes.push(`Submission confirmed in block ${receipt.blockNumber}`);
    }
    return { dryRun: false, transactionHash: tx.hash, notes };
  }

  async finalize(jobId: bigint, options?: JobActionOptions): Promise<JobActionReceipt> {
    const notes: string[] = [];
    if (options?.dryRun) {
      notes.push(`Dry run: would call finalize(${jobId}).`);
      return { dryRun: true, notes };
    }
    let tx;
    try {
      tx = await this.registry.finalize(jobId);
    } catch (error) {
      notes.push(`Finalize reverted: ${(error as Error).message}`);
      return { dryRun: false, notes };
    }
    notes.push(`Finalize transaction broadcast: ${tx.hash}`);
    const receipt = await tx.wait?.();
    if (receipt) {
      notes.push(`Finalization confirmed in block ${receipt.blockNumber}`);
    }
    return { dryRun: false, transactionHash: tx.hash, notes };
  }

  async run(jobId: bigint, options?: JobActionOptions): Promise<JobCycleReport> {
    const application = await this.apply(jobId, options);
    const submission = await this.submit(jobId, options);
    const finalization = await this.finalize(jobId, options);
    return { application, submission, finalization };
  }
}

export function createJobLifecycle(context: JobLifecycleContext): JobLifecycle {
  return new JobLifecycle(context);
}
