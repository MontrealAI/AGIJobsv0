import fs from 'fs';
import path from 'path';

export interface StageDefinition {
  name: string;
  agent: string | ((input: any) => Promise<any>);
}

interface JobStage {
  name: string;
  cid?: string;
}

interface JobState {
  currentStage: number;
  stages: JobStage[];
  completed?: boolean;
}

const STATE_FILE = path.resolve(__dirname, 'state.json');

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
  const data =
    typeof content === 'string' || content instanceof Uint8Array
      ? content
      : JSON.stringify(content);
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
  const state = loadState();
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
    const output = await invokeAgent(stage.agent, input);
    const cid = await uploadToIPFS(output);
    jobState.stages[i].cid = cid;
    jobState.currentStage = i + 1;
    state[jobId] = jobState;
    saveState(state);
    cids.push(cid);
    input = output;
  }
  return cids;
}

export type { JobState, JobStage };
