import fs from 'fs';
import path from 'path';

import { instrumentTask } from './metrics';
import type { TaskMetrics } from './metrics';
import { auditLog } from './audit';
import { getWatchdog } from './monitor';
import { signAgentOutput } from './signing';
import type { AgentHandlerContext } from './agents';
import {
  recordWorldModelObservation,
  buildWorldModelSnapshot,
  persistWorldModelSnapshot,
  summarizeContent,
  type WorldModelObservation,
  type ExecutionMetricsSummary,
  type SnapshotContext,
  type WorldModelSnapshot,
  type ContentSummary,
} from '../../shared/worldModel';

export interface StageDefinition {
  name: string;
  agent: string | ((input: any) => Promise<any>);
  signerId?: string;
  context: AgentHandlerContext;
}

interface JobStage {
  name: string;
  cid?: string;
  signatureCid?: string;
  signature?: string;
  signer?: string;
  digest?: string;
  completedAt?: string;
  context?: AgentHandlerContext;
  inputSummary?: ContentSummary | null;
  outputSummary?: ContentSummary | null;
  metrics?: ExecutionMetricsSummary | null;
}

interface JobState {
  currentStage: number;
  stages: JobStage[];
  completed?: boolean;
}

const STATE_FILE = path.resolve(__dirname, 'state.json');
const GRAPH_FILE = path.resolve(__dirname, 'jobGraph.json');
const watchdog = getWatchdog();

interface JobArtifact {
  stage: string;
  agentId?: string;
  invocationTarget?: string;
  outputCid?: string;
  signatureCid?: string;
  signature?: string;
  signer?: string;
  digest?: string;
  summary?: ContentSummary | null;
  metrics?: ExecutionMetricsSummary | null;
  recordedAt?: string;
}

export interface JobArtifactManifest {
  jobId: string;
  createdAt: string;
  completedAt: string;
  pipeline: string[];
  context?: SnapshotContext;
  initialInput?: ContentSummary | null;
  artifacts: JobArtifact[];
  worldModel: WorldModelSnapshot;
}

export interface JobRunResult {
  stageCids: string[];
  finalCid: string | null;
  manifestCid: string;
  manifest: JobArtifactManifest;
  snapshot: WorldModelSnapshot;
}

export function loadState(): Record<string, JobState> {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return raw ? (JSON.parse(raw) as Record<string, JobState>) : {};
  } catch {
    return {};
  }
}

export function saveState(state: Record<string, JobState>): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function loadJobGraph(): Record<string, string[]> {
  try {
    if (!fs.existsSync(GRAPH_FILE)) return {};
    const raw = fs.readFileSync(GRAPH_FILE, 'utf8');
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function saveJobGraph(graph: Record<string, string[]>): void {
  fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2));
}

export async function invokeAgent(
  agent: string | ((input: any) => Promise<any>),
  payload: any
): Promise<any> {
  if (typeof agent === 'function') {
    return agent(payload);
  }
  const res = await fetch(agent, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    throw new Error(`Agent invocation failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function uploadToIPFS(
  content: any,
  apiUrl = process.env.IPFS_API_URL || 'http://localhost:5001/api/v0'
): Promise<string> {
  const data = (
    typeof content === 'string' || content instanceof Uint8Array
      ? content
      : JSON.stringify(content)
  ) as any;
  const form = new FormData();
  form.append('file', new Blob([data]));
  const res = await fetch(`${apiUrl}/add`, { method: 'POST', body: form });
  const body = await res.text();
  const lastLine = body.trim().split('\n').pop() || '{}';
  const parsed = JSON.parse(lastLine);
  return (
    parsed.Hash ||
    (parsed.Cid && (parsed.Cid['/'] || parsed.Cid.cid || parsed.Cid)) ||
    parsed.cid ||
    ''
  );
}

export async function runJob(
  jobId: string,
  stages: StageDefinition[],
  initialInput?: any
): Promise<JobRunResult> {
  auditLog('job.start', {
    jobId,
    details: { stages: stages.map((stage) => stage.name) },
  });
  const state = loadState();
  const graph = loadJobGraph();
  const deps = graph[jobId] || [];
  for (const dep of deps) {
    const depState = state[dep];
    if (!depState || !depState.completed) {
      throw new Error(`Job ${jobId} depends on ${dep} which is not completed`);
    }
  }
  if (!state[jobId]) {
    state[jobId] = {
      currentStage: 0,
      stages: stages.map((s) => ({ name: s.name })),
    };
  }
  const jobState = state[jobId];
  let input = initialInput;
  const cids: string[] = [];
  const stageObservations: WorldModelObservation[] = [];
  const initialInputSummary = summarizeContent(initialInput);

  for (let i = jobState.currentStage; i < stages.length; i++) {
    const stage = stages[i];
    const invocationTarget =
      typeof stage.agent === 'string'
        ? stage.agent
        : stage.name || `stage-${i}`;
    const agentId = stage.signerId || invocationTarget;
    const status = watchdog.getStatus(agentId);
    if (status && watchdog.isQuarantined(agentId)) {
      auditLog('stage.skipped_quarantined', {
        jobId,
        stageName: stage.name,
        agentId,
        details: { invocationTarget, status },
      });
      throw new Error(`Agent ${agentId} is quarantined`);
    }

    auditLog('stage.start', {
      jobId,
      stageName: stage.name,
      agentId,
      details: {
        invocationTarget,
        stageIndex: i,
        context: stage.context,
      },
    });

    try {
      const startedAt = new Date().toISOString();
      const previousMemory = stageObservations.slice(-3);
      const payload =
        typeof stage.agent === 'string'
          ? buildRemoteInvocationPayload({
              jobId,
              stage,
              stageIndex: i,
              input,
              memory: previousMemory,
              initialInput: initialInputSummary,
            })
          : input;
      let metricsSummary: ExecutionMetricsSummary | null = null;
      const output = await instrumentTask(
        {
          jobId,
          stageName: stage.name,
          agentId,
          input: payload,
          metadata: { stageIndex: i, invocationTarget },
          onMetrics: (metrics) => {
            metricsSummary = toMetricsSummary(metrics);
          },
        },
        () => invokeAgent(stage.agent, payload)
      );
      const signature = signAgentOutput(agentId, output);
      const cid = await uploadToIPFS(output);
      const signedAt = new Date().toISOString();
      const signatureRecord = {
        jobId,
        stage: stage.name,
        agentId,
        invocationTarget,
        digest: signature.digest,
        signature: signature.signature,
        signer: signature.signer,
        algorithm: signature.algorithm,
        canonicalPayload: signature.canonicalPayload,
        outputCid: cid,
        signedAt,
      };
      const signatureCid = await uploadToIPFS(signatureRecord);
      const observation = await recordWorldModelObservation({
        jobId,
        stage: stage.name,
        agentId,
        invocationTarget,
        stageIndex: i,
        context: stage.context,
        startedAt,
        completedAt: signedAt,
        input: payload,
        output,
        outputCid: cid,
        signatureCid,
        signature: signature.signature,
        signer: signature.signer,
        digest: signature.digest,
        metrics: metricsSummary ?? undefined,
      });
      stageObservations.push(observation);
      jobState.stages[i] = {
        name: stage.name,
        cid,
        signatureCid,
        signature: signature.signature,
        signer: signature.signer,
        digest: signature.digest,
        completedAt: signedAt,
        context: stage.context,
        inputSummary: observation.inputSummary ?? null,
        outputSummary: observation.outputSummary ?? null,
        metrics: metricsSummary,
      };
      jobState.currentStage = i + 1;
      if (i + 1 === stages.length) {
        jobState.completed = true;
      }
      state[jobId] = jobState;
      saveState(state);
      cids.push(cid);
      input = output;
      watchdog.recordSuccess(agentId);
      auditLog('stage.complete', {
        jobId,
        stageName: stage.name,
        agentId,
        details: {
          invocationTarget,
          outputCid: cid,
          signatureCid,
          signer: signature.signer,
          digest: signature.digest,
          metrics: metricsSummary ?? undefined,
          outputSummary: observation.outputSummary ?? undefined,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      watchdog.recordFailure(agentId, message);
      auditLog('stage.error', {
        jobId,
        stageName: stage.name,
        agentId,
        details: { invocationTarget, error: message },
      });
      auditLog('job.error', {
        jobId,
        stageName: stage.name,
        agentId,
        details: { invocationTarget, error: message },
      });
      throw err;
    }
  }
  const contextStage = stages[0]?.context;
  const snapshotContext: SnapshotContext = {
    category: contextStage?.category,
    tags: contextStage?.tags,
    metadata: contextStage?.metadata,
    initialInput: initialInputSummary ?? undefined,
  };
  const snapshot = buildWorldModelSnapshot(
    jobId,
    stageObservations,
    snapshotContext
  );
  await persistWorldModelSnapshot(snapshot);
  const artifacts: JobArtifact[] = stageObservations.map((obs) => ({
    stage: obs.stage,
    agentId: obs.agentId,
    invocationTarget: obs.invocationTarget,
    outputCid: obs.outputCid,
    signatureCid: obs.signatureCid,
    signature: obs.signature,
    signer: obs.signer,
    digest: obs.digest,
    summary: obs.outputSummary ?? null,
    metrics: obs.metrics ?? null,
    recordedAt: obs.completedAt ?? obs.recordedAt,
  }));
  const manifest: JobArtifactManifest = {
    jobId,
    createdAt: stageObservations[0]?.startedAt ?? new Date().toISOString(),
    completedAt:
      stageObservations[stageObservations.length - 1]?.completedAt ??
      new Date().toISOString(),
    pipeline: stages.map((stage) => stage.name),
    context: snapshot.context,
    initialInput: initialInputSummary ?? undefined,
    artifacts,
    worldModel: snapshot,
  };
  const manifestCid = await uploadToIPFS(manifest);
  auditLog('job.complete', {
    jobId,
    details: { outputCids: cids, manifestCid },
  });
  return {
    stageCids: cids,
    finalCid: cids.length ? cids[cids.length - 1] : null,
    manifestCid,
    manifest,
    snapshot,
  };
}

export type { JobState, JobStage };

interface RemotePayloadOptions {
  jobId: string;
  stage: StageDefinition;
  stageIndex: number;
  input: unknown;
  memory: WorldModelObservation[];
  initialInput: ContentSummary | null;
}

function buildRemoteInvocationPayload({
  jobId,
  stage,
  stageIndex,
  input,
  memory,
  initialInput,
}: RemotePayloadOptions): Record<string, unknown> {
  const recentMemory = memory.map((entry) => ({
    stage: entry.stage,
    agentId: entry.agentId,
    recordedAt: entry.completedAt ?? entry.recordedAt,
    outputCid: entry.outputCid,
    digest: entry.digest,
    summary: entry.outputSummary ?? null,
  }));
  const previous = memory[memory.length - 1];
  return {
    job: {
      id: jobId,
      category: stage.context.category,
      tags: stage.context.tags,
      metadata: stage.context.metadata,
    },
    stage: {
      name: stage.name,
      index: stageIndex,
      description: stage.context.metadata?.stageDescription,
    },
    input,
    initialInput,
    memory: recentMemory,
    previous: previous
      ? {
          stage: previous.stage,
          agentId: previous.agentId,
          outputCid: previous.outputCid,
          digest: previous.digest,
          summary: previous.outputSummary ?? null,
        }
      : undefined,
  };
}

function toMetricsSummary(
  metrics?: TaskMetrics
): ExecutionMetricsSummary | null {
  if (!metrics) return null;
  return {
    cpuTimeMs: metrics.cpuTimeMs,
    gpuTimeMs: metrics.gpuTimeMs,
    wallTimeMs: metrics.wallTimeMs,
    energyScore: metrics.energyScore,
    efficiencyScore: metrics.efficiencyScore,
    algorithmicComplexity: metrics.algorithmicComplexity,
    estimatedOperations: metrics.estimatedOperations,
    inputSize: metrics.inputSize,
    outputSize: metrics.outputSize,
    success: metrics.success,
    metadata: metrics.metadata,
    errorMessage: metrics.errorMessage,
  };
}
