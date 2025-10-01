import path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Wallet } from 'ethers';
import {
  walletManager,
  checkEnsSubdomain,
  jobs,
  registry,
  GRPC_PORT,
} from './utils';
import {
  listDeliverables,
  listHeartbeats,
  listTelemetryReports,
  recordHeartbeat,
  recordTelemetryReport,
  type AgentDeliverableRecord,
  type AgentHeartbeatRecord,
  type AgentTelemetryRecord,
  type StoredPayloadReference,
  type DeliverableContributor,
  listContributorSummaries,
  type JobContributorSummary,
  type ContributorContribution,
} from './deliverableStore';
import {
  parseTokenAmount,
  formatTokenAmount,
  parseRoleInput,
  parseContributors,
  normaliseMetadata,
  resolveAgentAddress,
} from './apiHelpers';
import { submitDeliverable } from './agentActions';
import {
  ensureStake,
  getStakeBalance,
  getMinStake,
  autoClaimRewards,
} from './stakeCoordinator';
import { getRewardPayouts } from './events';
import { publishEnergySample } from './telemetry';
import { serialiseChainJob } from './jobSerialization';

interface ProtoTelemetryPayload {
  payload_json?: string;
  cid?: string;
  uri?: string;
}

interface ProtoTelemetrySample {
  payload_json?: string;
}

interface ProtoContributor {
  address?: string;
  ens?: string;
  role?: string;
  label?: string;
  signature?: string;
  payload_digest?: string;
  metadata_json?: string;
}

interface SubmitResultRequestMessage {
  job_id?: string;
  wallet_address?: string;
  agent_address?: string;
  result_uri?: string;
  result_cid?: string;
  result_ref?: string;
  result_hash?: string;
  proof_bytes?: string;
  proof_json?: string;
  success?: boolean | null;
  finalize?: boolean | null;
  finalize_only?: boolean | null;
  metadata_json?: string;
  telemetry?: ProtoTelemetryPayload | null;
  contributors?: ProtoContributor[];
  digest?: string;
  signature?: string;
  signed_payload?: string;
  telemetry_cid?: string;
  telemetry_uri?: string;
}

interface RecordHeartbeatRequestMessage {
  job_id?: string;
  wallet_address?: string;
  agent_address?: string;
  status?: string;
  note?: string;
  telemetry?: ProtoTelemetryPayload | null;
  metadata_json?: string;
  telemetry_cid?: string;
  telemetry_uri?: string;
}

interface RecordTelemetryRequestMessage {
  job_id?: string;
  wallet_address?: string;
  agent_address?: string;
  telemetry?: ProtoTelemetryPayload | null;
  signature?: string;
  proof_json?: string;
  metadata_json?: string;
  span_id?: string;
  status?: string;
  samples?: ProtoTelemetrySample[];
  telemetry_cid?: string;
  telemetry_uri?: string;
}

interface GetJobInfoRequestMessage {
  job_id?: string;
  deliverable_limit?: number;
  heartbeat_limit?: number;
  telemetry_limit?: number;
}

interface EnsureStakeRequestMessage {
  wallet_address?: string;
  agent_address?: string;
  required_stake?: string;
  amount?: string;
  role?: string;
}

interface GetStakeRequestMessage {
  agent_address?: string;
  role?: string;
}

interface AutoClaimRewardsRequestMessage {
  wallet_address?: string;
  agent_address?: string;
  amount?: string;
  restake_amount?: string;
  restake_percent_text?: string;
  restake_percent?: number;
  destination?: string;
  role?: string;
  withdraw_stake?: boolean | null;
  acknowledge?: boolean | null;
}

interface StoredPayloadReferenceMessage {
  cid?: string;
  uri?: string;
  path?: string;
  digest?: string;
  bytes?: number;
  stored_at?: string;
  inline_json?: string;
}

interface DeliverableContributorMessage {
  address?: string;
  ens?: string;
  role?: string;
  label?: string;
  signature?: string;
  payload_digest?: string;
  metadata_json?: string;
}

interface ContributorContributionMessage {
  deliverable_id?: string;
  job_id?: string;
  submitted_at?: string;
  primary?: boolean;
  role?: string;
  label?: string;
  signature?: string;
  payload_digest?: string;
  metadata_json?: string;
}

interface ContributorSummaryMessage {
  address?: string;
  ens_names?: string[];
  roles?: string[];
  labels?: string[];
  signatures?: string[];
  payload_digests?: string[];
  contribution_count?: number;
  first_contribution_at?: string;
  last_contribution_at?: string;
  contributions?: ContributorContributionMessage[];
}

interface DeliverableRecordMessage {
  id?: string;
  job_id?: string;
  agent?: string;
  submitted_at?: string;
  success?: boolean;
  result_uri?: string;
  result_cid?: string;
  result_ref?: string;
  result_hash?: string;
  digest?: string;
  signature?: string;
  telemetry?: StoredPayloadReferenceMessage;
  contributors?: DeliverableContributorMessage[];
  submission_method?: string;
  tx_hash?: string;
  metadata_json?: string;
  proof_json?: string;
  telemetry_cid?: string;
  telemetry_uri?: string;
}

interface HeartbeatRecordMessage {
  id?: string;
  job_id?: string;
  agent?: string;
  status?: string;
  recorded_at?: string;
  note?: string;
  telemetry?: StoredPayloadReferenceMessage;
  metadata_json?: string;
}

interface TelemetryRecordMessage {
  id?: string;
  job_id?: string;
  agent?: string;
  recorded_at?: string;
  payload?: StoredPayloadReferenceMessage;
  signature?: string;
  proof_json?: string;
  metadata_json?: string;
  span_id?: string;
  status?: string;
}

interface RewardPayoutRecordMessage {
  tx_hash?: string;
  amount_raw?: string;
  amount_formatted?: string;
  recipient?: string;
  timestamp?: string;
}

interface ClaimActionMessage {
  type?: string;
  method?: string;
  tx_hash?: string;
  amount_raw?: string;
  amount_formatted?: string;
  destination?: string;
}

interface SubmitResultResponseMessage {
  tx_hash?: string;
  submission_method?: string;
  result_hash?: string;
  deliverable?: DeliverableRecordMessage;
}

interface RecordTelemetryResponseMessage {
  telemetry?: TelemetryRecordMessage;
  energy_samples_published?: number;
}

interface GetJobInfoResponseMessage {
  job_id?: string;
  job_json?: string;
  chain_json?: string;
  deliverables?: DeliverableRecordMessage[];
  heartbeats?: HeartbeatRecordMessage[];
  telemetry?: TelemetryRecordMessage[];
  payouts?: RewardPayoutRecordMessage[];
  contributors?: ContributorSummaryMessage[];
}

interface EnsureStakeResponseMessage {
  agent?: string;
  role?: number;
  stake_balance_raw?: string;
  stake_balance_formatted?: string;
}

interface GetStakeResponseMessage {
  agent?: string;
  role?: number;
  stake_balance_raw?: string;
  stake_balance_formatted?: string;
  min_stake_raw?: string;
  min_stake_formatted?: string;
}

interface AutoClaimRewardsResponseMessage {
  agent?: string;
  starting_balance_raw?: string;
  starting_balance_formatted?: string;
  ending_balance_raw?: string;
  ending_balance_formatted?: string;
  actions?: ClaimActionMessage[];
  restaked_raw?: string;
  restaked_formatted?: string;
}

interface AgentGatewayProtoGrpcType {
  agentgateway: {
    v1: {
      AgentGateway: {
        service: grpc.ServiceDefinition<grpc.UntypedServiceImplementation>;
      };
    };
  };
}

type UnaryCallback<T> = grpc.sendUnaryData<T>;

let serverInstance: grpc.Server | null = null;

function createServiceError(
  code: grpc.status,
  message: string
): grpc.ServiceError {
  return { code, message } as grpc.ServiceError;
}

function respondWithError<T>(
  callback: UnaryCallback<T>,
  err: unknown,
  fallbackCode: grpc.status
): void {
  if (err && typeof (err as { code?: unknown }).code === 'number') {
    callback(err as grpc.ServiceError, null);
    return;
  }
  const message = (err as { message?: string })?.message || String(err);
  callback(createServiceError(fallbackCode, message), null);
}

function parseOptionalJson(
  value: string | undefined,
  field: string
): Record<string, unknown> | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    return normaliseMetadata(parsed);
  } catch (err) {
    throw new Error(`${field} is not valid JSON: ${String(err)}`);
  }
}

function parseTelemetryPayload(
  payload?: ProtoTelemetryPayload | null
): { data?: unknown; cid?: string; uri?: string } {
  if (!payload) {
    return {};
  }
  let data: unknown;
  if (payload.payload_json && payload.payload_json.trim().length > 0) {
    try {
      data = JSON.parse(payload.payload_json);
    } catch (err) {
      throw new Error(
        `telemetry.payload_json is not valid JSON: ${String(err)}`
      );
    }
  }
  return { data, cid: payload.cid, uri: payload.uri };
}

function parseTelemetrySamples(samples?: ProtoTelemetrySample[]): unknown[] {
  if (!samples || samples.length === 0) {
    return [];
  }
  const parsed: unknown[] = [];
  for (const entry of samples) {
    if (!entry || !entry.payload_json) {
      continue;
    }
    try {
      parsed.push(JSON.parse(entry.payload_json));
    } catch (err) {
      throw new Error(
        `telemetry sample is not valid JSON: ${String(err)}`
      );
    }
  }
  return parsed;
}

function parseSignedPayload(value?: string): unknown {
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function toStoredPayloadMessage(
  reference?: StoredPayloadReference | null
): StoredPayloadReferenceMessage | undefined {
  if (!reference) {
    return undefined;
  }
  const message: StoredPayloadReferenceMessage = {};
  if (reference.cid) {
    message.cid = reference.cid;
  }
  if (reference.uri) {
    message.uri = reference.uri;
  }
  if (reference.path) {
    message.path = reference.path;
  }
  if (reference.digest) {
    message.digest = reference.digest;
  }
  if (typeof reference.bytes === 'number') {
    message.bytes = reference.bytes;
  }
  if (reference.storedAt) {
    message.stored_at = reference.storedAt;
  }
  const inline = (reference as { inline?: unknown }).inline;
  if (inline !== undefined) {
    try {
      message.inline_json = JSON.stringify(inline);
    } catch {
      message.inline_json = String(inline);
    }
  }
  return message;
}

function mapDeliverable(
  record: AgentDeliverableRecord
): DeliverableRecordMessage {
  const message: DeliverableRecordMessage = {
    id: record.id,
    job_id: record.jobId,
    agent: record.agent,
    submitted_at: record.submittedAt,
    success: record.success,
  };
  if (record.resultUri) {
    message.result_uri = record.resultUri;
  }
  if (record.resultCid) {
    message.result_cid = record.resultCid;
  }
  if (record.resultRef) {
    message.result_ref = record.resultRef;
  }
  if (record.resultHash) {
    message.result_hash = record.resultHash;
  }
  if (record.digest) {
    message.digest = record.digest;
  }
  if (record.signature) {
    message.signature = record.signature;
  }
  if (record.telemetry) {
    message.telemetry = toStoredPayloadMessage(record.telemetry);
    if (record.telemetry.cid) {
      message.telemetry_cid = record.telemetry.cid;
    }
    if (record.telemetry.uri) {
      message.telemetry_uri = record.telemetry.uri;
    }
  }
  if (record.contributors) {
    message.contributors = record.contributors.map((entry) => ({
      address: entry.address,
      ens: entry.ens,
      role: entry.role,
      label: entry.label,
      signature: entry.signature,
      payload_digest: entry.payloadDigest,
      metadata_json: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
    }));
  }
  if (record.submissionMethod) {
    message.submission_method = record.submissionMethod;
  }
  if (record.txHash) {
    message.tx_hash = record.txHash;
  }
  if (record.metadata) {
    message.metadata_json = JSON.stringify(record.metadata);
  }
  if (record.proof) {
    message.proof_json = JSON.stringify(record.proof);
  }
  return message;
}

function mapHeartbeat(record: AgentHeartbeatRecord): HeartbeatRecordMessage {
  const message: HeartbeatRecordMessage = {
    id: record.id,
    job_id: record.jobId,
    agent: record.agent,
    status: record.status,
    recorded_at: record.recordedAt,
  };
  if (record.note) {
    message.note = record.note;
  }
  if (record.telemetry) {
    message.telemetry = toStoredPayloadMessage(record.telemetry);
  }
  if (record.metadata) {
    message.metadata_json = JSON.stringify(record.metadata);
  }
  return message;
}

function mapTelemetry(record: AgentTelemetryRecord): TelemetryRecordMessage {
  const message: TelemetryRecordMessage = {
    id: record.id,
    job_id: record.jobId,
    agent: record.agent,
    recorded_at: record.recordedAt,
  };
  if (record.payload) {
    message.payload = toStoredPayloadMessage(record.payload);
  }
  if (record.signature) {
    message.signature = record.signature;
  }
  if (record.proof) {
    message.proof_json = JSON.stringify(record.proof);
  }
  if (record.metadata) {
    message.metadata_json = JSON.stringify(record.metadata);
  }
  if (record.spanId) {
    message.span_id = record.spanId;
  }
  if (record.status) {
    message.status = record.status;
  }
  return message;
}

function mapContributorContribution(
  contribution: ContributorContribution
): ContributorContributionMessage {
  const message: ContributorContributionMessage = {
    deliverable_id: contribution.deliverableId,
    job_id: contribution.jobId,
    submitted_at: contribution.submittedAt,
    primary: contribution.primary,
  };
  if (contribution.role) {
    message.role = contribution.role;
  }
  if (contribution.label) {
    message.label = contribution.label;
  }
  if (contribution.signature) {
    message.signature = contribution.signature;
  }
  if (contribution.payloadDigest) {
    message.payload_digest = contribution.payloadDigest;
  }
  if (contribution.metadata) {
    try {
      message.metadata_json = JSON.stringify(contribution.metadata);
    } catch {
      message.metadata_json = String(contribution.metadata);
    }
  }
  return message;
}

function mapContributorSummary(
  summary: JobContributorSummary
): ContributorSummaryMessage {
  const message: ContributorSummaryMessage = {
    address: summary.address,
    contribution_count: summary.contributionCount,
  };
  if (summary.ensNames.length > 0) {
    message.ens_names = summary.ensNames;
  }
  if (summary.roles.length > 0) {
    message.roles = summary.roles;
  }
  if (summary.labels.length > 0) {
    message.labels = summary.labels;
  }
  if (summary.signatures.length > 0) {
    message.signatures = summary.signatures;
  }
  if (summary.payloadDigests.length > 0) {
    message.payload_digests = summary.payloadDigests;
  }
  if (summary.firstContributionAt) {
    message.first_contribution_at = summary.firstContributionAt;
  }
  if (summary.lastContributionAt) {
    message.last_contribution_at = summary.lastContributionAt;
  }
  message.contributions = summary.contributions.map(
    mapContributorContribution
  );
  return message;
}

function mapPayouts(payouts: any[]): RewardPayoutRecordMessage[] {
  return payouts.map((entry) => ({
    tx_hash: (entry as { txHash?: string }).txHash,
    amount_raw: (entry as { raw?: string }).raw ?? (entry as { amountRaw?: string }).amountRaw,
    amount_formatted:
      (entry as { formatted?: string }).formatted ??
      (entry as { amountFormatted?: string }).amountFormatted,
    recipient: (entry as { recipient?: string }).recipient,
    timestamp: (entry as { timestamp?: string }).timestamp,
  }));
}

function mapClaimActions(actions: any[]): ClaimActionMessage[] {
  return actions.map((action) => ({
    type: (action as { type?: string }).type,
    method: (action as { method?: string }).method,
    tx_hash: (action as { txHash?: string }).txHash,
    amount_raw:
      (action as { amountRaw?: string }).amountRaw ??
      (action as { amount?: string }).amount,
    amount_formatted:
      (action as { amountFormatted?: string }).amountFormatted ??
      (action as { formatted?: string }).formatted,
    destination: (action as { destination?: string }).destination,
  }));
}

async function resolveWallet(
  walletAddress?: string,
  agentAddress?: string
): Promise<Wallet> {
  if (!walletManager) {
    throw createServiceError(
      grpc.status.UNAVAILABLE,
      'wallet manager is not initialised'
    );
  }
  const candidate = walletAddress || agentAddress;
  if (!candidate || candidate.trim().length === 0) {
    throw new Error('wallet_address or agent_address is required');
  }
  const resolved = await resolveAgentAddress(candidate);
  if (!resolved) {
    throw new Error('agent address could not be resolved');
  }
  const wallet = walletManager.get(resolved);
  if (!wallet) {
    throw new Error('wallet is not managed by the gateway');
  }
  return wallet;
}

function handleContributorParsing(
  contributors?: ProtoContributor[]
): DeliverableContributor[] | undefined {
  if (!contributors || contributors.length === 0) {
    return undefined;
  }
  const raw = contributors.map((entry) => {
    let metadata: Record<string, unknown> | undefined;
    if (entry.metadata_json && entry.metadata_json.trim().length > 0) {
      try {
        metadata = JSON.parse(entry.metadata_json);
      } catch (err) {
        throw new Error(
          `contributor metadata_json is not valid JSON: ${String(err)}`
        );
      }
    }
    return {
      address: entry.address,
      ens: entry.ens,
      role: entry.role,
      label: entry.label,
      signature: entry.signature,
      payloadDigest: entry.payload_digest,
      metadata,
    };
  });
  return parseContributors(raw);
}

async function handleSubmitResult(
  call: grpc.ServerUnaryCall<SubmitResultRequestMessage, SubmitResultResponseMessage>,
  callback: UnaryCallback<SubmitResultResponseMessage>
): Promise<void> {
  const request = call.request;
  const jobId = request.job_id?.trim();
  if (!jobId) {
    callback(createServiceError(grpc.status.INVALID_ARGUMENT, 'job_id is required'), null);
    return;
  }
  let wallet: Wallet;
  try {
    wallet = await resolveWallet(request.wallet_address, request.agent_address);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  try {
    await checkEnsSubdomain(wallet.address);
  } catch (err) {
    respondWithError(callback, err, grpc.status.PERMISSION_DENIED);
    return;
  }

  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = parseOptionalJson(request.metadata_json, 'metadata_json');
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }

  let proof: Record<string, unknown> | undefined;
  try {
    proof = parseOptionalJson(request.proof_json, 'proof_json');
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }

  let telemetryPayload;
  try {
    telemetryPayload = parseTelemetryPayload(request.telemetry);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }

  let contributors: DeliverableContributor[] | undefined;
  try {
    contributors = handleContributorParsing(request.contributors);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }

  const success = request.success === undefined || request.success === null
    ? true
    : Boolean(request.success);
  const finalizePreference =
    request.finalize === undefined || request.finalize === null
      ? undefined
      : Boolean(request.finalize);
  const finalizeOnly = Boolean(request.finalize_only);
  const signedPayload = parseSignedPayload(request.signed_payload);

  try {
    const submission = await submitDeliverable({
      jobId,
      wallet,
      resultUri: request.result_uri,
      resultCid: request.result_cid,
      resultRef: request.result_ref,
      resultHash: request.result_hash,
      proofBytes: request.proof_bytes,
      proof,
      success,
      finalize: finalizePreference,
      finalizeOnly,
      preferFinalize: finalizePreference,
      metadata,
      telemetry: telemetryPayload.data,
      telemetryCid: request.telemetry_cid ?? telemetryPayload.cid,
      telemetryUri: request.telemetry_uri ?? telemetryPayload.uri,
      contributors,
      digest: request.digest,
      signature: request.signature,
      signedPayload,
    });

    const response: SubmitResultResponseMessage = {
      tx_hash: submission.txHash,
      submission_method: submission.submissionMethod,
      result_hash: submission.resultHash,
      deliverable: mapDeliverable(submission.deliverable),
    };
    callback(null, response);
  } catch (err: any) {
    const message = err?.message || String(err);
    const code = message && message.toLowerCase().includes('signature')
      ? grpc.status.INVALID_ARGUMENT
      : grpc.status.INTERNAL;
    callback(createServiceError(code, message), null);
  }
}

async function handleRecordHeartbeat(
  call: grpc.ServerUnaryCall<RecordHeartbeatRequestMessage, HeartbeatRecordMessage>,
  callback: UnaryCallback<HeartbeatRecordMessage>
): Promise<void> {
  const request = call.request;
  const jobId = request.job_id?.trim();
  if (!jobId) {
    callback(createServiceError(grpc.status.INVALID_ARGUMENT, 'job_id is required'), null);
    return;
  }
  let wallet: Wallet;
  try {
    wallet = await resolveWallet(request.wallet_address, request.agent_address);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  const status = request.status?.trim();
  if (!status) {
    callback(createServiceError(grpc.status.INVALID_ARGUMENT, 'status is required'), null);
    return;
  }
  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = parseOptionalJson(request.metadata_json, 'metadata_json');
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  let telemetryPayload;
  try {
    telemetryPayload = parseTelemetryPayload(request.telemetry);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  const record = recordHeartbeat({
    jobId,
    agent: wallet.address,
    status,
    note: request.note || undefined,
    telemetry: telemetryPayload.data,
    telemetryCid: request.telemetry_cid ?? telemetryPayload.cid,
    telemetryUri: request.telemetry_uri ?? telemetryPayload.uri,
    metadata,
  });
  callback(null, mapHeartbeat(record));
}

async function handleRecordTelemetry(
  call: grpc.ServerUnaryCall<RecordTelemetryRequestMessage, RecordTelemetryResponseMessage>,
  callback: UnaryCallback<RecordTelemetryResponseMessage>
): Promise<void> {
  const request = call.request;
  const jobId = request.job_id?.trim();
  if (!jobId) {
    callback(createServiceError(grpc.status.INVALID_ARGUMENT, 'job_id is required'), null);
    return;
  }
  let wallet: Wallet;
  try {
    wallet = await resolveWallet(request.wallet_address, request.agent_address);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = parseOptionalJson(request.metadata_json, 'metadata_json');
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  let proof: Record<string, unknown> | undefined;
  try {
    proof = parseOptionalJson(request.proof_json, 'proof_json');
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  let telemetryPayload;
  try {
    telemetryPayload = parseTelemetryPayload(request.telemetry);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  let energySamples: unknown[];
  try {
    energySamples = parseTelemetrySamples(request.samples);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }

  const telemetryRecord = recordTelemetryReport({
    jobId,
    agent: wallet.address,
    payload: telemetryPayload.data,
    cid: request.telemetry_cid ?? telemetryPayload.cid,
    uri: request.telemetry_uri ?? telemetryPayload.uri,
    signature: request.signature,
    proof,
    metadata,
    spanId: request.span_id ?? undefined,
    status: request.status ?? undefined,
  });

  let published = 0;
  for (const sample of energySamples) {
    if (sample && typeof sample === 'object') {
      try {
        await publishEnergySample({
          ...(sample as Record<string, unknown>),
          jobId,
          agent: wallet.address,
        } as any);
        published += 1;
      } catch (err) {
        console.warn('Failed to publish telemetry sample', err);
      }
    }
  }

  const response: RecordTelemetryResponseMessage = {
    telemetry: mapTelemetry(telemetryRecord),
    energy_samples_published: published,
  };
  callback(null, response);
}

async function handleGetJobInfo(
  call: grpc.ServerUnaryCall<GetJobInfoRequestMessage, GetJobInfoResponseMessage>,
  callback: UnaryCallback<GetJobInfoResponseMessage>
): Promise<void> {
  const request = call.request;
  const jobId = request.job_id?.trim();
  if (!jobId) {
    callback(createServiceError(grpc.status.INVALID_ARGUMENT, 'job_id is required'), null);
    return;
  }
  const deliverableLimit = request.deliverable_limit && request.deliverable_limit > 0
    ? request.deliverable_limit
    : undefined;
  const heartbeatLimit = request.heartbeat_limit && request.heartbeat_limit > 0
    ? request.heartbeat_limit
    : undefined;
  const telemetryLimit = request.telemetry_limit && request.telemetry_limit > 0
    ? request.telemetry_limit
    : undefined;

  let chainJob: Record<string, unknown> | null = null;
  try {
    const onChain = await registry.jobs(jobId);
    chainJob = serialiseChainJob(onChain);
  } catch (err) {
    console.warn('Failed to load job from registry for gRPC', jobId, err);
  }

  const jobRecord = jobs.get(jobId) || null;
  const response: GetJobInfoResponseMessage = {
    job_id: jobId,
    job_json: jobRecord ? JSON.stringify(jobRecord) : undefined,
    chain_json: chainJob ? JSON.stringify(chainJob) : undefined,
    deliverables: listDeliverables({ jobId, limit: deliverableLimit }).map(mapDeliverable),
    heartbeats: listHeartbeats({ jobId, limit: heartbeatLimit }).map(mapHeartbeat),
    telemetry: listTelemetryReports({ jobId, limit: telemetryLimit }).map(mapTelemetry),
    payouts: mapPayouts(getRewardPayouts(jobId)),
  };
  const contributors = listContributorSummaries({ jobId });
  if (contributors.length > 0) {
    response.contributors = contributors.map(mapContributorSummary);
  }
  callback(null, response);
}

async function handleEnsureStake(
  call: grpc.ServerUnaryCall<EnsureStakeRequestMessage, EnsureStakeResponseMessage>,
  callback: UnaryCallback<EnsureStakeResponseMessage>
): Promise<void> {
  const request = call.request;
  let wallet: Wallet;
  try {
    wallet = await resolveWallet(request.wallet_address, request.agent_address);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  const role = parseRoleInput(request.role);
  const requiredStake = parseTokenAmount(request.required_stake);
  const amount = parseTokenAmount(request.amount);
  if (requiredStake === undefined && amount === undefined) {
    callback(
      createServiceError(
        grpc.status.INVALID_ARGUMENT,
        'required_stake or amount must be provided'
      ),
      null
    );
    return;
  }
  try {
    if (requiredStake !== undefined) {
      await ensureStake(wallet, requiredStake, role);
    } else if (amount !== undefined) {
      const current = await getStakeBalance(wallet.address, role);
      await ensureStake(wallet, current + amount, role);
    }
    const balance = await getStakeBalance(wallet.address, role);
    const response: EnsureStakeResponseMessage = {
      agent: wallet.address,
      role,
      stake_balance_raw: balance.toString(),
      stake_balance_formatted: formatTokenAmount(balance),
    };
    callback(null, response);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INTERNAL);
  }
}

async function handleGetStake(
  call: grpc.ServerUnaryCall<GetStakeRequestMessage, GetStakeResponseMessage>,
  callback: UnaryCallback<GetStakeResponseMessage>
): Promise<void> {
  const request = call.request;
  const resolved = request.agent_address
    ? await resolveAgentAddress(request.agent_address)
    : null;
  if (!resolved) {
    callback(createServiceError(grpc.status.INVALID_ARGUMENT, 'invalid agent address'), null);
    return;
  }
  const role = parseRoleInput(request.role);
  try {
    const [balance, minStake] = await Promise.all([
      getStakeBalance(resolved, role),
      getMinStake(),
    ]);
    const response: GetStakeResponseMessage = {
      agent: resolved,
      role,
      stake_balance_raw: balance.toString(),
      stake_balance_formatted: formatTokenAmount(balance),
      min_stake_raw: minStake.toString(),
      min_stake_formatted: formatTokenAmount(minStake),
    };
    callback(null, response);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INTERNAL);
  }
}

async function handleAutoClaimRewards(
  call: grpc.ServerUnaryCall<AutoClaimRewardsRequestMessage, AutoClaimRewardsResponseMessage>,
  callback: UnaryCallback<AutoClaimRewardsResponseMessage>
): Promise<void> {
  const request = call.request;
  let wallet: Wallet;
  try {
    wallet = await resolveWallet(request.wallet_address, request.agent_address);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INVALID_ARGUMENT);
    return;
  }
  const role = parseRoleInput(request.role);
  const amount = parseTokenAmount(request.amount);
  const restakeAmount = parseTokenAmount(request.restake_amount);
  const restakePercent = request.restake_percent_text && request.restake_percent_text.trim().length > 0
    ? request.restake_percent_text
    : typeof request.restake_percent === 'number'
    ? request.restake_percent
    : undefined;
  const withdrawStake = request.withdraw_stake === true;
  const acknowledge = request.acknowledge === undefined || request.acknowledge === null
    ? true
    : Boolean(request.acknowledge);
  try {
    const result = await autoClaimRewards(wallet, {
      amount,
      restakeAmount,
      restakePercent,
      destination: request.destination,
      role,
      withdrawStake,
      acknowledge,
    });
    const response: AutoClaimRewardsResponseMessage = {
      agent: result.agent,
      starting_balance_raw: result.startingBalanceRaw,
      starting_balance_formatted: result.startingBalanceFormatted,
      ending_balance_raw: result.endingBalanceRaw,
      ending_balance_formatted: result.endingBalanceFormatted,
      actions: mapClaimActions(result.actions),
      restaked_raw: result.restakedRaw,
      restaked_formatted: result.restakedFormatted,
    };
    callback(null, response);
  } catch (err) {
    respondWithError(callback, err, grpc.status.INTERNAL);
  }
}

const handlers: grpc.UntypedServiceImplementation = {
  SubmitResult(
    call: grpc.ServerUnaryCall<
      SubmitResultRequestMessage,
      SubmitResultResponseMessage
    >,
    callback: UnaryCallback<SubmitResultResponseMessage>
  ) {
    handleSubmitResult(call, callback).catch((err) => {
      respondWithError(callback, err, grpc.status.INTERNAL);
    });
  },
  RecordHeartbeat(
    call: grpc.ServerUnaryCall<RecordHeartbeatRequestMessage, HeartbeatRecordMessage>,
    callback: UnaryCallback<HeartbeatRecordMessage>
  ) {
    handleRecordHeartbeat(call, callback).catch((err) => {
      respondWithError(callback, err, grpc.status.INTERNAL);
    });
  },
  RecordTelemetry(
    call: grpc.ServerUnaryCall<
      RecordTelemetryRequestMessage,
      RecordTelemetryResponseMessage
    >,
    callback: UnaryCallback<RecordTelemetryResponseMessage>
  ) {
    handleRecordTelemetry(call, callback).catch((err) => {
      respondWithError(callback, err, grpc.status.INTERNAL);
    });
  },
  GetJobInfo(
    call: grpc.ServerUnaryCall<GetJobInfoRequestMessage, GetJobInfoResponseMessage>,
    callback: UnaryCallback<GetJobInfoResponseMessage>
  ) {
    handleGetJobInfo(call, callback).catch((err) => {
      respondWithError(callback, err, grpc.status.INTERNAL);
    });
  },
  EnsureStake(
    call: grpc.ServerUnaryCall<EnsureStakeRequestMessage, EnsureStakeResponseMessage>,
    callback: UnaryCallback<EnsureStakeResponseMessage>
  ) {
    handleEnsureStake(call, callback).catch((err) => {
      respondWithError(callback, err, grpc.status.INTERNAL);
    });
  },
  GetStake(
    call: grpc.ServerUnaryCall<GetStakeRequestMessage, GetStakeResponseMessage>,
    callback: UnaryCallback<GetStakeResponseMessage>
  ) {
    handleGetStake(call, callback).catch((err) => {
      respondWithError(callback, err, grpc.status.INTERNAL);
    });
  },
  AutoClaimRewards(
    call: grpc.ServerUnaryCall<
      AutoClaimRewardsRequestMessage,
      AutoClaimRewardsResponseMessage
    >,
    callback: UnaryCallback<AutoClaimRewardsResponseMessage>
  ) {
    handleAutoClaimRewards(call, callback).catch((err) => {
      respondWithError(callback, err, grpc.status.INTERNAL);
    });
  },
};

export async function startGrpcServer(): Promise<void> {
  if (GRPC_PORT <= 0) {
    return;
  }
  if (serverInstance) {
    return;
  }
  const protoPath = path.resolve(__dirname, 'protos/agent_gateway.proto');
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const protoDescriptor = grpc.loadPackageDefinition(
    packageDefinition
  ) as unknown as AgentGatewayProtoGrpcType;
  const serviceDefinition = protoDescriptor.agentgateway?.v1?.AgentGateway?.service;
  if (!serviceDefinition) {
    throw new Error('AgentGateway service definition not found in proto');
  }
  const server = new grpc.Server();
  server.addService(serviceDefinition, handlers);
  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      `0.0.0.0:${GRPC_PORT}`,
      grpc.ServerCredentials.createInsecure(),
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
  server.start();
  serverInstance = server;
  console.log(`Agent gateway gRPC listening on port ${GRPC_PORT}`);
}

export async function stopGrpcServer(): Promise<void> {
  if (!serverInstance) {
    return;
  }
  await new Promise<void>((resolve) => {
    serverInstance?.tryShutdown((err) => {
      if (err) {
        console.warn('gRPC server shutdown error', err);
        serverInstance?.forceShutdown();
      }
      serverInstance = null;
      resolve();
    });
  });
}
