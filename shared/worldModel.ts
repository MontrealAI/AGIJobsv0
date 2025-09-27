import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

export interface ContentSummary {
  type: string;
  length: number;
  preview: string;
  hash: string;
}

export interface StageContextSnapshot {
  category?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ExecutionMetricsSummary {
  cpuTimeMs: number;
  gpuTimeMs: number;
  wallTimeMs: number;
  energyScore: number;
  efficiencyScore: number;
  algorithmicComplexity: string;
  estimatedOperations: number;
  inputSize: number;
  outputSize: number;
  success: boolean;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export interface WorldModelObservation {
  jobId: string;
  stage: string;
  agentId?: string;
  invocationTarget?: string;
  stageIndex?: number;
  context?: StageContextSnapshot;
  recordedAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputSummary?: ContentSummary | null;
  outputSummary?: ContentSummary | null;
  outputCid?: string;
  outputUrl?: string;
  signatureCid?: string;
  signatureUrl?: string;
  signature?: string;
  signer?: string;
  digest?: string;
  metrics?: ExecutionMetricsSummary | null;
}

export interface SnapshotContext extends StageContextSnapshot {
  initialInput?: ContentSummary | null;
}

export interface WorldModelSnapshot {
  jobId: string;
  stageCount: number;
  context?: SnapshotContext;
  tags: string[];
  categories: string[];
  keywords: string[];
  observations: Array<{
    stage: string;
    agentId?: string;
    recordedAt?: string;
    outputCid?: string;
    digest?: string;
    summary?: ContentSummary | null;
    metrics?: {
      energyScore: number;
      efficiencyScore: number;
      wallTimeMs: number;
    };
  }>;
  lastUpdated: string;
}

export interface RecordObservationInput {
  jobId: string;
  stage: string;
  agentId?: string;
  invocationTarget?: string;
  stageIndex?: number;
  context?: StageContextSnapshot;
  startedAt?: string;
  completedAt?: string;
  input?: unknown;
  output?: unknown;
  outputCid?: string;
  outputUrl?: string;
  signatureCid?: string;
  signatureUrl?: string;
  signature?: string;
  signer?: string;
  digest?: string;
  metrics?: ExecutionMetricsSummary | null;
}

const WORLD_MODEL_ROOT = path.resolve(__dirname, '../storage/world-model');
const OBSERVATIONS_PATH = path.join(WORLD_MODEL_ROOT, 'observations.jsonl');
const SNAPSHOT_DIR = path.join(WORLD_MODEL_ROOT, 'snapshots');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normaliseString(value: unknown): { text: string; type: string } {
  if (value === null) {
    return { text: 'null', type: 'null' };
  }
  if (value === undefined) {
    return { text: 'undefined', type: 'undefined' };
  }
  if (typeof value === 'string') {
    return { text: value, type: 'text' };
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value), type: typeof value };
  }
  if (typeof value === 'bigint') {
    return { text: value.toString(), type: 'bigint' };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const buffer = Buffer.from(value);
    return { text: buffer.toString('base64'), type: 'binary' };
  }
  try {
    return {
      text: JSON.stringify(value),
      type: Array.isArray(value) ? 'json-array' : 'json-object',
    };
  } catch {
    return { text: String(value), type: typeof value };
  }
}

export function summarizeContent(value: unknown): ContentSummary | null {
  const { text, type } = normaliseString(value);
  if (type === 'undefined') {
    return null;
  }
  const previewLength = 280;
  const preview = text.slice(0, previewLength);
  const hash = createHash('sha256').update(text).digest('hex');
  return {
    type,
    length: text.length,
    preview,
    hash,
  };
}

export async function recordWorldModelObservation(
  input: RecordObservationInput
): Promise<WorldModelObservation> {
  const recordedAt = input.completedAt ?? new Date().toISOString();
  const observation: WorldModelObservation = {
    jobId: input.jobId,
    stage: input.stage,
    agentId: input.agentId,
    invocationTarget: input.invocationTarget,
    stageIndex: input.stageIndex,
    context: input.context,
    recordedAt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outputCid: input.outputCid,
    outputUrl: input.outputUrl,
    signatureCid: input.signatureCid,
    signatureUrl: input.signatureUrl,
    signature: input.signature,
    signer: input.signer,
    digest: input.digest,
    metrics: input.metrics ?? null,
  };
  if (input.input !== undefined) {
    observation.inputSummary = summarizeContent(input.input);
  }
  if (input.output !== undefined) {
    observation.outputSummary = summarizeContent(input.output);
  }
  const wallTime = input.metrics?.wallTimeMs;
  if (typeof wallTime === 'number' && Number.isFinite(wallTime)) {
    observation.durationMs = wallTime;
  } else if (input.startedAt && input.completedAt) {
    const start = Date.parse(input.startedAt);
    const end = Date.parse(input.completedAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      observation.durationMs = end - start;
    }
  }
  ensureDirectory(path.dirname(OBSERVATIONS_PATH));
  await fs.promises.appendFile(
    OBSERVATIONS_PATH,
    `${JSON.stringify(observation)}\n`,
    'utf8'
  );
  return observation;
}

export async function loadWorldModelObservations(
  jobId?: string
): Promise<WorldModelObservation[]> {
  try {
    const raw = await fs.promises.readFile(OBSERVATIONS_PATH, 'utf8');
    const entries = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as WorldModelObservation);
    if (!jobId) {
      return entries;
    }
    return entries.filter((entry) => entry.jobId === jobId);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function accumulateKeywords(text: string, set: Set<string>): void {
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.toLowerCase().replace(/[^a-z0-9]/gi, '');
    if (cleaned.length > 4) {
      set.add(cleaned);
    }
  }
}

export function buildWorldModelSnapshot(
  jobId: string,
  observations: WorldModelObservation[],
  context?: SnapshotContext
): WorldModelSnapshot {
  const tagSet = new Set<string>(context?.tags ?? []);
  const categorySet = new Set<string>();
  if (context?.category) {
    categorySet.add(context.category);
  }
  const keywordSet = new Set<string>();
  const timeline = observations.map((obs) => {
    if (obs.context?.tags) {
      for (const tag of obs.context.tags) {
        tagSet.add(tag);
      }
    }
    if (obs.context?.category) {
      categorySet.add(obs.context.category);
    }
    const preview = obs.outputSummary?.preview;
    if (preview) {
      accumulateKeywords(preview, keywordSet);
    }
    return {
      stage: obs.stage,
      agentId: obs.agentId,
      recordedAt: obs.completedAt ?? obs.recordedAt,
      outputCid: obs.outputCid,
      digest: obs.digest,
      summary: obs.outputSummary ?? null,
      metrics: obs.metrics
        ? {
            energyScore: obs.metrics.energyScore,
            efficiencyScore: obs.metrics.efficiencyScore,
            wallTimeMs: obs.metrics.wallTimeMs,
          }
        : undefined,
    };
  });
  return {
    jobId,
    stageCount: observations.length,
    context,
    tags: Array.from(tagSet),
    categories: Array.from(categorySet),
    keywords: Array.from(keywordSet).slice(0, 32),
    observations: timeline,
    lastUpdated: new Date().toISOString(),
  };
}

export async function persistWorldModelSnapshot(
  snapshot: WorldModelSnapshot
): Promise<void> {
  ensureDirectory(SNAPSHOT_DIR);
  const filePath = path.join(SNAPSHOT_DIR, `${snapshot.jobId}.json`);
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(snapshot, null, 2),
    'utf8'
  );
}

export function worldModelRoot(): string {
  ensureDirectory(WORLD_MODEL_ROOT);
  return WORLD_MODEL_ROOT;
}

export function observationsPath(): string {
  ensureDirectory(path.dirname(OBSERVATIONS_PATH));
  return OBSERVATIONS_PATH;
}

export function snapshotsDirectory(): string {
  ensureDirectory(SNAPSHOT_DIR);
  return SNAPSHOT_DIR;
}
