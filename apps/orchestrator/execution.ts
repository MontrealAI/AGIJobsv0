import fs from 'fs';
import path from 'path';

import { instrumentTask } from './metrics';
import { auditLog } from './audit';
import { getWatchdog } from './monitor';
import { signAgentOutput } from './signing';

export interface StageDefinition {
  name: string;
  agent: string | ((input: any) => Promise<any>);
  signerId?: string;
}

interface JobStage {
  name: string;
  cid?: string;
  signatureCid?: string;
  signature?: string;
  signer?: string;
  digest?: string;
  completedAt?: string;
}

interface JobState {
  currentStage: number;
  stages: JobStage[];
  completed?: boolean;
}

const STATE_FILE = path.resolve(__dirname, 'state.json');
const GRAPH_FILE = path.resolve(__dirname, 'jobGraph.json');
const watchdog = getWatchdog();

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
): Promise<string[]> {
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
      details: { invocationTarget, stageIndex: i },
    });

    try {
      const output = await instrumentTask(
        {
          jobId,
          stageName: stage.name,
          agentId,
          input,
          metadata: { stageIndex: i },
        },
        () => invokeAgent(stage.agent, input)
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
      jobState.stages[i] = {
        name: stage.name,
        cid,
        signatureCid,
        signature: signature.signature,
        signer: signature.signer,
        digest: signature.digest,
        completedAt: signedAt,
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
  auditLog('job.complete', {
    jobId,
    details: { outputCids: cids },
  });
  return cids;
}

export type { JobState, JobStage };
