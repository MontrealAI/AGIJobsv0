import fs from 'fs';
import path from 'path';
import { ethers, Wallet } from 'ethers';
import { create as createIpfsClient, IPFSHTTPClient } from 'ipfs-http-client';
import { Job } from './types';
import { AgentProfile, JobAnalysis } from './agentRegistry';
import { AgentIdentity } from './identity';
import { registry, FETCH_TIMEOUT_MS, TOKEN_DECIMALS } from './utils';
import {
  startEnergySpan,
  endEnergySpan,
  EnergySample,
} from '../shared/energyMonitor';
import { recordAuditEvent } from '../shared/auditLogger';
import { publishEnergySample } from './telemetry';
import { notifyTrainingOutcome } from './learning';

export interface TaskExecutionContext {
  job: Job;
  wallet: Wallet;
  profile: AgentProfile;
  identity: AgentIdentity;
  analysis: JobAnalysis;
}

export interface TaskExecutionResult {
  txHash: string;
  resultURI: string;
  resultCid: string;
  resultHash: string;
  payloadDigest: string;
  resultSignature: string;
  outputPath: string;
  energy: EnergySample;
  rawOutput: unknown;
  submissionMethod: 'finalizeJob' | 'submit';
}

export interface AgentMemoryEntry {
  jobId: string;
  timestamp: string;
  resultURI?: string;
  resultHash?: string;
  digest?: string;
  cid?: string;
  txHash?: string;
  method?: string;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface OrchestrationSnapshot {
  context: Record<string, unknown>;
  memory: AgentMemoryEntry[];
}

export interface AgentInvocationPayload {
  job: Job;
  analysis: JobAnalysis;
  profile: {
    address: string;
    ensName?: string;
    label?: string;
    role: AgentIdentity['role'];
    categories: string[];
    skills: string[];
    reputationScore: number;
    successRate: number;
    totalJobs: number;
    averageEnergy: number;
    averageDurationMs: number;
    metadata?: AgentProfile['metadata'];
    configMetadata?: AgentProfile['configMetadata'];
  };
  identity: AgentIdentity;
  context: Record<string, unknown>;
  memory: AgentMemoryEntry[];
}

export interface AgentTaskRunResult {
  output: unknown;
  payload: AgentInvocationPayload;
  orchestration: OrchestrationSnapshot;
  error?: Error;
}

export interface OrchestrationContextContribution {
  context?: Record<string, unknown>;
  memory?: AgentMemoryEntry[];
}

export type OrchestrationContextProvider = (
  context: TaskExecutionContext
) =>
  | Promise<OrchestrationContextContribution | void>
  | OrchestrationContextContribution
  | void;

export interface MemoryUpdate {
  cid?: string;
  resultURI?: string;
  resultHash?: string;
  digest?: string;
  signature?: string;
  txHash?: string;
  method?: string;
  success: boolean;
  payload?: AgentInvocationPayload;
  rawOutput?: unknown;
  orchestration?: OrchestrationSnapshot;
  error?: string;
}

export type OrchestrationMemoryHook = (
  context: TaskExecutionContext,
  update: MemoryUpdate
) => Promise<void> | void;

export type AgentEndpointInvoker = (
  endpoint: string,
  payload: unknown,
  timeoutMs: number
) => Promise<unknown>;

const RESULT_DIR = path.resolve(__dirname, '../storage/results');
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const MAX_MEMORY_ENTRIES = Number(process.env.AGENT_MEMORY_LIMIT || '5');

const contextProviders = new Set<OrchestrationContextProvider>();
const memoryHooks = new Set<OrchestrationMemoryHook>();
const agentMemory = new Map<string, AgentMemoryEntry[]>();

let agentInvoker: AgentEndpointInvoker = invokeAgentEndpoint;
let ipfsClient: IPFSHTTPClient | null = null;
let ipfsFactory: () => IPFSHTTPClient = () =>
  createIpfsClient({
    url: IPFS_API_URL,
  });

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function resolveRewardValue(job: Job): number {
  if (job?.reward) {
    const parsed = Number.parseFloat(job.reward);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (job?.rewardRaw) {
    try {
      const value = ethers.formatUnits(
        BigInt(job.rewardRaw),
        Number(TOKEN_DECIMALS)
      );
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    } catch (err) {
      console.warn('Failed to normalise reward value for job', job.jobId, err);
    }
  }
  return 0;
}

async function acknowledgeTaxPolicy(wallet: Wallet): Promise<void> {
  try {
    const policy = await (registry as any).taxPolicy();
    if (policy && policy !== ethers.ZeroAddress) {
      await (registry as any).connect(wallet).acknowledgeTaxPolicy();
    }
  } catch (err: any) {
    if (err?.message && err.message.includes('AlreadyAcknowledged')) {
      return;
    }
    // ignore benign failures such as already acknowledged
  }
}

async function invokeAgentEndpoint(
  endpoint: string,
  payload: unknown,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}

function fallbackSolveJob(context: TaskExecutionContext): unknown {
  const { job, analysis } = context;
  return {
    jobId: job.jobId,
    summary: 'Autogenerated fallback solution',
    analysis,
    timestamp: new Date().toISOString(),
  };
}

function serialiseResult(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result, null, 2);
}

async function persistResult(jobId: string, payload: string): Promise<string> {
  ensureDir(RESULT_DIR);
  const file = path.join(RESULT_DIR, `${jobId}.json`);
  await fs.promises.writeFile(file, payload, 'utf8');
  return file;
}

function mergeContext(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}

function mergeMemoryEntries(
  existing: AgentMemoryEntry[],
  addition: AgentMemoryEntry[]
): AgentMemoryEntry[] {
  if (addition.length === 0) {
    return existing;
  }
  const combined = [...existing];
  for (const entry of addition) {
    if (
      !combined.some(
        (item) =>
          item.jobId === entry.jobId &&
          (item.txHash ?? item.resultURI ?? item.cid) ===
            (entry.txHash ?? entry.resultURI ?? entry.cid)
      )
    ) {
      combined.push(entry);
    }
  }
  return combined;
}

async function gatherOrchestrationContext(
  context: TaskExecutionContext
): Promise<OrchestrationSnapshot> {
  const aggregatedContext: Record<string, unknown> = {};
  let aggregatedMemory: AgentMemoryEntry[] = [];
  for (const provider of contextProviders) {
    try {
      const contribution = await provider(context);
      if (!contribution) continue;
      if (contribution.context) {
        mergeContext(aggregatedContext, contribution.context);
      }
      if (contribution.memory && contribution.memory.length > 0) {
        aggregatedMemory = mergeMemoryEntries(
          aggregatedMemory,
          contribution.memory
        );
      }
    } catch (err) {
      console.warn('Orchestration context provider failed', err);
    }
  }
  return { context: aggregatedContext, memory: aggregatedMemory };
}

async function notifyMemoryConsumers(
  execution: TaskExecutionContext,
  update: MemoryUpdate
): Promise<void> {
  if (memoryHooks.size === 0) return;
  for (const hook of memoryHooks) {
    try {
      await hook(execution, update);
    } catch (err) {
      console.warn('Task memory hook failed', err);
    }
  }
}

function getIpfsClient(): IPFSHTTPClient {
  if (!ipfsClient) {
    ipfsClient = ipfsFactory();
  }
  return ipfsClient;
}

async function uploadToIpfs(content: string): Promise<string> {
  const client = getIpfsClient();
  const { cid } = await client.add(Buffer.from(content, 'utf8'), {
    cidVersion: 1,
    wrapWithDirectory: false,
  });
  return cid.toString();
}

export function setAgentEndpointInvoker(
  invoker: AgentEndpointInvoker | null
): void {
  agentInvoker = invoker ?? invokeAgentEndpoint;
}

export function setIpfsClientFactory(
  factory: (() => IPFSHTTPClient) | null
): void {
  ipfsClient = null;
  ipfsFactory = factory ?? (() => createIpfsClient({ url: IPFS_API_URL }));
}

export function registerContextProvider(
  provider: OrchestrationContextProvider
): () => void {
  contextProviders.add(provider);
  return () => contextProviders.delete(provider);
}

export function registerMemoryHook(hook: OrchestrationMemoryHook): () => void {
  memoryHooks.add(hook);
  return () => memoryHooks.delete(hook);
}

export function clearAgentMemory(address?: string): void {
  if (address) {
    agentMemory.delete(address.toLowerCase());
  } else {
    agentMemory.clear();
  }
}

export function getAgentMemory(address: string): AgentMemoryEntry[] {
  const records = agentMemory.get(address.toLowerCase()) ?? [];
  return records.map((entry) => ({ ...entry }));
}

const defaultContextProvider: OrchestrationContextProvider = (execution) => {
  const key = execution.profile.address.toLowerCase();
  const history = agentMemory.get(key) ?? [];
  const recent = history.slice(0, MAX_MEMORY_ENTRIES);
  if (recent.length === 0) {
    return { context: {}, memory: [] };
  }
  const successCount = recent.filter((entry) => entry.success).length;
  return {
    context: {
      previousJobs: recent.map((entry) => ({
        jobId: entry.jobId,
        resultURI: entry.resultURI,
        success: entry.success,
        timestamp: entry.timestamp,
      })),
      previousSuccessRate:
        recent.length > 0 ? successCount / recent.length : undefined,
    },
    memory: recent,
  };
};

const defaultMemoryHook: OrchestrationMemoryHook = (execution, update) => {
  const key = execution.profile.address.toLowerCase();
  const history = agentMemory.get(key) ?? [];
  const entry: AgentMemoryEntry = {
    jobId: execution.job.jobId,
    timestamp: new Date().toISOString(),
    resultURI: update.resultURI,
    resultHash: update.resultHash,
    digest: update.digest,
    cid: update.cid,
    txHash: update.txHash,
    method: update.method,
    success: update.success,
    error: update.error,
    metadata: {
      category: execution.analysis.category,
      employer: execution.job.employer,
      agentLabel: execution.identity.label,
    },
  };
  history.unshift(entry);
  agentMemory.set(key, history.slice(0, MAX_MEMORY_ENTRIES));
};

contextProviders.add(defaultContextProvider);
memoryHooks.add(defaultMemoryHook);

export async function runAgentTask(
  agent: AgentProfile,
  jobSpec: TaskExecutionContext
): Promise<AgentTaskRunResult> {
  const orchestration = await gatherOrchestrationContext(jobSpec);
  const payload: AgentInvocationPayload = {
    job: jobSpec.job,
    analysis: jobSpec.analysis,
    profile: {
      address: agent.address,
      ensName: agent.ensName,
      label: agent.label,
      role: agent.role,
      categories: agent.categories,
      skills: agent.skills,
      reputationScore: agent.reputationScore,
      successRate: agent.successRate,
      totalJobs: agent.totalJobs,
      averageEnergy: agent.averageEnergy,
      averageDurationMs: agent.averageDurationMs,
      metadata: agent.metadata,
      configMetadata: agent.configMetadata,
    },
    identity: jobSpec.identity,
    context: orchestration.context,
    memory: orchestration.memory,
  };

  let output: unknown;
  let error: Error | undefined;
  if (agent.endpoint) {
    try {
      output = await agentInvoker(agent.endpoint, payload, FETCH_TIMEOUT_MS);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      console.warn('Agent endpoint invocation failed, falling back', error);
      output = fallbackSolveJob(jobSpec);
    }
  } else {
    output = fallbackSolveJob(jobSpec);
  }

  return { output, payload, orchestration, error };
}

export async function executeJob(
  context: TaskExecutionContext
): Promise<TaskExecutionResult> {
  const { job, wallet, profile, identity, analysis } = context;
  const rewardValue = resolveRewardValue(job);
  const span = startEnergySpan({
    jobId: job.jobId,
    agent: wallet.address,
    label: identity.label,
    category: analysis.category,
  });
  let resultURI = '';
  let resultCid = '';
  let resultHash = '';
  let payloadDigest = '';
  let resultSignature = '';
  let txHash = '';
  let rawOutput: unknown;
  let outputPath = '';
  let error: Error | null = null;
  let energySample: EnergySample | null = null;
  let submissionMethod: 'finalizeJob' | 'submit' = 'submit';
  let invocation: AgentTaskRunResult | null = null;

  try {
    invocation = await runAgentTask(profile, context);
    rawOutput = invocation.output;
    const serialised = serialiseResult(rawOutput);
    outputPath = await persistResult(job.jobId, serialised);
    resultCid = await uploadToIpfs(serialised);
    resultURI = `ipfs://${resultCid}`;
    payloadDigest = ethers.keccak256(ethers.toUtf8Bytes(serialised));
    resultHash = payloadDigest;
    resultSignature = await wallet.signMessage(ethers.getBytes(payloadDigest));

    await acknowledgeTaxPolicy(wallet);

    const contract = (registry as any).connect(wallet);
    let tx: { hash: string; wait: () => Promise<unknown> } | null = null;

    if (typeof contract?.finalizeJob === 'function') {
      try {
        tx = await contract.finalizeJob(job.jobId, resultURI);
        submissionMethod = 'finalizeJob';
      } catch (finalizeError) {
        submissionMethod = 'submit';
        console.warn(
          'finalizeJob invocation failed, falling back to submit',
          finalizeError
        );
        tx = null;
      }
    }

    if (!tx) {
      tx = await contract.submit(
        job.jobId,
        resultHash,
        resultURI,
        identity.label ?? '',
        []
      );
      submissionMethod = 'submit';
    }

    await tx.wait();
    txHash = tx.hash;

    await notifyMemoryConsumers(context, {
      cid: resultCid,
      resultURI,
      resultHash,
      digest: payloadDigest,
      signature: resultSignature,
      txHash,
      method: submissionMethod,
      success: true,
      payload: invocation.payload,
      rawOutput,
      orchestration: invocation.orchestration,
      error: invocation.error?.message,
    });

    await recordAuditEvent(
      {
        component: 'task-execution',
        action: 'submit',
        jobId: job.jobId,
        agent: wallet.address,
        metadata: {
          resultURI,
          resultCid,
          resultHash,
          txHash,
          payloadDigest,
          resultSignature,
          submissionMethod,
        },
        success: true,
      },
      wallet
    );
  } catch (err: any) {
    error = err instanceof Error ? err : new Error(err?.message || String(err));

    if (invocation) {
      await notifyMemoryConsumers(context, {
        cid:
          resultCid ||
          (resultURI.startsWith('ipfs://')
            ? resultURI.slice('ipfs://'.length)
            : undefined),
        resultURI: resultURI || undefined,
        resultHash: resultHash || undefined,
        digest: payloadDigest || undefined,
        signature: resultSignature || undefined,
        txHash: txHash || undefined,
        method: submissionMethod,
        success: false,
        payload: invocation.payload,
        rawOutput,
        orchestration: invocation.orchestration,
        error: error.message,
      });
    }

    await recordAuditEvent(
      {
        component: 'task-execution',
        action: 'submit-failed',
        jobId: job.jobId,
        agent: wallet.address,
        metadata: {
          error: error.message,
          resultURI,
          resultCid,
          resultHash,
          payloadDigest,
          submissionMethod,
        },
        success: false,
      },
      wallet
    );
    throw error;
  } finally {
    energySample = await endEnergySpan(span, {
      jobId: job.jobId,
      agent: wallet.address,
      success: !error,
      resultURI,
      rewardValue,
      rewardRaw: job.rewardRaw,
      rewardFormatted: job.reward,
      tokenDecimals: TOKEN_DECIMALS,
      stakeRaw: job.stakeRaw,
      stakeFormatted: job.stake,
    });
    await publishEnergySample(energySample);
    await notifyTrainingOutcome({
      job,
      profile,
      analysis,
      success: !error,
      energy: energySample,
      txHash,
      resultURI,
      resultHash,
    });
  }

  if (!energySample) {
    throw new Error('Energy sample missing after task execution');
  }
  return {
    txHash,
    resultURI,
    resultCid,
    resultHash,
    payloadDigest,
    resultSignature,
    outputPath,
    energy: energySample,
    rawOutput,
    submissionMethod,
  };
}
