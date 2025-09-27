import fs from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

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
  url?: string;
  signatureCid?: string;
  signatureUrl?: string;
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
  outputUrl?: string;
  signatureCid?: string;
  signatureUrl?: string;
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
  manifestUrl: string;
  manifestGatewayUrls: string[];
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

const DEFAULT_IPFS_API = 'http://localhost:5001/api/v0';
const DEFAULT_PINNER_ENDPOINT = 'https://api.web3.storage';
const DEFAULT_WEB3_STORAGE_ENDPOINT = 'https://api.web3.storage';
const DEFAULT_PINATA_ENDPOINT = 'https://api.pinata.cloud';
const DEFAULT_GATEWAY_FALLBACKS = [
  (cid: string) => `https://w3s.link/ipfs/${cid}`,
  (cid: string) => `https://ipfs.io/ipfs/${cid}`,
  (cid: string) => `https://cloudflare-ipfs.com/ipfs/${cid}`,
];

export interface PinnedContent {
  cid: string;
  uri: string;
  url: string;
  gatewayUrls: string[];
  provider: string;
  status?: string;
  requestId?: string;
  attempts: number;
  size?: number;
  pinnedAt?: string;
}

interface PinningCandidateConfig {
  endpoint: string;
  token: string;
  provider?: string;
  gatewayUrls?: string | string[];
}

class PinningServiceError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    provider: string,
    status?: number,
    retryable = false,
    cause?: unknown
  ) {
    super(message);
    this.name = 'PinningServiceError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
    if (cause !== undefined) {
      (this as unknown as { cause?: unknown }).cause = cause;
    }
  }
}

export interface UploadToIPFSOptions {
  apiUrl?: string;
  fileName?: string;
  contentType?: string;
  pinnerEndpoint?: string;
  pinnerToken?: string;
}

export function parseIpfsAddResponse(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const hash = extractCidFromPinningResponse(parsed);
      if (hash) return hash;
    } catch {
      // ignore lines that are not valid JSON
    }
  }
  return '';
}

export function extractCidFromPinningResponse(payload: unknown): string {
  if (!payload) {
    return '';
  }
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return '';
    try {
      return extractCidFromPinningResponse(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (typeof payload !== 'object') {
    return '';
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.Hash === 'string' && record.Hash) {
    return record.Hash;
  }
  if (typeof record.cid === 'string' && record.cid) {
    return record.cid;
  }
  if (typeof record.Cid === 'string' && record.Cid) {
    return record.Cid;
  }

  const cidField = record.cid ?? record.Cid ?? record.value ?? record.data;
  if (typeof cidField === 'string' && cidField) {
    return cidField;
  }
  if (cidField && typeof cidField === 'object') {
    const nested = cidField as Record<string, unknown>;
    const candidate =
      (typeof nested['/'] === 'string' && nested['/']) ||
      (typeof nested.cid === 'string' && nested.cid) ||
      (typeof nested.Cid === 'string' && nested.Cid) ||
      (typeof nested.Hash === 'string' && nested.Hash);
    if (candidate) {
      return candidate;
    }
  }

  if (typeof record.value === 'string' && record.value) {
    return record.value;
  }

  if (typeof record.result === 'string' && record.result) {
    return record.result;
  }

  return '';
}

function normalizeUploadOptions(
  options?: string | UploadToIPFSOptions
): UploadToIPFSOptions {
  if (typeof options === 'string') {
    return { apiUrl: options };
  }
  return options ?? {};
}

function buildPinnerCandidates(
  options: UploadToIPFSOptions
): PinningCandidateConfig[] {
  const candidates: PinningCandidateConfig[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: PinningCandidateConfig | null | undefined) => {
    if (!candidate) return;
    const endpoint = candidate.endpoint?.trim();
    const token = candidate.token?.trim();
    if (!endpoint || !token) {
      return;
    }
    const key = `${endpoint}|${token}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push({
      endpoint,
      token,
      provider: candidate.provider ?? detectProviderName(endpoint, candidate.provider),
      gatewayUrls: candidate.gatewayUrls,
    });
  };

  pushCandidate(
    options.pinnerEndpoint && options.pinnerToken
      ? {
          endpoint: options.pinnerEndpoint,
          token: options.pinnerToken,
          provider: detectProviderName(options.pinnerEndpoint),
        }
      : undefined
  );

  const envEndpoint = process.env.PINNER_ENDPOINT ?? process.env.PINNER_URL;
  const envToken = process.env.PINNER_TOKEN;
  pushCandidate(
    envEndpoint && envToken
      ? {
          endpoint: envEndpoint,
          token: envToken,
          provider: detectProviderName(envEndpoint),
        }
      : undefined
  );

  const web3Token = process.env.WEB3_STORAGE_TOKEN ?? process.env.WEB3STORAGE_TOKEN;
  if (web3Token) {
    const web3Endpoint =
      process.env.WEB3_STORAGE_ENDPOINT ??
      process.env.WEB3STORAGE_ENDPOINT ??
      DEFAULT_WEB3_STORAGE_ENDPOINT;
    pushCandidate({ endpoint: web3Endpoint, token: web3Token, provider: 'web3.storage' });
  }

  const pinataToken =
    process.env.PINATA_JWT ??
    process.env.PINATA_TOKEN ??
    (process.env.PINATA_API_KEY && process.env.PINATA_SECRET_API_KEY
      ? `${process.env.PINATA_API_KEY}:${process.env.PINATA_SECRET_API_KEY}`
      : undefined);
  if (pinataToken) {
    const pinataEndpoint = process.env.PINATA_ENDPOINT ?? DEFAULT_PINATA_ENDPOINT;
    const gateway = process.env.PINATA_GATEWAY ?? process.env.PINATA_PUBLIC_GATEWAY;
    pushCandidate({
      endpoint: pinataEndpoint,
      token: pinataToken,
      provider: 'pinata',
      gatewayUrls: gateway ? [`${gateway.replace(/\/+$/, '')}/ipfs/{cid}`] : undefined,
    });
  }

  return candidates;
}

function ensureBlob(
  content: any,
  explicitType?: string
): { blob: Blob; suggestedFileName: string } {
  if (content instanceof Blob) {
    const fileName = content.type === 'application/json' ? 'payload.json' : 'payload.bin';
    return { blob: content, suggestedFileName: fileName };
  }

  let data: BlobPart;
  let type = explicitType;
  let suggestedFileName = 'payload.bin';

  if (typeof content === 'string') {
    data = content;
    type = type ?? 'text/plain';
    suggestedFileName = 'payload.txt';
  } else if (content instanceof ArrayBuffer || ArrayBuffer.isView(content)) {
    const buffer =
      content instanceof ArrayBuffer
        ? content
        : ((content as ArrayBufferView).buffer.slice(
            (content as ArrayBufferView).byteOffset,
            (content as ArrayBufferView).byteOffset + (content as ArrayBufferView).byteLength
          ) as ArrayBuffer);
    data = new Uint8Array(buffer);
    type = type ?? 'application/octet-stream';
  } else if (content && typeof content === 'object') {
    data = JSON.stringify(content);
    type = type ?? 'application/json';
    suggestedFileName = 'payload.json';
  } else {
    data = String(content ?? '');
    type = type ?? 'text/plain';
    suggestedFileName = 'payload.txt';
  }

  const blob = new Blob([data], { type });
  return { blob, suggestedFileName };
}

function detectProviderName(endpoint?: string, explicit?: string): string {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  if (!endpoint) {
    return 'pinning-service';
  }
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    if (host.includes('web3.storage')) {
      return 'web3.storage';
    }
    if (host.includes('pinata')) {
      return 'pinata';
    }
    if (host.includes('nft.storage')) {
      return 'nft.storage';
    }
  } catch {
    // ignore parsing errors and fall through
  }
  return 'pinning-service';
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\s+$/, '').replace(/\/+$/, '');
}

function ensureUploadUrl(endpoint: string, provider: string): string {
  const trimmed = stripTrailingSlashes(endpoint);
  if (provider === 'pinata') {
    if (/pinning\/pinfiletoipfs$/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/pinning/pinFileToIPFS`;
  }
  if (/\/upload$/i.test(trimmed) || /\/pins$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/upload`;
}

function providerBaseUrl(endpoint: string, provider: string): string {
  const trimmed = stripTrailingSlashes(endpoint);
  if (provider === 'pinata') {
    return trimmed.replace(/\/pinning\/pinfiletoipfs$/i, '');
  }
  return trimmed.replace(/\/(upload|pins)$/i, '');
}

function buildGatewayUrls(
  cid: string,
  provider: string,
  additional?: string | string[]
): string[] {
  const urls = new Set<string>();
  const extras = Array.isArray(additional)
    ? additional
    : additional
    ? [additional]
    : [];
  for (const factory of DEFAULT_GATEWAY_FALLBACKS) {
    urls.add(factory(cid));
  }
  if (provider === 'web3.storage' || provider === 'nft.storage') {
    urls.add(`https://w3s.link/ipfs/${cid}`);
    urls.add(`https://${cid}.ipfs.w3s.link`);
  }
  if (provider === 'pinata') {
    urls.add(`https://gateway.pinata.cloud/ipfs/${cid}`);
    urls.add(`https://ipfs.pinata.cloud/ipfs/${cid}`);
  }
  for (const entry of extras) {
    if (!entry) continue;
    urls.add(entry.replace('{cid}', cid));
  }
  return Array.from(urls);
}

function buildPinResult(
  cid: string,
  provider: string,
  attempts: number,
  status?: string,
  requestId?: string,
  size?: number,
  pinnedAt?: string,
  additionalGateways?: string | string[]
): PinnedContent {
  const gatewayUrls = buildGatewayUrls(cid, provider, additionalGateways);
  const url = gatewayUrls[0] ?? `https://ipfs.io/ipfs/${cid}`;
  return {
    cid,
    uri: `ipfs://${cid}`,
    url,
    gatewayUrls,
    provider,
    status,
    requestId,
    attempts,
    size,
    pinnedAt,
  };
}

function buildAuthHeaders(
  provider: string,
  token: string
): Record<string, string> {
  const headers: Record<string, string> = {};
  const trimmed = token.trim();
  if (!trimmed) {
    return headers;
  }
  if (provider === 'pinata' && trimmed.includes(':')) {
    const [apiKey, secret] = trimmed.split(':', 2);
    if (apiKey && secret) {
      headers['pinata_api_key'] = apiKey.trim();
      headers['pinata_secret_api_key'] = secret.trim();
      return headers;
    }
  }
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    headers.Authorization = trimmed;
    return headers;
  }
  headers.Authorization = `Bearer ${trimmed}`;
  return headers;
}

function isRetryableStatus(status: number): boolean {
  if (status >= 500 || status === 429 || status === 408) {
    return true;
  }
  return false;
}

async function pinViaIpfsApi(
  content: any,
  options: UploadToIPFSOptions
): Promise<PinnedContent> {
  const apiUrl = options.apiUrl ?? process.env.IPFS_API_URL ?? DEFAULT_IPFS_API;
  const target = `${apiUrl.replace(/\/+$/, '')}/add`;
  const { blob, suggestedFileName } = ensureBlob(content, options.contentType);
  const form = new FormData();
  form.append('file', blob, options.fileName ?? suggestedFileName);
  const response = await fetch(target, { method: 'POST', body: form });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `IPFS API responded with ${response.status}: ${text.slice(0, 200)}`
    );
  }
  const body = await response.text();
  const cid = parseIpfsAddResponse(body);
  if (!cid) {
    throw new Error('IPFS API response did not include a CID');
  }
  return buildPinResult(cid, 'ipfs-api', 1, 'pinned');
}

async function pinViaPinner(
  content: any,
  options: UploadToIPFSOptions,
  candidate: PinningCandidateConfig
): Promise<PinnedContent> {
  const endpoint =
    candidate.endpoint ||
    options.pinnerEndpoint ||
    process.env.PINNER_ENDPOINT ||
    process.env.PINNER_URL ||
    DEFAULT_PINNER_ENDPOINT;
  const token = candidate.token;
  const provider = detectProviderName(endpoint, candidate.provider);
  const uploadUrl = ensureUploadUrl(endpoint, provider);
  const baseUrl = providerBaseUrl(endpoint, provider);
  const { blob, suggestedFileName } = ensureBlob(content, options.contentType);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const fileName = options.fileName ?? suggestedFileName;
  const contentType = blob.type || options.contentType || 'application/octet-stream';
  const authHeaders = buildAuthHeaders(provider, token);
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      let response: Response;
      if (provider === 'pinata') {
        const form = new FormData();
        const fileBlob = new Blob([buffer], { type: contentType });
        form.append('file', fileBlob, fileName || suggestedFileName || 'payload.bin');
        const metadata = {
          name: fileName || suggestedFileName || 'payload',
          keyvalues: {
            source: 'agi-jobs-orchestrator',
          },
        };
        form.append('pinataMetadata', JSON.stringify(metadata));
        const headers: Record<string, string> = { ...authHeaders };
        response = await fetch(uploadUrl, {
          method: 'POST',
          headers,
          body: form,
        });
      } else {
        const headers: Record<string, string> = {
          ...authHeaders,
          'Content-Type': contentType,
        };
        if (fileName) {
          headers['X-Name'] = fileName;
        }
        response = await fetch(uploadUrl, {
          method: 'POST',
          headers,
          body: buffer,
        });
      }

      const responseText = await response.text();
      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        throw new PinningServiceError(
          `Pinning service responded with ${response.status}: ${responseText.slice(0, 200)}`,
          provider,
          response.status,
          retryable
        );
      }

      const contentTypeHeader = response.headers.get('content-type') ?? '';
      let payload: unknown = responseText;
      if (contentTypeHeader.includes('application/json')) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          // fall back to plain text parsing
        }
      }

      const cid = extractCidFromPinningResponse(payload);
      if (!cid) {
        throw new PinningServiceError(
          'Pinning service response did not include a CID',
          provider,
          undefined,
          false
        );
      }

      let status: string | undefined;
      let requestId: string | undefined;
      let size: number | undefined;
      let pinnedAt: string | undefined;

      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const pinRecord = record.pin as Record<string, unknown> | undefined;
        requestId =
          (typeof record.requestid === 'string' && record.requestid) ||
          (typeof record.requestId === 'string' && record.requestId) ||
          undefined;
        status =
          (typeof record.status === 'string' && record.status) ||
          (pinRecord && typeof pinRecord.status === 'string' ? pinRecord.status : undefined) ||
          undefined;
        if (pinRecord) {
          if (typeof pinRecord.size === 'number') {
            size = pinRecord.size;
          }
          if (typeof pinRecord.created === 'string') {
            pinnedAt = pinRecord.created;
          }
        }
        if (!size && typeof record.PinSize === 'number') {
          size = record.PinSize;
        }
        if (!pinnedAt && typeof record.Timestamp === 'string') {
          pinnedAt = record.Timestamp;
        }
      }

      try {
        await delay(200);
        const statusDetails = await fetchPinStatus(provider, baseUrl, token, cid);
        status = statusDetails.status ?? status;
        size = statusDetails.size ?? size;
        pinnedAt = statusDetails.pinnedAt ?? pinnedAt;
      } catch {
        // status checks are best-effort
      }

      return buildPinResult(
        cid,
        provider,
        attempt,
        status ?? 'pinned',
        requestId,
        size,
        pinnedAt,
        candidate.gatewayUrls
      );
    } catch (error) {
      const pinError =
        error instanceof PinningServiceError
          ? error
          : new PinningServiceError(
              error instanceof Error ? error.message : String(error),
              provider,
              undefined,
              true,
              error
            );
      if (!pinError.retryable || attempt === maxAttempts) {
        throw pinError;
      }
      await delay(Math.min(1000 * attempt, 3000));
    }
  }

  throw new PinningServiceError(
    'Pinning service failed after multiple retries',
    provider,
    undefined,
    true
  );
}

interface PinStatusDetails {
  status?: string;
  size?: number;
  pinnedAt?: string;
}

async function fetchPinStatus(
  provider: string,
  baseUrl: string,
  token: string,
  cid: string
): Promise<PinStatusDetails> {
  const headers = buildAuthHeaders(provider, token);
  if (Object.keys(headers).length === 0) {
    return {};
  }
  const trimmedBase = stripTrailingSlashes(baseUrl || '');
  let statusUrl: string;
  if (provider === 'pinata') {
    statusUrl = `${trimmedBase}/data/pinList?cid=${encodeURIComponent(cid)}`;
  } else {
    statusUrl = `${trimmedBase}/pins/${cid}`;
  }
  try {
    const response = await fetch(statusUrl, { headers });
    if (!response.ok) {
      if (isRetryableStatus(response.status)) {
        throw new PinningServiceError(
          `Status check failed: ${response.status}`,
          provider,
          response.status,
          true
        );
      }
      return {};
    }
    const text = await response.text();
    if (!text.trim()) {
      return {};
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return {};
    }
    if (!payload || typeof payload !== 'object') {
      return {};
    }
    if (provider === 'pinata') {
      const result = payload as { rows?: any[] };
      const firstRow = Array.isArray(result.rows) ? result.rows[0] : undefined;
      if (!firstRow || typeof firstRow !== 'object') {
        return {};
      }
      const status = typeof firstRow.status === 'string' ? firstRow.status : undefined;
      const size =
        typeof firstRow.size === 'number'
          ? firstRow.size
          : typeof firstRow.pinSize === 'number'
          ? firstRow.pinSize
          : undefined;
      const pinnedAt =
        typeof firstRow.date_pinned === 'string'
          ? firstRow.date_pinned
          : typeof firstRow.timestamp === 'string'
          ? firstRow.timestamp
          : undefined;
      return { status, size, pinnedAt };
    }
    const record = payload as Record<string, unknown>;
    const pinRecord = record.pin as Record<string, unknown> | undefined;
    const status =
      (typeof record.status === 'string' && record.status) ||
      (pinRecord && typeof pinRecord.status === 'string' ? pinRecord.status : undefined);
    const size =
      (pinRecord && typeof pinRecord.size === 'number' ? pinRecord.size : undefined) ??
      (typeof record.pinSize === 'number' ? (record.pinSize as number) : undefined);
    const pinnedAt =
      (pinRecord && typeof pinRecord.created === 'string' ? pinRecord.created : undefined) ||
      (typeof record.created === 'string' ? (record.created as string) : undefined);
    return { status, size, pinnedAt };
  } catch (error) {
    if (error instanceof PinningServiceError) {
      throw error;
    }
    throw new PinningServiceError(
      error instanceof Error ? error.message : String(error),
      provider,
      undefined,
      true,
      error
    );
  }
}

export async function uploadToIPFS(
  content: any,
  options?: string | UploadToIPFSOptions
): Promise<PinnedContent> {
  const resolved = normalizeUploadOptions(options);
  const candidates = buildPinnerCandidates(resolved);
  const retryableErrors: PinningServiceError[] = [];

  for (const candidate of candidates) {
    try {
      return await pinViaPinner(content, resolved, candidate);
    } catch (error) {
      if (error instanceof PinningServiceError) {
        if (!error.retryable) {
          throw error;
        }
        retryableErrors.push(error);
        continue;
      }
      throw error;
    }
  }

  try {
    return await pinViaIpfsApi(content, resolved);
  } catch (error) {
    if (retryableErrors.length) {
      const last = retryableErrors[retryableErrors.length - 1];
      const message =
        `All configured pinning services were unavailable. ` +
        `Try re-uploading shortly or provide a reachable IPFS API. ` +
        `Last error (${last.provider}): ${last.message}`;
      throw new Error(message);
    }
    throw error;
  }
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
      const outputPin = await uploadToIPFS(output);
      const cid = outputPin.cid;
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
      const signaturePin = await uploadToIPFS(signatureRecord);
      const signatureCid = signaturePin.cid;
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
        outputUrl: outputPin.url,
        signatureCid,
        signatureUrl: signaturePin.url,
        signature: signature.signature,
        signer: signature.signer,
        digest: signature.digest,
        metrics: metricsSummary ?? undefined,
      });
      stageObservations.push(observation);
      jobState.stages[i] = {
        name: stage.name,
        cid,
        url: outputPin.url,
        signatureCid,
        signatureUrl: signaturePin.url,
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
          outputUrl: outputPin.url,
          signatureCid,
          signatureUrl: signaturePin.url,
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
    outputUrl: obs.outputUrl,
    signatureCid: obs.signatureCid,
    signatureUrl: obs.signatureUrl,
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
  const manifestPin = await uploadToIPFS(manifest);
  const manifestCid = manifestPin.cid;
  auditLog('job.complete', {
    jobId,
    details: { outputCids: cids, manifestCid, manifestUrl: manifestPin.url },
  });
  return {
    stageCids: cids,
    finalCid: cids.length ? cids[cids.length - 1] : null,
    manifestCid,
    manifestUrl: manifestPin.url,
    manifestGatewayUrls: manifestPin.gatewayUrls,
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
