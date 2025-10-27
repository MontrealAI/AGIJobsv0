import { Contract, ContractTransactionResponse, ethers } from 'ethers';

export const shardRegistryAbi = [
  'function listShards() view returns (bytes32[])',
  'function getShardQueue(bytes32 shardId) view returns (address)',
  'function createJob(bytes32 shardId, bytes32 specHash, string metadataURI) returns (tuple(bytes32 shardId, uint256 jobId))',
  'function assignAgent(tuple(bytes32 shardId, uint256 jobId) jobRef, address agent)',
  'function startJob(tuple(bytes32 shardId, uint256 jobId) jobRef)',
  'function submitResult(tuple(bytes32 shardId, uint256 jobId) jobRef, bytes32 resultHash)',
  'function finalizeJob(tuple(bytes32 shardId, uint256 jobId) jobRef, bool success)',
  'function cancelJob(tuple(bytes32 shardId, uint256 jobId) jobRef)',
  'function linkJobs(tuple(bytes32 shardId, uint256 jobId) source, tuple(bytes32 shardId, uint256 jobId) target)',
  'function getLinkedJobs(tuple(bytes32 shardId, uint256 jobId) jobRef) view returns (tuple(bytes32 shardId, uint256 jobId)[])',
  'function getJob(tuple(bytes32 shardId, uint256 jobId) jobRef) view returns (address employer, address agent, uint8 status, bytes32 specHash, bytes32 resultHash, string metadataURI, bool success)',
  'function pauseShard(bytes32 shardId)',
  'function unpauseShard(bytes32 shardId)',
  'function setShardParameters(bytes32 shardId, tuple(uint256 maxReward, uint64 maxDuration) params)',
  'function pause()',
  'function unpause()',
];

export enum ShardJobStatus {
  None = 0,
  Created = 1,
  Assigned = 2,
  InProgress = 3,
  Submitted = 4,
  Finalized = 5,
  Cancelled = 6,
}

export interface GlobalJobRef {
  shardId: string;
  jobId: bigint;
}

export interface JobView {
  employer: string;
  agent: string;
  status: ShardJobStatus;
  specHash: string;
  resultHash: string;
  metadataURI: string;
  success: boolean;
}

export interface ShardParameters {
  maxReward: bigint;
  maxDuration: bigint;
}

export interface CreateJobResult {
  job: GlobalJobRef;
  tx: ContractTransactionResponse;
}

export class ShardRegistryAdapter {
  constructor(private readonly contract: Contract) {}

  async listShards(): Promise<string[]> {
    const listFn = this.contract.getFunction('listShards');
    const shards: string[] = await listFn();
    return shards;
  }

  async getShardQueue(shardId: string): Promise<string> {
    const id = this.normalizeShardId(shardId);
    const fn = this.contract.getFunction('getShardQueue');
    return fn(id);
  }

  async createJob(
    shardId: string,
    specHash: string,
    metadataURI: string
  ): Promise<CreateJobResult> {
    const normalizedShard = this.normalizeShardId(shardId);
    const normalizedSpec = this.normalizeSpecHash(specHash);
    const createFn = this.contract.getFunction('createJob');
    const job = await createFn.staticCall(normalizedShard, normalizedSpec, metadataURI);
    const tx: ContractTransactionResponse = await createFn(
      normalizedShard,
      normalizedSpec,
      metadataURI
    );
    return {
      job: {
        shardId: job.shardId,
        jobId: job.jobId,
      },
      tx,
    };
  }

  assignAgent(job: GlobalJobRef, agent: string): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('assignAgent');
    return fn(this.toTuple(job), agent);
  }

  startJob(job: GlobalJobRef): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('startJob');
    return fn(this.toTuple(job));
  }

  submitResult(
    job: GlobalJobRef,
    resultHash: string
  ): Promise<ContractTransactionResponse> {
    const normalized = this.normalizeSpecHash(resultHash);
    const fn = this.contract.getFunction('submitResult');
    return fn(this.toTuple(job), normalized);
  }

  finalizeJob(
    job: GlobalJobRef,
    success: boolean
  ): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('finalizeJob');
    return fn(this.toTuple(job), success);
  }

  cancelJob(job: GlobalJobRef): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('cancelJob');
    return fn(this.toTuple(job));
  }

  linkJobs(
    source: GlobalJobRef,
    target: GlobalJobRef
  ): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('linkJobs');
    return fn(this.toTuple(source), this.toTuple(target));
  }

  async getLinkedJobs(job: GlobalJobRef): Promise<GlobalJobRef[]> {
    const fn = this.contract.getFunction('getLinkedJobs');
    const links: GlobalJobRef[] = await fn(this.toTuple(job));
    return links.map((link) => ({ shardId: link.shardId, jobId: link.jobId }));
  }

  async getJob(job: GlobalJobRef): Promise<JobView> {
    const fn = this.contract.getFunction('getJob');
    const jobStruct = await fn(this.toTuple(job));
    return {
      employer: jobStruct.employer,
      agent: jobStruct.agent,
      status: Number(jobStruct.status) as ShardJobStatus,
      specHash: jobStruct.specHash,
      resultHash: jobStruct.resultHash,
      metadataURI: jobStruct.metadataURI,
      success: jobStruct.success,
    };
  }

  pauseShard(shardId: string): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('pauseShard');
    return fn(this.normalizeShardId(shardId));
  }

  unpauseShard(shardId: string): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('unpauseShard');
    return fn(this.normalizeShardId(shardId));
  }

  setShardParameters(
    shardId: string,
    params: ShardParameters
  ): Promise<ContractTransactionResponse> {
    const tuple: [bigint, bigint] = [params.maxReward, params.maxDuration];
    const fn = this.contract.getFunction('setShardParameters');
    return fn(this.normalizeShardId(shardId), tuple);
  }

  pause(): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('pause');
    return fn();
  }

  unpause(): Promise<ContractTransactionResponse> {
    const fn = this.contract.getFunction('unpause');
    return fn();
  }

  private toTuple(job: GlobalJobRef): [string, bigint] {
    return [this.normalizeShardId(job.shardId), job.jobId];
  }

  private normalizeShardId(value: string): string {
    if (ethers.isHexString(value, 32)) {
      return value.toLowerCase();
    }
    return ethers.encodeBytes32String(value);
  }

  private normalizeSpecHash(value: string): string {
    if (ethers.isHexString(value, 32)) {
      return value.toLowerCase();
    }
    return ethers.keccak256(ethers.toUtf8Bytes(value));
  }
}
