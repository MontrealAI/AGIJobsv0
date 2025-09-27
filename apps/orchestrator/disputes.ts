import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';

import type {
  ClassificationResult,
  JobSpec,
  ChainJobSummary,
} from './jobClassifier';
import type { JobArtifactManifest, JobRunResult } from './execution';
import { uploadToIPFS } from './execution';
import type { WorldModelSnapshot } from '../../shared/worldModel';
import type { JobEnergyLog } from './metrics';

const DISPUTE_STORAGE_ROOT = path.resolve(__dirname, '../../storage/disputes');
const COMPLETED_DIR = path.join(DISPUTE_STORAGE_ROOT, 'completed');
const RESPONSES_DIR = path.join(DISPUTE_STORAGE_ROOT, 'responses');

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeForFs(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_');
}

function evidenceFile(jobId: string): string {
  ensureDirectory(COMPLETED_DIR);
  return path.join(COMPLETED_DIR, `${sanitizeForFs(jobId)}.json`);
}

function responseFile(jobId: string, preparedAt: string): string {
  ensureDirectory(RESPONSES_DIR);
  const timestamp = preparedAt.replace(/[:]/g, '-');
  return path.join(
    RESPONSES_DIR,
    `${sanitizeForFs(jobId)}-${timestamp}-${randomUUID()}.json`
  );
}

export interface AgentEvidenceProfile {
  address: string;
  ens?: string;
  label?: string;
  role?: string;
  capabilities?: string[];
}

export interface OnChainJobSnapshot {
  employer?: string;
  agent?: string;
  reward?: string;
  stake?: string;
  feePct?: string;
  agentPct?: string;
  state?: number;
  success?: boolean;
  assignedAt?: string;
  deadline?: string;
  agentTypes?: number;
  resultHash?: string;
  specHash?: string;
  uriHash?: string;
  burnReceiptAmount?: string;
}

export interface CompletedJobEvidence {
  jobId: string;
  agent: AgentEvidenceProfile;
  orchestrator?: string;
  classification: ClassificationResult;
  spec: JobSpec | null;
  summary: ChainJobSummary;
  resultRef: string;
  manifestCid: string;
  manifestUrl?: string;
  manifestGatewayUrls?: string[];
  finalCid: string | null;
  stageCids: string[];
  stageCount: number;
  manifest: JobArtifactManifest;
  snapshot: WorldModelSnapshot;
  keywords?: string[];
  tags?: string[];
  submittedAt: string;
  pipeline: string[];
  onChain: OnChainJobSnapshot;
  storagePath?: string;
}

export interface DisputeEvidenceBundle {
  jobId: string;
  preparedAt: string;
  agent: AgentEvidenceProfile;
  orchestrator?: string;
  manifestCid: string;
  manifestUrl?: string;
  manifestGatewayUrls?: string[];
  resultRef: string;
  submittedAt?: string;
  classification: ClassificationResult;
  spec: JobSpec | null;
  summary: ChainJobSummary;
  manifest: JobArtifactManifest;
  snapshot: WorldModelSnapshot;
  stageCids: string[];
  finalCid: string | null;
  stageCount: number;
  pipeline: string[];
  tags?: string[];
  keywords?: string[];
  onChain: OnChainJobSnapshot;
  energyLog?: JobEnergyLog | null;
  notes?: string[];
}

export interface EvidencePreparationOptions {
  energyLog?: JobEnergyLog | null;
  additionalNotes?: string[];
  ipfsApiUrl?: string;
}

export interface DisputeResolutionRecord {
  employerWins: boolean;
  resolver: string;
  resolvedAt: string;
  txHash?: string;
}

export interface PreparedDisputeEvidence {
  jobId: string;
  hash: string;
  cid: string | null;
  uri: string | null;
  gatewayUrl?: string | null;
  gatewayUrls?: string[];
  preparedAt: string;
  payload: DisputeEvidenceBundle;
  filePath: string;
  uploadError?: string;
  resolution?: DisputeResolutionRecord;
}

function normaliseNotes(notes: string[] | undefined): string[] | undefined {
  if (!notes || notes.length === 0) return undefined;
  const cleaned = notes
    .map((note) => (typeof note === 'string' ? note.trim() : ''))
    .filter((note) => note.length > 0);
  return cleaned.length ? cleaned : undefined;
}

export function loadCompletedJobEvidence(): Map<string, CompletedJobEvidence> {
  ensureDirectory(COMPLETED_DIR);
  const records = new Map<string, CompletedJobEvidence>();
  const entries = fs.readdirSync(COMPLETED_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(COMPLETED_DIR, entry.name);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw.trim()) continue;
      const parsed = JSON.parse(raw) as CompletedJobEvidence;
      if (!parsed || typeof parsed !== 'object') continue;
      if (!parsed.jobId) continue;
      parsed.storagePath = filePath;
      records.set(parsed.jobId, parsed);
    } catch (err) {
      console.warn('Failed to load completed job evidence', filePath, err);
    }
  }
  return records;
}

export function persistCompletedJobEvidence(
  record: CompletedJobEvidence
): string {
  const filePath = evidenceFile(record.jobId);
  const payload = { ...record };
  delete (payload as { storagePath?: string }).storagePath;
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

export async function prepareJobDisputeEvidence(
  record: CompletedJobEvidence,
  options?: EvidencePreparationOptions
): Promise<PreparedDisputeEvidence> {
  const preparedAt = new Date().toISOString();
  const notes = normaliseNotes(options?.additionalNotes);

  const bundle: DisputeEvidenceBundle = {
    jobId: record.jobId,
    preparedAt,
    agent: record.agent,
    orchestrator: record.orchestrator,
    manifestCid: record.manifestCid,
    manifestUrl: record.manifestUrl,
    manifestGatewayUrls: record.manifestGatewayUrls,
    resultRef: record.resultRef,
    submittedAt: record.submittedAt,
    classification: record.classification,
    spec: record.spec,
    summary: record.summary,
    manifest: record.manifest,
    snapshot: record.snapshot,
    stageCids: record.stageCids,
    finalCid: record.finalCid,
    stageCount: record.stageCount,
    pipeline: record.pipeline,
    tags: record.tags,
    keywords: record.keywords,
    onChain: record.onChain,
    energyLog: options?.energyLog,
    notes,
  };

  const json = JSON.stringify(bundle, null, 2);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(json));
  let cid: string | null = null;
  let uploadError: string | undefined;
  let gatewayUrl: string | null | undefined;
  let gatewayUrls: string[] | undefined;
  try {
    const uploaded = await uploadToIPFS(bundle, options?.ipfsApiUrl);
    if (uploaded?.cid && uploaded.cid.trim().length > 0) {
      cid = uploaded.cid;
      gatewayUrl = uploaded.url;
      gatewayUrls = uploaded.gatewayUrls;
    }
  } catch (err) {
    uploadError = err instanceof Error ? err.message : String(err);
  }

  const prepared: PreparedDisputeEvidence = {
    jobId: record.jobId,
    hash,
    cid,
    uri: cid ? `ipfs://${cid}` : null,
    gatewayUrl: gatewayUrl ?? (cid ? `https://ipfs.io/ipfs/${cid}` : null),
    gatewayUrls,
    preparedAt,
    payload: bundle,
    filePath: responseFile(record.jobId, preparedAt),
    uploadError,
  };

  const { filePath, ...persistable } = prepared;
  fs.writeFileSync(filePath, JSON.stringify(persistable, null, 2));
  return prepared;
}

export function recordDisputeResolution(
  evidence: PreparedDisputeEvidence,
  resolution: DisputeResolutionRecord
): PreparedDisputeEvidence {
  const updated: PreparedDisputeEvidence = {
    ...evidence,
    resolution,
  };
  const { filePath, ...persistable } = updated;
  fs.writeFileSync(filePath, JSON.stringify(persistable, null, 2));
  return updated;
}

export function toCompletedJobEvidence(
  jobId: string,
  agent: AgentEvidenceProfile,
  orchestrator: string | undefined,
  classification: ClassificationResult,
  spec: JobSpec | null,
  summary: ChainJobSummary,
  runResult: JobRunResult,
  resultRef: string,
  onChain: OnChainJobSnapshot
): CompletedJobEvidence {
  return {
    jobId,
    agent,
    orchestrator,
    classification,
    spec,
    summary,
    resultRef,
    manifestCid: runResult.manifestCid,
    manifestUrl: runResult.manifestUrl,
    manifestGatewayUrls: runResult.manifestGatewayUrls,
    finalCid: runResult.finalCid,
    stageCids: runResult.stageCids,
    stageCount: runResult.snapshot.stageCount,
    manifest: runResult.manifest,
    snapshot: runResult.snapshot,
    keywords: runResult.snapshot.keywords,
    tags: classification.tags,
    submittedAt: new Date().toISOString(),
    pipeline: [...runResult.manifest.pipeline],
    onChain,
  };
}
