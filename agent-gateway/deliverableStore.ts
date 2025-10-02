import fs from 'fs';
import path from 'path';
import { randomUUID, createHash } from 'crypto';
import { ethers } from 'ethers';

const STORAGE_ROOT = path.resolve(__dirname, '../storage/deliverables');
const TELEMETRY_DIR = path.join(STORAGE_ROOT, 'telemetry');
const DELIVERABLES_PATH = path.join(STORAGE_ROOT, 'deliverables.jsonl');
const HEARTBEATS_PATH = path.join(STORAGE_ROOT, 'heartbeats.jsonl');
const TELEMETRY_PATH = path.join(STORAGE_ROOT, 'telemetry.jsonl');
const PAYLOAD_INLINE_LIMIT = 8 * 1024; // 8 KB

export interface StoredPayloadReference {
  cid?: string;
  uri?: string;
  path?: string;
  digest?: string;
  bytes?: number;
  storedAt?: string;
  inline?: unknown;
}

export interface DeliverableContributor {
  address: string;
  ens?: string;
  role?: string;
  label?: string;
  signature?: string;
  payloadDigest?: string;
  metadata?: Record<string, unknown>;
}

export interface ContributorContribution {
  deliverableId: string;
  jobId: string;
  submittedAt: string;
  primary: boolean;
  role?: string;
  label?: string;
  signature?: string;
  payloadDigest?: string;
  metadata?: Record<string, unknown>;
}

export interface JobContributorSummary {
  address: string;
  ensNames: string[];
  roles: string[];
  labels: string[];
  signatures: string[];
  payloadDigests: string[];
  contributionCount: number;
  firstContributionAt: string;
  lastContributionAt: string;
  contributions: ContributorContribution[];
}

export interface AgentDeliverableRecord {
  id: string;
  jobId: string;
  agent: string;
  submittedAt: string;
  success: boolean;
  resultUri?: string;
  resultCid?: string;
  resultRef?: string;
  resultHash?: string;
  digest?: string;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  telemetry?: StoredPayloadReference;
  contributors?: DeliverableContributor[];
  submissionMethod?: 'finalizeJob' | 'submit' | 'none';
  txHash?: string;
  certificateMetadataUri?: string;
  certificateMetadataCid?: string;
  certificateMetadataIpnsName?: string;
}

export interface DeliverableInput {
  jobId: string;
  agent: string;
  success?: boolean;
  resultUri?: string;
  resultCid?: string;
  resultRef?: string;
  resultHash?: string;
  digest?: string;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  telemetry?: unknown;
  telemetryCid?: string;
  telemetryUri?: string;
  contributors?: DeliverableContributor[];
  submissionMethod?: 'finalizeJob' | 'submit' | 'none';
  txHash?: string;
  submittedAt?: string;
  certificateMetadataUri?: string;
  certificateMetadataCid?: string;
  certificateMetadataIpnsName?: string;
}

export interface AgentHeartbeatRecord {
  id: string;
  jobId: string;
  agent: string;
  status: string;
  recordedAt: string;
  note?: string;
  telemetry?: StoredPayloadReference;
  metadata?: Record<string, unknown>;
}

export interface HeartbeatInput {
  jobId: string;
  agent: string;
  status: string;
  note?: string;
  telemetry?: unknown;
  telemetryCid?: string;
  telemetryUri?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTelemetryRecord {
  id: string;
  jobId: string;
  agent: string;
  recordedAt: string;
  payload?: StoredPayloadReference;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  spanId?: string;
  status?: string;
}

export interface TelemetryRecordInput {
  jobId: string;
  agent: string;
  payload?: unknown;
  cid?: string;
  uri?: string;
  signature?: string;
  proof?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  spanId?: string;
  status?: string;
}

interface QueryOptions {
  jobId?: string;
  agent?: string;
  limit?: number;
}

export interface ContributorQueryOptions extends QueryOptions {
  includePrimary?: boolean;
}

function ensureDirectory(dir: string, mode: number = 0o700): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode });
    return;
  }
  try {
    const stats = fs.statSync(dir);
    if (!stats.isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }
    if ((stats.mode & 0o777) !== mode) {
      fs.chmodSync(dir, mode);
    }
  } catch (err) {
    console.warn('deliverable storage permission check failed', dir, err);
  }
}

ensureDirectory(STORAGE_ROOT);
ensureDirectory(TELEMETRY_DIR);

function loadJsonLines<T>(file: string): T[] {
  try {
    const data = fs.readFileSync(file, 'utf8');
    const lines = data.split('\n');
    const records: T[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed) as T);
      } catch (err) {
        console.warn('Failed to parse deliverable store record', file, err);
      }
    }
    return records;
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.warn('Failed to load deliverable store', file, err);
    }
    return [];
  }
}

const deliverables: AgentDeliverableRecord[] = loadJsonLines(DELIVERABLES_PATH);
const heartbeats: AgentHeartbeatRecord[] = loadJsonLines(HEARTBEATS_PATH);
const telemetryReports: AgentTelemetryRecord[] = loadJsonLines(TELEMETRY_PATH);

function appendRecord(file: string, record: unknown): void {
  ensureDirectory(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function clone<T>(value: T): T {
  const scoped: typeof structuredClone | undefined = (globalThis as any)
    ?.structuredClone;
  if (typeof scoped === 'function') {
    return scoped(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normaliseAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch {
    return address.toLowerCase();
  }
}

function resolveStoredPath(relativePath: string): string | null {
  const candidate = path.resolve(STORAGE_ROOT, relativePath);
  if (candidate === STORAGE_ROOT) {
    return candidate;
  }
  if (!candidate.startsWith(STORAGE_ROOT + path.sep)) {
    console.warn('rejecting payload outside storage root', relativePath);
    return null;
  }
  return candidate;
}

export function loadStoredPayload(
  reference?: StoredPayloadReference
): unknown | null {
  if (!reference) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(reference, 'inline')) {
    return clone((reference as { inline?: unknown }).inline);
  }
  if (!reference.path) {
    return null;
  }
  const resolved = resolveStoredPath(reference.path);
  if (!resolved) {
    return null;
  }
  try {
    const data = fs.readFileSync(resolved, 'utf8');
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  } catch (err) {
    console.warn('failed to read stored payload', reference.path, err);
    return null;
  }
}

function createPayloadReference(
  payload: unknown,
  {
    cid,
    uri,
    prefix,
  }: { cid?: string; uri?: string; prefix: string }
): StoredPayloadReference | undefined {
  const hasMetadata = cid || uri;
  if (payload === undefined || payload === null) {
    return hasMetadata ? { cid, uri } : undefined;
  }
  let canonical: string;
  try {
    canonical = JSON.stringify(payload);
  } catch {
    canonical = String(payload);
  }
  const digest = createHash('sha256').update(canonical).digest('hex');
  const byteLength = Buffer.byteLength(canonical, 'utf8');
  if (byteLength <= PAYLOAD_INLINE_LIMIT) {
    try {
      return { cid, uri, inline: JSON.parse(canonical), digest };
    } catch {
      return { cid, uri, inline: canonical, digest };
    }
  }
  ensureDirectory(TELEMETRY_DIR);
  const fileName = `${prefix}-${Date.now()}-${randomUUID()}.json`;
  const filePath = path.join(TELEMETRY_DIR, fileName);
  fs.writeFileSync(filePath, canonical, { encoding: 'utf8', mode: 0o600 });
  const relativePath = path.relative(STORAGE_ROOT, filePath);
  return {
    cid,
    uri,
    path: relativePath,
    digest,
    bytes: byteLength,
    storedAt: new Date().toISOString(),
  };
}

function selectRecords<T extends { jobId: string; agent: string }>(
  records: T[],
  { jobId, agent, limit }: QueryOptions,
  timestampKey: keyof T
): T[] {
  const filtered = records.filter((record) => {
    if (jobId && record.jobId !== jobId) {
      return false;
    }
    if (agent && record.agent.toLowerCase() !== agent.toLowerCase()) {
      return false;
    }
    return true;
  });
  const key = timestampKey as string;
  const sorted = filtered
    .slice()
    .sort((a, b) => {
      const aValue = String((a as Record<string, unknown>)[key] ?? '');
      const bValue = String((b as Record<string, unknown>)[key] ?? '');
      return bValue.localeCompare(aValue);
    });
  if (
    typeof limit === 'number' &&
    Number.isFinite(limit) &&
    limit >= 0
  ) {
    return sorted.slice(0, limit);
  }
  return sorted;
}

export function recordDeliverable(
  input: DeliverableInput
): AgentDeliverableRecord {
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const record: AgentDeliverableRecord = {
    id: randomUUID(),
    jobId: String(input.jobId),
    agent: normaliseAddress(input.agent),
    submittedAt,
    success: input.success !== false,
    resultUri: input.resultUri,
    resultCid: input.resultCid,
    resultRef: input.resultRef,
    resultHash: input.resultHash,
    digest: input.digest,
    signature: input.signature,
    proof: input.proof,
    metadata: input.metadata,
    telemetry: createPayloadReference(input.telemetry, {
      cid: input.telemetryCid,
      uri: input.telemetryUri,
      prefix: 'deliverable',
    }),
    contributors: Array.isArray(input.contributors)
      ? input.contributors.map((entry) => ({
          ...entry,
          address: normaliseAddress(entry.address),
        }))
      : undefined,
    submissionMethod: input.submissionMethod,
    txHash: input.txHash,
    certificateMetadataUri: input.certificateMetadataUri,
    certificateMetadataCid: input.certificateMetadataCid,
    certificateMetadataIpnsName: input.certificateMetadataIpnsName,
  };
  deliverables.push(record);
  appendRecord(DELIVERABLES_PATH, record);
  return clone(record);
}

export function listDeliverables(
  options: QueryOptions = {}
): AgentDeliverableRecord[] {
  const selected = selectRecords(deliverables, options, 'submittedAt');
  return selected.map((record) => clone(record));
}

export function getLatestDeliverable(
  jobId: string,
  agent?: string
): AgentDeliverableRecord | null {
  const [record] = selectRecords(
    deliverables,
    { jobId, agent, limit: 1 },
    'submittedAt'
  );
  return record ? clone(record) : null;
}

export function recordHeartbeat(
  input: HeartbeatInput
): AgentHeartbeatRecord {
  const record: AgentHeartbeatRecord = {
    id: randomUUID(),
    jobId: String(input.jobId),
    agent: normaliseAddress(input.agent),
    status: input.status,
    recordedAt: new Date().toISOString(),
    note: input.note,
    telemetry: createPayloadReference(input.telemetry, {
      cid: input.telemetryCid,
      uri: input.telemetryUri,
      prefix: 'heartbeat',
    }),
    metadata: input.metadata,
  };
  heartbeats.push(record);
  appendRecord(HEARTBEATS_PATH, record);
  return clone(record);
}

export function listHeartbeats(
  options: QueryOptions = {}
): AgentHeartbeatRecord[] {
  const selected = selectRecords(heartbeats, options, 'recordedAt');
  return selected.map((record) => clone(record));
}

export function recordTelemetryReport(
  input: TelemetryRecordInput
): AgentTelemetryRecord {
  const record: AgentTelemetryRecord = {
    id: randomUUID(),
    jobId: String(input.jobId),
    agent: normaliseAddress(input.agent),
    recordedAt: new Date().toISOString(),
    payload: createPayloadReference(input.payload, {
      cid: input.cid,
      uri: input.uri,
      prefix: 'telemetry-report',
    }),
    signature: input.signature,
    proof: input.proof,
    metadata: input.metadata,
    spanId: input.spanId,
    status: input.status,
  };
  telemetryReports.push(record);
  appendRecord(TELEMETRY_PATH, record);
  return clone(record);
}

export function listTelemetryReports(
  options: QueryOptions = {}
): AgentTelemetryRecord[] {
  const selected = selectRecords(telemetryReports, options, 'recordedAt');
  return selected.map((record) => clone(record));
}

interface ContributorAccumulator {
  summary: JobContributorSummary;
  ensNames: Set<string>;
  roles: Set<string>;
  labels: Set<string>;
  signatures: Set<string>;
  payloadDigests: Set<string>;
}

function createAccumulator(address: string): ContributorAccumulator {
  return {
    summary: {
      address,
      ensNames: [],
      roles: [],
      labels: [],
      signatures: [],
      payloadDigests: [],
      contributionCount: 0,
      firstContributionAt: '',
      lastContributionAt: '',
      contributions: [],
    },
    ensNames: new Set<string>(),
    roles: new Set<string>(),
    labels: new Set<string>(),
    signatures: new Set<string>(),
    payloadDigests: new Set<string>(),
  };
}

function sortedValues(values: Set<string>): string[] {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function appendContribution(
  accumulators: Map<string, ContributorAccumulator>,
  address: string,
  detail: ContributorContribution,
  ens?: string
): void {
  const normalisedAddress = normaliseAddress(address);
  const key = normalisedAddress.toLowerCase();
  let accumulator = accumulators.get(key);
  if (!accumulator) {
    accumulator = createAccumulator(normalisedAddress);
    accumulators.set(key, accumulator);
  }

  if (ens && ens.trim().length > 0) {
    accumulator.ensNames.add(ens.trim());
  }
  if (detail.role) {
    accumulator.roles.add(detail.role);
  }
  if (detail.label) {
    accumulator.labels.add(detail.label);
  }
  if (detail.signature) {
    accumulator.signatures.add(detail.signature);
  }
  if (detail.payloadDigest) {
    accumulator.payloadDigests.add(detail.payloadDigest);
  }

  const contribution: ContributorContribution = {
    deliverableId: detail.deliverableId,
    jobId: detail.jobId,
    submittedAt: detail.submittedAt,
    primary: detail.primary,
    role: detail.role,
    label: detail.label,
    signature: detail.signature,
    payloadDigest: detail.payloadDigest,
    metadata: detail.metadata ? clone(detail.metadata) : undefined,
  };

  accumulator.summary.contributions.push(contribution);

  const { summary } = accumulator;
  if (!summary.firstContributionAt || detail.submittedAt < summary.firstContributionAt) {
    summary.firstContributionAt = detail.submittedAt;
  }
  if (!summary.lastContributionAt || detail.submittedAt > summary.lastContributionAt) {
    summary.lastContributionAt = detail.submittedAt;
  }
}

export function listContributorSummaries(
  options: ContributorQueryOptions = {}
): JobContributorSummary[] {
  const includePrimary = options.includePrimary !== false;
  const selected = selectRecords(deliverables, options, 'submittedAt');
  const accumulators = new Map<string, ContributorAccumulator>();

  for (const record of selected) {
    if (includePrimary) {
      appendContribution(
        accumulators,
        record.agent,
        {
          deliverableId: record.id,
          jobId: record.jobId,
          submittedAt: record.submittedAt,
          primary: true,
          role: 'primary',
          metadata: record.metadata ? clone(record.metadata) : undefined,
        }
      );
    }
    if (record.contributors) {
      for (const contributor of record.contributors) {
        appendContribution(
          accumulators,
          contributor.address,
          {
            deliverableId: record.id,
            jobId: record.jobId,
            submittedAt: record.submittedAt,
            primary: false,
            role: contributor.role,
            label: contributor.label,
            signature: contributor.signature,
            payloadDigest: contributor.payloadDigest,
            metadata: contributor.metadata
              ? clone(contributor.metadata)
              : undefined,
          },
          contributor.ens
        );
      }
    }
  }

  const summaries: JobContributorSummary[] = [];
  for (const accumulator of accumulators.values()) {
    const { summary } = accumulator;
    summary.contributions.sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt)
    );
    summary.contributionCount = summary.contributions.length;
    if (summary.contributions.length > 0) {
      summary.lastContributionAt = summary.contributions[0].submittedAt;
      summary.firstContributionAt =
        summary.contributions[summary.contributions.length - 1].submittedAt;
    } else {
      summary.lastContributionAt = '';
      summary.firstContributionAt = '';
    }
    summary.ensNames = sortedValues(accumulator.ensNames);
    summary.roles = sortedValues(accumulator.roles);
    summary.labels = sortedValues(accumulator.labels);
    summary.signatures = sortedValues(accumulator.signatures);
    summary.payloadDigests = sortedValues(accumulator.payloadDigests);
    summaries.push(clone(summary));
  }

  return summaries.sort((a, b) =>
    b.lastContributionAt.localeCompare(a.lastContributionAt)
  );
}

function findById<T extends { id: string }>(records: T[], id: string): T | null {
  if (!id) {
    return null;
  }
  const record = records.find((entry) => entry.id === id);
  return record ? clone(record) : null;
}

export function getDeliverableById(id: string): AgentDeliverableRecord | null {
  return findById(deliverables, id);
}

export function getHeartbeatById(id: string): AgentHeartbeatRecord | null {
  return findById(heartbeats, id);
}

export function getTelemetryReportById(id: string): AgentTelemetryRecord | null {
  return findById(telemetryReports, id);
}
