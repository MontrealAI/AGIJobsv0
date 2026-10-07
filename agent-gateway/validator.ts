import fs from 'fs';
import path from 'path';
import { ethers, Wallet } from 'ethers';
import {
  registry,
  validation,
  provider,
  walletManager,
  FETCH_TIMEOUT_MS,
  TOKEN_DECIMALS,
  agents,
} from './utils';
import { ensureIdentity, AgentIdentity } from './identity';
import { ROLE_VALIDATOR, ensureStake } from './stakeCoordinator';
import {
  startEnergySpan,
  endEnergySpan,
  EnergySample,
} from '../shared/energyMonitor';
import { publishEnergySample, recordValidationFlowMetrics } from './telemetry';
import { appendTrainingRecord } from '../shared/trainingRecords';
import { secureLogAction } from './security';
import { summarizeContent } from '../shared/worldModel';
import {
  beginCommitRecord,
  loadCommitRecord,
  updateCommitRecord,
  CommitRoundScope,
  StoredCommitRecord,
} from './validationStore';
import {
  inspectStoredValidationRound,
  readActiveValidationRound,
  readValidationRound,
  reconcilePreviousRound,
  assertStoredValidationRound,
} from './validationRound';
import { assertAutomaticValidationAllowed } from './validationContext';
import {
  prepareValidationCommitment,
  assertValidationReveal,
  validationRevealDelay,
} from '../shared/validationProtocol';

interface SubmissionInfo {
  jobId: string;
  worker: string;
  resultHash: string;
  resultURI: string;
  subdomain?: string;
  receivedAt: string;
}

interface ValidationEvaluation {
  approve: boolean;
  reasons: string[];
  hashMatches: boolean;
  resultAvailable: boolean;
  worker: string;
  resultURI: string;
  computedHash?: string;
  preview?: string;
  payloadType?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

type AssignmentStatus =
  | 'selected'
  | 'awaiting-review'
  | 'context-retry'
  | 'reconciliation-required'
  | 'evaluating'
  | 'committed'
  | 'revealed'
  | 'failed'
  | 'completed';

interface ValidationAssignment {
  jobId: string;
  wallet: Wallet;
  identity: AgentIdentity;
  status: AssignmentStatus;
  createdAt: string;
  attempts: number;
  contextAttempts?: number;
  selectionAttempts?: number;
  selectionScope?: CommitRoundScope;
  round?: RoundMetadata;
  commit?: {
    txHash: string;
    salt: string;
    burnTxHash?: string;
    commitHash: string;
    roundScope?: CommitRoundScope;
    approve: boolean;
    committedAt: string;
    evaluation: ValidationEvaluation;
  };
  reveal?: {
    txHash: string;
    revealedAt: string;
  };
  error?: string;
  processing?: boolean;
  revealProcessing?: boolean;
  revealPreflightAttempts?: number;
  scheduledReveal?: NodeJS.Timeout | null;
  scheduledEvaluation?: NodeJS.Timeout | null;
  scheduledSelection?: NodeJS.Timeout | null;
  energySample?: EnergySample;
  notifiedAt?: string;
  notificationDelivered?: boolean;
}

interface RoundMetadata {
  commitDeadline?: number;
  revealDeadline?: number;
  approvals?: string;
  rejections?: string;
  committeeSize?: number;
}

interface ValidatorAssignmentSnapshot {
  jobId: string;
  wallet: string;
  ens?: string;
  status: AssignmentStatus;
  approve?: boolean;
  reasons?: string[];
  resultURI?: string;
  worker?: string;
  commitTx?: string;
  revealTx?: string;
  attempts: number;
  error?: string;
  preview?: string;
  payloadType?: string;
  createdAt: string;
  committedAt?: string;
  revealedAt?: string;
  energy?: EnergySample | undefined;
  round?: RoundMetadata;
  archived?: boolean;
  notifiedAt?: string;
  notificationDelivered?: boolean;
}

const assignments = new Map<string, Map<string, ValidationAssignment>>();
const submissions = new Map<string, SubmissionInfo>();
const assignmentHistory: ValidatorAssignmentSnapshot[] = [];
const fallbackTimers = new Map<string, NodeJS.Timeout>();

function isCurrentAssignment(assignment: ValidationAssignment): boolean {
  return (
    assignments
      .get(assignment.jobId)
      ?.get(assignment.wallet.address.toLowerCase()) === assignment
  );
}

function requireCurrentAssignment(assignment: ValidationAssignment): void {
  if (!isCurrentAssignment(assignment))
    throw new Error('VALIDATION_ASSIGNMENT_SUPERSEDED');
}

function cancelAssignmentTimers(assignment: ValidationAssignment): void {
  if (assignment.scheduledSelection)
    clearTimeout(assignment.scheduledSelection);
  if (assignment.scheduledEvaluation)
    clearTimeout(assignment.scheduledEvaluation);
  if (assignment.scheduledReveal) clearTimeout(assignment.scheduledReveal);
  assignment.scheduledEvaluation = null;
  assignment.scheduledReveal = null;
  assignment.scheduledSelection = null;
}

function scheduleSelectionRetry(assignment: ValidationAssignment): void {
  if (
    !isCurrentAssignment(assignment) ||
    (assignment.selectionAttempts || 0) >= VALIDATOR_CONTEXT_MAX_ATTEMPTS
  )
    return;
  if (assignment.scheduledSelection)
    clearTimeout(assignment.scheduledSelection);
  const timer = setTimeout(() => {
    if (
      !isCurrentAssignment(assignment) ||
      assignment.scheduledSelection !== timer
    )
      return;
    assignment.scheduledSelection = null;
    handleValidatorSelection(assignment.jobId, [
      assignment.wallet.address,
    ]).catch((error) =>
      console.error('validator selection retry error', error)
    );
  }, VALIDATOR_CONTEXT_RETRY_MS);
  assignment.scheduledSelection = timer;
}

function scheduleEvaluationRetry(
  assignment: ValidationAssignment,
  delay: number
): void {
  if (!isCurrentAssignment(assignment)) return;
  if (!assignment.selectionScope) return;
  if (assignment.scheduledEvaluation)
    clearTimeout(assignment.scheduledEvaluation);
  const timer = setTimeout(() => {
    if (
      !isCurrentAssignment(assignment) ||
      assignment.scheduledEvaluation !== timer
    )
      return;
    assignment.scheduledEvaluation = null;
    const submission = submissions.get(assignment.jobId);
    if (!submission) return;
    evaluateAndCommit(submission, assignment).catch((error) =>
      console.error('validator evaluation retry error', error)
    );
  }, delay);
  assignment.scheduledEvaluation = timer;
}

const RESULT_DIR = path.resolve(__dirname, '../storage/results');
const VALIDATOR_MAX_RETRIES = Number(process.env.VALIDATOR_MAX_RETRIES || '3');
const VALIDATOR_RETRY_DELAY_MS = Number(
  process.env.VALIDATOR_RETRY_DELAY_MS || '15000'
);
const VALIDATOR_CONTEXT_MAX_ATTEMPTS = 3;
const VALIDATOR_CONTEXT_RETRY_MS = 5000;
const VALIDATOR_REVEAL_SCHEDULE_MAX_RETRIES = 12;
const VALIDATOR_REVEAL_LEAD_SECONDS = Number(
  process.env.VALIDATOR_REVEAL_LEAD_SECONDS || '30'
);
const VALIDATOR_HISTORY_LIMIT = Number(
  process.env.VALIDATOR_HISTORY_LIMIT || '50'
);
const VALIDATOR_FALLBACK_DELAY_MS = Number(
  process.env.VALIDATOR_FALLBACK_DELAY_MS || '600000'
);

const VALIDATION_ANOMALY_WINDOW_MS = Math.max(
  60_000,
  Number(process.env.VALIDATION_ANOMALY_WINDOW_MS || '900000')
);
const VALIDATION_ANOMALY_RATE_THRESHOLD = Math.max(
  0.01,
  Math.min(1, Number(process.env.VALIDATION_ANOMALY_RATE_THRESHOLD || '0.4'))
);
const VALIDATION_ANOMALY_MIN_SAMPLES = Math.max(
  3,
  Number(process.env.VALIDATION_ANOMALY_MIN_SAMPLES || '5')
);
const VALIDATION_ANOMALY_PAUSE_MS = Math.max(
  60_000,
  Number(process.env.VALIDATION_ANOMALY_PAUSE_MS || '300000')
);
const VALIDATION_RECOVERY_DRILL_INTERVAL_MS = Math.max(
  30_000,
  Number(process.env.VALIDATION_RECOVERY_DRILL_INTERVAL_MS || '120000')
);
const VALIDATION_RECOVERY_SUCCESS_THRESHOLD = Math.max(
  0.05,
  VALIDATION_ANOMALY_RATE_THRESHOLD / 2
);

interface ValidationOutcomeEntry {
  timestamp: number;
  jobId: string;
  validator: string;
  success: boolean;
  reason?: string;
  stage?: string;
}

let validationOutcomes: ValidationOutcomeEntry[] = [];
let validationPausedUntil = 0;
let validationPauseTriggeredAt: number | null = null;
let validationPauseReason: string | null = null;
let validationPauseCount = 0;
let validationRecoveryTimer: NodeJS.Timeout | null = null;

function isValidationFlowPaused(): boolean {
  return Date.now() < validationPausedUntil;
}

function pruneValidationOutcomes(now: number): void {
  const cutoff = now - VALIDATION_ANOMALY_WINDOW_MS;
  validationOutcomes = validationOutcomes.filter(
    (entry) => entry.timestamp >= cutoff
  );
}

function computeValidationStats(now: number = Date.now()): {
  failureRate: number;
  sampleSize: number;
} {
  pruneValidationOutcomes(now);
  const sampleSize = validationOutcomes.length;
  if (sampleSize === 0) {
    return { failureRate: 0, sampleSize: 0 };
  }
  const failures = validationOutcomes.reduce(
    (total, entry) => total + (entry.success ? 0 : 1),
    0
  );
  return { failureRate: failures / sampleSize, sampleSize };
}

function scheduleValidationRecoveryDrill(): void {
  if (!isValidationFlowPaused()) {
    if (validationRecoveryTimer) {
      clearTimeout(validationRecoveryTimer);
      validationRecoveryTimer = null;
    }
    return;
  }
  const remaining = Math.max(0, validationPausedUntil - Date.now());
  const delay = Math.min(
    Math.max(30_000, remaining),
    VALIDATION_RECOVERY_DRILL_INTERVAL_MS
  );
  if (validationRecoveryTimer) {
    clearTimeout(validationRecoveryTimer);
  }
  validationRecoveryTimer = setTimeout(() => {
    validationRecoveryTimer = null;
    performValidationRecoveryDrill().catch((err) =>
      console.warn('validation recovery drill failed', err)
    );
  }, delay);
}

async function resumeValidationFlow(reason: string): Promise<void> {
  if (!isValidationFlowPaused()) {
    return;
  }
  const triggeredAt = validationPauseTriggeredAt;
  validationPausedUntil = Date.now();
  validationPauseTriggeredAt = null;
  validationPauseReason = null;
  await secureLogAction({
    component: 'validator',
    action: 'validation-flow-resumed',
    success: true,
    metadata: {
      reason,
      triggeredAt: triggeredAt
        ? new Date(triggeredAt).toISOString()
        : undefined,
    },
  });
  const stats = computeValidationStats();
  recordValidationFlowMetrics({
    failureRate: stats.failureRate,
    sampleSize: stats.sampleSize,
    paused: false,
    triggeredAt: triggeredAt ? new Date(triggeredAt).toISOString() : null,
    resumeAt: new Date().toISOString(),
    reason: null,
  });
  scheduleValidationRecoveryDrill();
}

async function performValidationRecoveryDrill(): Promise<void> {
  const stats = computeValidationStats();
  await secureLogAction({
    component: 'validator',
    action: 'validation-recovery-drill',
    success: true,
    metadata: {
      paused: isValidationFlowPaused(),
      failureRate: stats.failureRate,
      sampleSize: stats.sampleSize,
      pauseCount: validationPauseCount,
      resumeAt: new Date(validationPausedUntil).toISOString(),
    },
  });
  if (!isValidationFlowPaused()) {
    recordValidationFlowMetrics({
      failureRate: stats.failureRate,
      sampleSize: stats.sampleSize,
      paused: false,
      triggeredAt: null,
      resumeAt: new Date().toISOString(),
      reason: null,
    });
    return;
  }
  if (Date.now() >= validationPausedUntil) {
    await resumeValidationFlow('pause-window-expired');
    return;
  }
  scheduleValidationRecoveryDrill();
}

async function triggerValidationPause(params: {
  jobId: string;
  validator: string;
  reason: string;
}): Promise<void> {
  const now = Date.now();
  validationPauseReason = params.reason;
  validationPauseTriggeredAt = now;
  validationPausedUntil = now + VALIDATION_ANOMALY_PAUSE_MS;
  validationPauseCount += 1;
  await secureLogAction({
    component: 'validator',
    action: 'validation-flow-paused',
    jobId: params.jobId,
    agent: params.validator,
    success: false,
    metadata: {
      reason: params.reason,
      pauseMs: VALIDATION_ANOMALY_PAUSE_MS,
      pauseCount: validationPauseCount,
    },
  });
  scheduleValidatorFallback(params.jobId);
  scheduleValidationRecoveryDrill();
  const stats = computeValidationStats(now);
  recordValidationFlowMetrics({
    failureRate: stats.failureRate,
    sampleSize: stats.sampleSize,
    paused: true,
    triggeredAt: new Date(now).toISOString(),
    resumeAt: new Date(validationPausedUntil).toISOString(),
    reason: params.reason,
  });
}

async function recordValidationOutcome(event: {
  jobId: string;
  validator: string;
  success: boolean;
  reason?: string;
  stage?: string;
}): Promise<void> {
  const now = Date.now();
  validationOutcomes.push({
    timestamp: now,
    jobId: event.jobId,
    validator: event.validator,
    success: event.success,
    reason: event.reason,
    stage: event.stage,
  });
  const stats = computeValidationStats(now);
  const paused = isValidationFlowPaused();
  if (
    !event.success &&
    !paused &&
    stats.sampleSize >= VALIDATION_ANOMALY_MIN_SAMPLES &&
    stats.failureRate >= VALIDATION_ANOMALY_RATE_THRESHOLD
  ) {
    await triggerValidationPause({
      jobId: event.jobId,
      validator: event.validator,
      reason: event.reason || 'failure-rate-threshold',
    });
  } else if (
    paused &&
    stats.sampleSize >= Math.max(1, VALIDATION_ANOMALY_MIN_SAMPLES / 2) &&
    stats.failureRate <= VALIDATION_RECOVERY_SUCCESS_THRESHOLD
  ) {
    await resumeValidationFlow('failure-rate-recovered');
  } else {
    recordValidationFlowMetrics({
      failureRate: stats.failureRate,
      sampleSize: stats.sampleSize,
      paused: isValidationFlowPaused(),
      triggeredAt: validationPauseTriggeredAt
        ? new Date(validationPauseTriggeredAt).toISOString()
        : null,
      resumeAt: isValidationFlowPaused()
        ? new Date(validationPausedUntil).toISOString()
        : null,
      reason: validationPauseReason,
    });
  }
}

recordValidationFlowMetrics({
  failureRate: 0,
  sampleSize: 0,
  paused: false,
  triggeredAt: null,
  resumeAt: null,
  reason: null,
});

function getAssignmentBucket(jobId: string): Map<string, ValidationAssignment> {
  if (!assignments.has(jobId)) {
    assignments.set(jobId, new Map());
  }
  return assignments.get(jobId)!;
}

function storeHistory(snapshot: ValidatorAssignmentSnapshot): void {
  assignmentHistory.push({ ...snapshot, archived: true });
  if (assignmentHistory.length > VALIDATOR_HISTORY_LIMIT) {
    assignmentHistory.splice(
      0,
      assignmentHistory.length - VALIDATOR_HISTORY_LIMIT
    );
  }
}

function clearValidatorFallback(jobId: string): void {
  const timer = fallbackTimers.get(jobId);
  if (timer) {
    clearTimeout(timer);
    fallbackTimers.delete(jobId);
  }
}

function scheduleValidatorFallback(jobId: string): void {
  if (VALIDATOR_FALLBACK_DELAY_MS <= 0) {
    return;
  }
  if (fallbackTimers.has(jobId)) {
    return;
  }
  const timer = setTimeout(() => {
    fallbackTimers.delete(jobId);
    triggerValidatorFallback(jobId).catch((err) =>
      console.error('validator fallback selection failed', err)
    );
  }, VALIDATOR_FALLBACK_DELAY_MS);
  fallbackTimers.set(jobId, timer);
}

async function triggerValidatorFallback(jobId: string): Promise<void> {
  if (!validation || VALIDATOR_FALLBACK_DELAY_MS <= 0) {
    return;
  }
  const bucket = assignments.get(jobId);
  if (bucket && bucket.size > 0) {
    return;
  }
  const addresses = walletManager.list();
  for (const address of addresses) {
    const wallet = walletManager.get(address);
    if (!wallet) continue;
    try {
      await ensureIdentity(wallet, 'validator');
      await ensureStake(wallet, 0n, ROLE_VALIDATOR);
      const writer = validation.connect(wallet) as unknown as {
        selectValidators(
          jobId: string,
          entropy: string
        ): Promise<ethers.TransactionResponse>;
      };
      const entropy = ethers.hexlify(ethers.randomBytes(32));
      const tx = await writer.selectValidators(jobId, entropy);
      await tx.wait();
      await secureLogAction({
        component: 'validator',
        action: 'fallback-select',
        jobId,
        agent: wallet.address,
        metadata: { entropy, txHash: tx.hash },
        success: true,
      });
      // only trigger once per job
      return;
    } catch (err: any) {
      await secureLogAction({
        component: 'validator',
        action: 'fallback-select-failed',
        jobId,
        agent: address,
        metadata: { error: err?.message ?? String(err) },
        success: false,
      });
    }
  }
  // Reschedule if no wallets succeeded
  scheduleValidatorFallback(jobId);
}

function toSnapshot(
  assignment: ValidationAssignment
): ValidatorAssignmentSnapshot {
  const evaluation = assignment.commit?.evaluation;
  return {
    jobId: assignment.jobId,
    wallet: assignment.wallet.address,
    ens: assignment.identity.ensName,
    status: assignment.status,
    approve: evaluation?.approve,
    reasons: evaluation?.reasons,
    resultURI: evaluation?.resultURI,
    worker: evaluation?.worker,
    commitTx: assignment.commit?.txHash,
    revealTx: assignment.reveal?.txHash,
    attempts: assignment.attempts,
    error: assignment.error,
    preview: evaluation?.preview,
    payloadType: evaluation?.payloadType,
    createdAt: assignment.createdAt,
    committedAt: assignment.commit?.committedAt,
    revealedAt: assignment.reveal?.revealedAt,
    energy: assignment.energySample,
    round: assignment.round,
    notifiedAt: assignment.notifiedAt,
    notificationDelivered: assignment.notificationDelivered,
  };
}

async function sendToValidatorAgent(
  walletAddress: string,
  message: Record<string, unknown>
): Promise<boolean> {
  const lower = walletAddress.toLowerCase();
  const payload = JSON.stringify(message);
  const matches = Array.from(agents.entries()).filter(
    ([, info]) => info.wallet.toLowerCase() === lower
  );
  if (matches.length === 0) {
    return false;
  }
  let delivered = false;
  for (const [, info] of matches) {
    try {
      if (info.ws && info.ws.readyState === 1) {
        info.ws.send(payload);
        delivered = true;
        continue;
      }
      if (info.url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(info.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: payload,
            signal: controller.signal,
          });
          if (res.ok) {
            delivered = true;
          } else {
            console.warn(
              'validator HTTP dispatch failed',
              info.url,
              res.status,
              res.statusText
            );
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            console.warn('validator HTTP dispatch timed out', info.url);
          } else {
            console.warn('validator HTTP dispatch error', info.url, err);
          }
        } finally {
          clearTimeout(timer);
        }
      }
    } catch (err) {
      console.warn('validator message dispatch error', err);
    }
  }
  return delivered;
}

async function notifyDomainAgent(
  submission: SubmissionInfo,
  assignment: ValidationAssignment
): Promise<void> {
  if (assignment.notifiedAt) {
    return;
  }
  const message = {
    type: 'ValidationAwaiting',
    jobId: submission.jobId,
    worker: submission.worker,
    resultHash: submission.resultHash,
    resultURI: submission.resultURI,
    subdomain: submission.subdomain,
    receivedAt: submission.receivedAt,
    validator: {
      address: assignment.wallet.address,
      ens: assignment.identity.ensName,
      label: assignment.identity.label,
      categories: assignment.identity.manifestCategories,
    },
  };
  const delivered = await sendToValidatorAgent(
    assignment.wallet.address,
    message
  );
  assignment.notifiedAt = new Date().toISOString();
  assignment.notificationDelivered = delivered;
  if (!delivered) {
    console.warn(
      'No online domain agent registered for validator',
      assignment.wallet.address
    );
  }
  try {
    await secureLogAction({
      component: 'validator',
      action: 'awaiting-validation',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: {
        delivered,
        worker: submission.worker,
        resultURI: submission.resultURI,
        subdomain: submission.subdomain,
      },
      success: delivered,
    });
  } catch (err) {
    console.warn('validator notification logging failed', err);
  }
}

function rehydrateAssignmentFromStore(
  record: StoredCommitRecord,
  assignment: ValidationAssignment,
  status: 'committed' | 'revealed'
): void {
  const storedEvaluation = record.evaluation as
    | ValidationEvaluation
    | undefined;
  const storedSubmission = record.submission as SubmissionInfo | undefined;
  const evaluation: ValidationEvaluation = storedEvaluation ??
    assignment.commit?.evaluation ?? {
      approve: record.approve,
      reasons: ['restored-from-storage'],
      hashMatches: false,
      resultAvailable: Boolean(storedSubmission?.resultURI),
      worker: storedSubmission?.worker ?? '',
      resultURI: storedSubmission?.resultURI ?? '',
    };
  assignment.commit = {
    txHash: record.commitTx || assignment.commit?.txHash || '',
    salt: record.salt,
    burnTxHash: record.burnTxHash,
    commitHash: record.commitHash,
    roundScope: record.roundScope,
    approve: record.approve,
    committedAt: record.committedAt,
    evaluation,
  };
  if (status === 'revealed') {
    assignment.reveal = {
      txHash: record.revealTx || '',
      revealedAt: record.revealedAt || new Date().toISOString(),
    };
    assignment.status = 'revealed';
  } else {
    assignment.status = 'committed';
  }
  const metadata = record.metadata ?? {};
  if (typeof metadata.notifiedAt === 'string') {
    assignment.notifiedAt = metadata.notifiedAt;
  }
  if (typeof metadata.notificationDelivered === 'boolean') {
    assignment.notificationDelivered = metadata.notificationDelivered;
  }
}

async function loadLocalResult(
  jobId: string,
  resultHash: string
): Promise<{ payload: string | null; source?: string }> {
  const filesToTry = [
    path.join(RESULT_DIR, `${jobId}.json`),
    path.join(RESULT_DIR, `${jobId}.txt`),
    path.join(
      RESULT_DIR,
      `${resultHash.startsWith('0x') ? resultHash.slice(2) : resultHash}.json`
    ),
  ];
  for (const file of filesToTry) {
    try {
      const payload = await fs.promises.readFile(file, 'utf8');
      return { payload, source: file };
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn('Failed to load local result file', file, err);
      }
    }
  }
  return { payload: null };
}

async function fetchResultUri(
  uri: string
): Promise<{ payload: string | null; type?: string; source?: string }> {
  if (!uri) {
    return { payload: null };
  }
  if (uri.startsWith('data:')) {
    const match = uri.match(/^data:([^,]*?),(.*)$/);
    if (!match) {
      return { payload: null };
    }
    const [, meta, data] = match;
    const isBase64 = /;base64$/i.test(meta);
    const mime = meta.replace(/;base64$/i, '');
    try {
      const buffer = isBase64
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data), 'utf8');
      return {
        payload: buffer.toString('utf8'),
        type: mime || 'text/plain',
        source: 'data-uri',
      };
    } catch (err) {
      console.warn('Failed to decode data URI', err);
      return { payload: null };
    }
  }
  if (uri.startsWith('ipfs://local/')) {
    return { payload: null };
  }
  if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
    return { payload: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(uri, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const payload = await res.text();
    return {
      payload,
      type: res.headers.get('content-type') || undefined,
      source: uri,
    };
  } catch (err) {
    console.warn('Failed to fetch result URI', uri, err);
    return { payload: null };
  } finally {
    clearTimeout(timer);
  }
}

async function loadSubmissionContent(submission: SubmissionInfo): Promise<{
  payload: string | null;
  source?: string;
  type?: string;
}> {
  let payload: string | null = null;
  let source: string | undefined;
  let type: string | undefined;

  const local = await loadLocalResult(submission.jobId, submission.resultHash);
  if (local.payload) {
    payload = local.payload;
    source = local.source;
  }

  if (!payload) {
    const fetched = await fetchResultUri(submission.resultURI);
    payload = fetched.payload;
    source = fetched.source ?? source;
    type = fetched.type;
  }

  return { payload, source, type };
}

function analysePayload(
  payload: string | null,
  submission: SubmissionInfo
): ValidationEvaluation {
  const evaluation: ValidationEvaluation = {
    approve: true,
    reasons: [],
    hashMatches: false,
    resultAvailable: Boolean(payload),
    worker: submission.worker,
    resultURI: submission.resultURI,
  };

  if (!payload) {
    evaluation.approve = false;
    evaluation.reasons.push('result-unavailable');
    return evaluation;
  }

  const computedHash = ethers.id(payload);
  evaluation.computedHash = computedHash;
  evaluation.hashMatches =
    computedHash.toLowerCase() === submission.resultHash.toLowerCase();
  if (!evaluation.hashMatches) {
    evaluation.approve = false;
    evaluation.reasons.push('hash-mismatch');
  }

  let parsed: unknown = payload;
  try {
    parsed = JSON.parse(payload);
  } catch {
    // non-JSON payloads are allowed
  }

  const summary = summarizeContent(parsed);
  if (summary) {
    evaluation.preview = summary.preview;
    evaluation.payloadType = summary.type;
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const maybeRecord = parsed as Record<string, unknown>;
    if (maybeRecord.success === false) {
      evaluation.approve = false;
      evaluation.reasons.push('payload-success-flag-false');
    }
    if (typeof maybeRecord.error === 'string' && maybeRecord.error.length > 0) {
      evaluation.approve = false;
      evaluation.reasons.push('payload-error-field');
    }
    evaluation.metadata = {
      keys: Object.keys(maybeRecord).slice(0, 16),
    };
  }

  if (evaluation.approve && !evaluation.reasons.length) {
    evaluation.reasons.push('integrity-verified');
  }

  return evaluation;
}

async function recordValidationTraining(
  assignment: ValidationAssignment,
  evaluation: ValidationEvaluation,
  energy: EnergySample | undefined
): Promise<void> {
  try {
    const chainJob = await registry.jobs(assignment.jobId);
    let rewardRaw = '0';
    let rewardFormatted = '0';
    try {
      const rewardValue = chainJob.reward as bigint | undefined;
      if (typeof rewardValue !== 'undefined') {
        const rewardBigInt = BigInt(rewardValue.toString());
        rewardRaw = rewardBigInt.toString();
        rewardFormatted = ethers.formatUnits(rewardBigInt, TOKEN_DECIMALS);
      }
    } catch {
      // ignore reward parsing errors
    }

    await appendTrainingRecord({
      kind: 'sandbox',
      jobId: assignment.jobId,
      recordedAt: new Date().toISOString(),
      agent: assignment.wallet.address,
      category: 'validation',
      success: evaluation.approve,
      reward: {
        posted: { raw: rewardRaw, formatted: rewardFormatted },
        decimals: TOKEN_DECIMALS,
      },
      sandbox: {
        scenario: 'validation',
        passed: evaluation.approve,
        metrics: {
          sampleSize: 1,
          successRate: evaluation.approve ? 1 : 0,
          averageReward: rewardFormatted,
        },
        details: JSON.stringify({
          reasons: evaluation.reasons,
          worker: evaluation.worker,
          resultURI: evaluation.resultURI,
        }),
      },
      metadata: {
        energy: energy?.energyEstimate,
        entropy: energy?.entropyEstimate,
        durationMs: energy?.durationMs,
        hashMatches: evaluation.hashMatches,
        attempts: assignment.attempts,
      },
    });
  } catch (err) {
    console.warn('Failed to record validation training data', err);
  }
}

async function revealValidation(
  jobId: string,
  assignment: ValidationAssignment
): Promise<void> {
  if (
    !validation ||
    !isCurrentAssignment(assignment) ||
    assignment.status !== 'committed' ||
    assignment.revealProcessing
  )
    return;
  assignment.revealProcessing = true;
  let revealIntent = false;
  let revealGuardReleased = false;
  try {
    const record = loadCommitRecord(jobId, assignment.wallet.address);
    if (
      !record ||
      !record.roundScope ||
      record.commitHash !== assignment.commit?.commitHash
    )
      throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
    await assertStoredValidationRound(
      { validation, registry, provider },
      record
    );
    await assertValidationReveal(
      validation,
      registry,
      provider,
      jobId,
      assignment.wallet.address,
      record.approve,
      record.salt,
      record.burnTxHash
    );
    requireCurrentAssignment(assignment);
    const label = assignment.identity.label || assignment.identity.ensName;
    if (!label) throw new Error('Validator identity missing label');
    const expected = {
      commitHash: record.commitHash,
      roundScope: record.roundScope,
    };
    updateCommitRecord(
      jobId,
      assignment.wallet.address,
      { metadata: { automaticRevealStatus: 'broadcast-intent' } },
      { ...expected, revealUnattempted: true }
    );
    revealIntent = true;
    assignment.status = 'reconciliation-required';
    const tx = await (validation as any)
      .connect(assignment.wallet)
      .revealValidation(
        jobId,
        record.approve,
        record.burnTxHash,
        record.salt,
        label,
        []
      );
    updateCommitRecord(
      jobId,
      assignment.wallet.address,
      { revealTx: tx.hash, metadata: { automaticRevealStatus: 'broadcast' } },
      expected
    );
    await tx.wait();
    assignment.reveal = {
      txHash: tx.hash,
      revealedAt: new Date().toISOString(),
    };
    assignment.status = 'revealed';
    try {
      updateCommitRecord(
        jobId,
        assignment.wallet.address,
        {
          revealedAt: assignment.reveal.revealedAt,
          metadata: { automaticRevealStatus: 'confirmed' },
        },
        expected
      );
    } catch (error) {
      console.warn('failed to persist confirmed validator reveal', error);
    }
    await secureLogAction({
      component: 'validator',
      action: 'reveal',
      jobId,
      agent: assignment.wallet.address,
      metadata: { txHash: tx.hash, approve: record.approve },
      success: true,
    });
  } catch (error) {
    assignment.error = error instanceof Error ? error.message : String(error);
    if (
      !revealIntent &&
      isCurrentAssignment(assignment) &&
      assignment.error !== 'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
    ) {
      assignment.revealPreflightAttempts =
        (assignment.revealPreflightAttempts || 0) + 1;
      if (assignment.revealPreflightAttempts < VALIDATOR_CONTEXT_MAX_ATTEMPTS) {
        assignment.status = 'committed';
        const timer = setTimeout(() => {
          if (
            !isCurrentAssignment(assignment) ||
            assignment.scheduledReveal !== timer
          )
            return;
          assignment.scheduledReveal = null;
          scheduleReveal(jobId, assignment).catch((err) =>
            console.error('validator reveal preflight retry error', err)
          );
        }, VALIDATOR_CONTEXT_RETRY_MS);
        assignment.scheduledReveal = timer;
      } else assignment.status = 'reconciliation-required';
    } else if (assignment.status !== 'revealed')
      assignment.status = 'reconciliation-required';
    assignment.revealProcessing = false;
    revealGuardReleased = true;
    await secureLogAction({
      component: 'validator',
      action: 'reveal-failed',
      jobId,
      agent: assignment.wallet.address,
      metadata: { error: assignment.error },
      success: false,
    });
    throw error;
  } finally {
    if (!revealGuardReleased) assignment.revealProcessing = false;
  }
}

async function scheduleReveal(
  jobId: string,
  assignment: ValidationAssignment,
  attempt = 0
): Promise<void> {
  if (
    !validation ||
    !isCurrentAssignment(assignment) ||
    assignment.status !== 'committed' ||
    assignment.revealProcessing
  )
    return;
  if (assignment.scheduledReveal) clearTimeout(assignment.scheduledReveal);
  assignment.scheduledReveal = null;
  let delayMs: number;
  try {
    const round = await validation.rounds(jobId);
    const block = await provider.getBlock('latest');
    if (!block) throw new Error('VALIDATION_BLOCK_UNAVAILABLE');
    delayMs = validationRevealDelay(
      round,
      block.timestamp,
      VALIDATOR_REVEAL_LEAD_SECONDS
    );
    assignment.round = {
      commitDeadline: Number(round.commitDeadline),
      revealDeadline: Number(round.revealDeadline),
      approvals: round.approvals.toString(),
      rejections: round.rejections.toString(),
      committeeSize: Number(round.committeeSize),
    };
  } catch (error) {
    if (!isCurrentAssignment(assignment) || assignment.status !== 'committed')
      return;
    assignment.error = error instanceof Error ? error.message : String(error);
    if (
      /^VALIDATION_REVEAL_(WINDOW_CLOSED|DELAY_OUT_OF_RANGE)$/.test(
        assignment.error
      ) ||
      attempt >= VALIDATOR_REVEAL_SCHEDULE_MAX_RETRIES
    ) {
      assignment.status = 'reconciliation-required';
      return;
    }
    const timer = setTimeout(() => {
      if (
        !isCurrentAssignment(assignment) ||
        assignment.scheduledReveal !== timer
      )
        return;
      assignment.scheduledReveal = null;
      scheduleReveal(jobId, assignment, attempt + 1).catch((err) =>
        console.error('validator reveal scheduling error', err)
      );
    }, VALIDATOR_CONTEXT_RETRY_MS);
    assignment.scheduledReveal = timer;
    return;
  }
  if (
    !isCurrentAssignment(assignment) ||
    assignment.status !== 'committed' ||
    assignment.revealProcessing
  )
    return;
  const timer = setTimeout(() => {
    if (
      !isCurrentAssignment(assignment) ||
      assignment.scheduledReveal !== timer
    )
      return;
    assignment.scheduledReveal = null;
    revealValidation(jobId, assignment).catch((error) =>
      console.error('validator reveal error', error)
    );
  }, delayMs);
  assignment.scheduledReveal = timer;
}

async function evaluateAndCommit(
  submission: SubmissionInfo,
  assignment: ValidationAssignment
): Promise<void> {
  if (!validation) return;
  if (!isCurrentAssignment(assignment) || !assignment.selectionScope) return;
  if (assignment.processing) return;
  if (assignment.status === 'committed' || assignment.status === 'revealed') {
    return;
  }
  if (
    assignment.status === 'awaiting-review' ||
    assignment.status === 'reconciliation-required'
  )
    return;
  if ((assignment.contextAttempts || 0) >= VALIDATOR_CONTEXT_MAX_ATTEMPTS)
    return;
  if (assignment.attempts >= VALIDATOR_MAX_RETRIES) {
    return;
  }
  if (isValidationFlowPaused()) {
    assignment.processing = false;
    assignment.status = 'failed';
    assignment.error = 'validation-flow-paused';
    await secureLogAction({
      component: 'validator',
      action: 'anomaly-paused',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: { reason: validationPauseReason },
      success: false,
    });
    await recordValidationOutcome({
      jobId: submission.jobId,
      validator: assignment.wallet.address,
      success: false,
      reason: validationPauseReason || 'validation-flow-paused',
      stage: 'anomaly-guard',
    });
    scheduleValidatorFallback(submission.jobId);
    return;
  }
  if (assignment.scheduledEvaluation)
    clearTimeout(assignment.scheduledEvaluation);
  assignment.scheduledEvaluation = null;
  assignment.processing = true;
  try {
    await assertAutomaticValidationAllowed(
      registry,
      provider,
      submission.jobId
    );
  } catch (error) {
    assignment.processing = false;
    if (!isCurrentAssignment(assignment)) return;
    assignment.error = error instanceof Error ? error.message : String(error);
    if (assignment.error === 'VALIDATION_INDEPENDENT_REVIEW_REQUIRED') {
      assignment.status = 'awaiting-review';
    } else if (
      error instanceof SyntaxError ||
      /VALIDATION_SPECIFICATION_MISMATCH|Authoritative job specification hash mismatch|Invalid job specification/.test(
        assignment.error
      )
    ) {
      assignment.status = 'reconciliation-required';
    } else {
      assignment.contextAttempts = (assignment.contextAttempts || 0) + 1;
      assignment.status =
        assignment.contextAttempts < VALIDATOR_CONTEXT_MAX_ATTEMPTS
          ? 'context-retry'
          : 'failed';
      if (assignment.status === 'context-retry')
        scheduleEvaluationRetry(assignment, VALIDATOR_CONTEXT_RETRY_MS);
    }
    await secureLogAction({
      component: 'validator',
      action: 'automatic-validation-abstained',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: { reason: assignment.error },
      success: false,
    });
    return;
  }
  if (!isCurrentAssignment(assignment)) {
    assignment.processing = false;
    return;
  }
  assignment.contextAttempts = 0;
  assignment.error = undefined;
  assignment.attempts += 1;
  assignment.status = 'evaluating';
  if (!assignment.notifiedAt) {
    try {
      await notifyDomainAgent(submission, assignment);
    } catch (err) {
      console.warn('validator notification failed', err);
    }
  }
  const span = startEnergySpan({
    jobId: submission.jobId,
    agent: assignment.wallet.address,
    label: assignment.identity.label,
    category: 'validation',
  });

  let evaluation: ValidationEvaluation | null = null;
  let energySample: EnergySample | undefined;
  let broadcastIntent = false;
  let evaluationGuardReleased = false;
  try {
    requireCurrentAssignment(assignment);
    await ensureStake(assignment.wallet, 0n, ROLE_VALIDATOR);
    requireCurrentAssignment(assignment);
    const content = await loadSubmissionContent(submission);
    requireCurrentAssignment(assignment);
    evaluation = analysePayload(content.payload, submission);
    if (content.source) {
      evaluation.source = content.source;
    }
    const label = assignment.identity.label || assignment.identity.ensName;
    if (!label) {
      throw new Error('Validator identity missing label');
    }
    const previous = loadCommitRecord(
      submission.jobId,
      assignment.wallet.address
    );
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const vote = await prepareValidationCommitment(
      validation,
      registry,
      provider,
      submission.jobId,
      assignment.wallet.address,
      evaluation.approve,
      salt
    );

    const { commitHash, burnTxHash } = vote;
    const roundContext = { validation, registry, provider };
    const roundScope = await readValidationRound(roundContext, vote);
    if (previous)
      await reconcilePreviousRound(roundContext, previous, roundScope);
    requireCurrentAssignment(assignment);
    if (
      !assignment.selectionScope ||
      (
        [
          'chainId',
          'validationModule',
          'nonce',
          'commitDeadline',
          'domain',
          'specHash',
        ] as const
      ).some((field) => assignment.selectionScope![field] !== roundScope[field])
    )
      throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');

    await secureLogAction({
      component: 'validator',
      action: 'evaluate',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: {
        approve: evaluation.approve,
        reasons: evaluation.reasons,
        hashMatches: evaluation.hashMatches,
        source: evaluation.source,
      },
      success: true,
    });

    requireCurrentAssignment(assignment);
    beginCommitRecord(
      submission.jobId,
      assignment.wallet.address,
      {
        approve: evaluation.approve,
        salt,
        burnTxHash,
        commitHash,
        roundScope,
        committedAt: new Date().toISOString(),
        evaluation,
        submission,
        validatorEns: assignment.identity.ensName,
        validatorLabel: assignment.identity.label,
        metadata: {
          automaticCommitStatus: 'broadcast-intent',
          notifiedAt: assignment.notifiedAt,
          notificationDelivered: assignment.notificationDelivered ?? false,
        },
      },
      previous
    );
    broadcastIntent = true;
    assignment.commit = {
      txHash: '',
      salt,
      burnTxHash,
      commitHash,
      roundScope,
      approve: evaluation.approve,
      committedAt: new Date().toISOString(),
      evaluation,
    };
    assignment.status = 'reconciliation-required';
    requireCurrentAssignment(assignment);
    const tx = await (validation as any)
      .connect(assignment.wallet)
      .commitValidation(submission.jobId, commitHash, label, []);
    assignment.commit.txHash = tx.hash;
    updateCommitRecord(
      submission.jobId,
      assignment.wallet.address,
      { commitTx: tx.hash, metadata: { automaticCommitStatus: 'broadcast' } },
      { commitHash, roundScope }
    );
    await tx.wait();
    assignment.status = 'committed';
    try {
      updateCommitRecord(
        submission.jobId,
        assignment.wallet.address,
        {
          committedAt: assignment.commit.committedAt,
          metadata: { automaticCommitStatus: 'confirmed' },
        },
        { commitHash, roundScope }
      );
    } catch (error) {
      console.warn('failed to persist confirmed validator commitment', error);
    }
    if (isCurrentAssignment(assignment))
      await scheduleReveal(submission.jobId, assignment);
    await secureLogAction({
      component: 'validator',
      action: 'commit',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: {
        txHash: tx.hash,
        approve: evaluation.approve,
      },
      success: true,
    });
  } catch (err: any) {
    if (!isCurrentAssignment(assignment)) return;
    assignment.error = err?.message || String(err);
    if (['committed', 'revealed'].includes(assignment.status)) {
      console.warn('validator post-commit reporting failed', err);
      return;
    }
    assignment.status =
      broadcastIntent ||
      assignment.error === 'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
        ? 'reconciliation-required'
        : 'failed';
    if (
      assignment.status === 'failed' &&
      assignment.attempts < VALIDATOR_MAX_RETRIES
    ) {
      scheduleEvaluationRetry(assignment, VALIDATOR_RETRY_DELAY_MS);
    }
    assignment.processing = false;
    evaluationGuardReleased = true;
    await secureLogAction({
      component: 'validator',
      action: 'commit-failed',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: { error: assignment.error },
      success: false,
    });
    await recordValidationOutcome({
      jobId: submission.jobId,
      validator: assignment.wallet.address,
      success: false,
      reason: assignment.error,
      stage: 'commit',
    });
    return;
  } finally {
    if (!evaluationGuardReleased) assignment.processing = false;
    try {
      energySample = await endEnergySpan(span, {
        jobId: submission.jobId,
        stage: 'validation',
        approve: assignment.commit?.approve ?? false,
      });
      assignment.energySample = energySample;
      await publishEnergySample(energySample);
      if (evaluation)
        await recordValidationTraining(assignment, evaluation, energySample);
    } catch (error) {
      console.warn('validator telemetry failed', error);
    }
  }

  await recordValidationOutcome({
    jobId: submission.jobId,
    validator: assignment.wallet.address,
    success: true,
    stage: 'commit',
  });
}

export async function handleValidatorSelection(
  jobId: string,
  validators: string[]
): Promise<void> {
  if (!validation) return;
  if (validators.length > 0) clearValidatorFallback(jobId);
  const managed = new Set(
    walletManager.list().map((address) => address.toLowerCase())
  );
  const bucket = getAssignmentBucket(jobId);
  for (const address of validators) {
    const lower = address.toLowerCase();
    if (!managed.has(lower)) continue;
    const wallet = walletManager.get(address);
    if (!wallet) continue;
    let assignment = bucket.get(lower);
    if (!assignment) {
      assignment = {
        jobId,
        wallet,
        identity: { address: wallet.address, role: 'validator' },
        status: 'selected',
        createdAt: new Date().toISOString(),
        attempts: 0,
      };
      bucket.set(lower, assignment);
    }
    if (assignment.scheduledSelection)
      clearTimeout(assignment.scheduledSelection);
    assignment.scheduledSelection = null;
    try {
      const context = { validation, registry, provider };
      const record = loadCommitRecord(jobId, wallet.address);
      const inspected = record
        ? await inspectStoredValidationRound(context, record)
        : undefined;
      const active =
        inspected?.roundScope ??
        (await readActiveValidationRound(context, jobId));
      if (!isCurrentAssignment(assignment)) continue;
      const freshRecord = inspected?.status === 'fresh-round';
      const previousScope = assignment.selectionScope;
      let fresh = !previousScope && freshRecord;
      if (previousScope) {
        if (
          active.chainId !== previousScope.chainId ||
          active.validationModule !== previousScope.validationModule ||
          active.domain !== previousScope.domain ||
          active.specHash !== previousScope.specHash ||
          BigInt(active.nonce) < BigInt(previousScope.nonce) ||
          BigInt(active.commitDeadline) < BigInt(previousScope.commitDeadline)
        )
          throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
        if (
          active.nonce !== previousScope.nonce ||
          active.commitDeadline !== previousScope.commitDeadline
        ) {
          if (!record && assignment.commit)
            throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
          fresh = true;
        }
      }
      if ((assignment.processing || assignment.revealProcessing) && !fresh)
        continue;
      const identity = await ensureIdentity(wallet, 'validator');
      if (!isCurrentAssignment(assignment)) continue;
      if (
        fresh ||
        (record &&
          !freshRecord &&
          assignment.commit?.commitHash !== record.commitHash)
      ) {
        cancelAssignmentTimers(assignment);
        assignment = {
          jobId,
          wallet,
          identity,
          status: 'selected',
          createdAt: new Date().toISOString(),
          attempts: 0,
        };
        bucket.set(lower, assignment);
      }
      assignment.identity = identity;
      assignment.selectionScope = active;
      assignment.selectionAttempts = 0;
      if (assignment.status === 'context-retry' && !assignment.contextAttempts)
        assignment.status = 'selected';
      if (record && inspected && !freshRecord) {
        if (
          inspected.status === 'uncertain' ||
          (inspected.status === 'committed' &&
            (record.revealTx || record.metadata?.automaticRevealStatus))
        ) {
          cancelAssignmentTimers(assignment);
          assignment.status = 'reconciliation-required';
          assignment.error = 'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED';
          continue;
        }
        rehydrateAssignmentFromStore(
          record,
          assignment,
          inspected.status as 'committed' | 'revealed'
        );
        if (assignment.status === 'revealed')
          cancelAssignmentTimers(assignment);
      }
      if (assignment.status === 'committed' && !assignment.scheduledReveal)
        await scheduleReveal(jobId, assignment);
      await secureLogAction({
        component: 'validator',
        action: 'selected',
        jobId,
        agent: wallet.address,
        metadata: { validators },
        success: true,
      });
      const submission = submissions.get(jobId);
      if (submission && !assignment.scheduledEvaluation)
        await evaluateAndCommit(submission, assignment);
    } catch (error) {
      if (isCurrentAssignment(assignment)) {
        assignment.error =
          error instanceof Error ? error.message : String(error);
        if (
          assignment.error === 'VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED'
        ) {
          cancelAssignmentTimers(assignment);
          assignment.status = 'reconciliation-required';
        } else {
          assignment.selectionAttempts =
            (assignment.selectionAttempts || 0) + 1;
          if (!assignment.selectionScope)
            assignment.status =
              assignment.selectionAttempts < VALIDATOR_CONTEXT_MAX_ATTEMPTS
                ? 'context-retry'
                : 'failed';
          scheduleSelectionRetry(assignment);
        }
      }
      await secureLogAction({
        component: 'validator',
        action: 'selection-failed',
        jobId,
        agent: wallet.address,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
        success: false,
      });
    }
  }
}

export async function handleJobAwaitingValidation(
  submission: SubmissionInfo
): Promise<void> {
  submissions.set(submission.jobId, submission);
  scheduleValidatorFallback(submission.jobId);
  const bucket = assignments.get(submission.jobId);
  if (!bucket) return;
  for (const assignment of bucket.values()) {
    await evaluateAndCommit(submission, assignment);
  }
}

export const handleJobSubmissionForValidators = handleJobAwaitingValidation;

export function handleJobCompletionForValidators(jobId: string): void {
  submissions.delete(jobId);
  clearValidatorFallback(jobId);
  const bucket = assignments.get(jobId);
  if (!bucket) return;
  for (const [address, assignment] of bucket.entries()) {
    cancelAssignmentTimers(assignment);
    try {
      const metadata: Record<string, unknown> = {
        completedAt: new Date().toISOString(),
      };
      if (assignment.notifiedAt) {
        metadata.notifiedAt = assignment.notifiedAt;
        metadata.notificationDelivered =
          assignment.notificationDelivered ?? false;
      }
      if (assignment.commit?.roundScope)
        updateCommitRecord(
          jobId,
          assignment.wallet.address,
          { metadata },
          {
            commitHash: assignment.commit.commitHash,
            roundScope: assignment.commit.roundScope,
          }
        );
    } catch (err) {
      if (
        !(
          err instanceof Error &&
          /missing required base fields/.test(err.message)
        )
      ) {
        console.warn('failed to persist validator completion metadata', err);
      }
    }
    assignment.status =
      assignment.status === 'revealed' ? 'revealed' : 'completed';
    storeHistory(toSnapshot(assignment));
    bucket.delete(address);
  }
  assignments.delete(jobId);
}

export async function handleDisputeRaised(
  jobId: string,
  claimant: string,
  evidenceHash: string
): Promise<void> {
  const timestamp = new Date().toISOString();
  for (const address of walletManager.list()) {
    const record = loadCommitRecord(jobId, address);
    if (!record) continue;
    try {
      updateCommitRecord(jobId, address, {
        dispute: { claimant, evidenceHash, recordedAt: timestamp },
      });
    } catch (err) {
      console.warn('failed to persist validator dispute record', err);
    }
    try {
      await secureLogAction({
        component: 'validator',
        action: 'dispute-raised',
        jobId,
        agent: address,
        metadata: { claimant, evidenceHash },
        success: true,
      });
    } catch (err) {
      console.warn('validator dispute logging failed', err);
    }
    const assignment = assignments.get(jobId)?.get(address.toLowerCase());
    const message = {
      type: 'ValidationDispute',
      jobId,
      claimant,
      evidenceHash,
      validator: {
        address,
        ens: assignment?.identity.ensName ?? record.validatorEns,
        label: assignment?.identity.label ?? record.validatorLabel,
      },
    };
    try {
      await sendToValidatorAgent(address, message);
    } catch (err) {
      console.warn('validator dispute notification failed', err);
    }
  }
}

export async function handleDisputeResolved(
  jobId: string,
  resolver: string,
  employerWins: boolean
): Promise<void> {
  const timestamp = new Date().toISOString();
  for (const address of walletManager.list()) {
    const record = loadCommitRecord(jobId, address);
    if (!record) continue;
    try {
      updateCommitRecord(jobId, address, {
        resolution: { resolver, employerWins, resolvedAt: timestamp },
      });
    } catch (err) {
      console.warn('failed to persist validator dispute resolution', err);
    }
    try {
      await secureLogAction({
        component: 'validator',
        action: 'dispute-resolved',
        jobId,
        agent: address,
        metadata: { resolver, employerWins },
        success: true,
      });
    } catch (err) {
      console.warn('validator dispute resolution logging failed', err);
    }
    const message = {
      type: 'ValidationDisputeResolved',
      jobId,
      resolver,
      employerWins,
      validator: {
        address,
        ens: record.validatorEns,
        label: record.validatorLabel,
      },
    };
    try {
      await sendToValidatorAgent(address, message);
    } catch (err) {
      console.warn('validator dispute resolution notification failed', err);
    }
  }
}

export function listValidatorAssignments(): {
  active: ValidatorAssignmentSnapshot[];
  history: ValidatorAssignmentSnapshot[];
} {
  const active: ValidatorAssignmentSnapshot[] = [];
  for (const bucket of assignments.values()) {
    for (const assignment of bucket.values()) {
      active.push(toSnapshot(assignment));
    }
  }
  return { active, history: [...assignmentHistory] };
}

export function clearValidatorState(): void {
  for (const bucket of assignments.values())
    for (const assignment of bucket.values())
      cancelAssignmentTimers(assignment);
  assignments.clear();
  submissions.clear();
  assignmentHistory.length = 0;
  for (const timer of fallbackTimers.values()) {
    clearTimeout(timer);
  }
  fallbackTimers.clear();
  if (validationRecoveryTimer) clearTimeout(validationRecoveryTimer);
  validationRecoveryTimer = null;
  validationOutcomes = [];
  validationPausedUntil = 0;
  validationPauseTriggeredAt = null;
  validationPauseReason = null;
  validationPauseCount = 0;
}
