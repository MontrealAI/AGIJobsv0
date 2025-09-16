import fs from 'fs';
import path from 'path';
import { ethers, Wallet } from 'ethers';
import {
  registry,
  validation,
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
import { publishEnergySample } from './telemetry';
import { appendTrainingRecord } from '../shared/trainingRecords';
import { secureLogAction } from './security';
import { summarizeContent } from '../shared/worldModel';
import { loadCommitRecord, updateCommitRecord } from './validationStore';

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
  round?: RoundMetadata;
  commit?: {
    txHash: string;
    salt: string;
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
  scheduledReveal?: NodeJS.Timeout | null;
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

const RESULT_DIR = path.resolve(__dirname, '../storage/results');
const VALIDATOR_MAX_RETRIES = Number(process.env.VALIDATOR_MAX_RETRIES || '3');
const VALIDATOR_RETRY_DELAY_MS = Number(
  process.env.VALIDATOR_RETRY_DELAY_MS || '15000'
);
const VALIDATOR_REVEAL_LEAD_SECONDS = Number(
  process.env.VALIDATOR_REVEAL_LEAD_SECONDS || '30'
);
const VALIDATOR_REVEAL_FALLBACK_MS = Number(
  process.env.VALIDATOR_REVEAL_FALLBACK_MS || '60000'
);
const VALIDATOR_HISTORY_LIMIT = Number(
  process.env.VALIDATOR_HISTORY_LIMIT || '50'
);

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
  const delivered = await sendToValidatorAgent(assignment.wallet.address, message);
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
  try {
    updateCommitRecord(submission.jobId, assignment.wallet.address, {
      metadata: {
        notifiedAt: assignment.notifiedAt,
        notificationDelivered: delivered,
      },
    });
  } catch (err) {
    // commit record may not exist yet; ignore but log at debug level
    if (err instanceof Error && /missing required base fields/.test(err.message)) {
      return;
    }
    console.warn('failed to persist validator notification metadata', err);
  }
}

function rehydrateAssignmentFromStore(
  jobId: string,
  assignment: ValidationAssignment
): void {
  const record = loadCommitRecord(jobId, assignment.wallet.address);
  if (!record) return;
  const storedEvaluation = record.evaluation as
    | ValidationEvaluation
    | undefined;
  const storedSubmission = record.submission as SubmissionInfo | undefined;
  const evaluation: ValidationEvaluation =
    storedEvaluation ??
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
    approve: record.approve,
    committedAt: record.committedAt,
    evaluation,
  };
  if (record.revealTx) {
    assignment.reveal = {
      txHash: record.revealTx,
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
  if (!validation) return;
  if (assignment.status === 'revealed') return;
  let commitInfo = assignment.commit;
  if (!commitInfo) {
    const record = loadCommitRecord(jobId, assignment.wallet.address);
    if (record) {
      const storedEvaluation = record.evaluation as
        | ValidationEvaluation
        | undefined;
      const storedSubmission = record.submission as
        | SubmissionInfo
        | undefined;
      const evaluation: ValidationEvaluation =
        storedEvaluation ??
        assignment.commit?.evaluation ?? {
          approve: record.approve,
          reasons: ['restored-from-storage'],
          hashMatches: false,
          resultAvailable: Boolean(storedSubmission?.resultURI),
          worker: storedSubmission?.worker ?? '',
          resultURI: storedSubmission?.resultURI ?? '',
        };
      commitInfo = {
        txHash: record.commitTx || assignment.commit?.txHash || '',
        salt: record.salt,
        approve: record.approve,
        committedAt: record.committedAt,
        evaluation,
      };
      assignment.commit = commitInfo;
    }
  }
  if (!commitInfo) {
    console.warn('Validator assignment missing commit data for reveal', jobId);
    return;
  }
  const label = assignment.identity.label || assignment.identity.ensName;
  if (!label) {
    throw new Error('Validator identity missing label');
  }
  try {
    const tx = await (validation as any)
      .connect(assignment.wallet)
      .revealValidation(
        jobId,
        commitInfo.approve,
        commitInfo.salt,
        label,
        []
      );
    await tx.wait();
    assignment.reveal = {
      txHash: tx.hash,
      revealedAt: new Date().toISOString(),
    };
    assignment.status = 'revealed';
    try {
      updateCommitRecord(jobId, assignment.wallet.address, {
        revealTx: tx.hash,
        revealedAt: assignment.reveal.revealedAt,
        metadata: assignment.notifiedAt
          ? {
              notifiedAt: assignment.notifiedAt,
              notificationDelivered:
                assignment.notificationDelivered ?? false,
            }
          : undefined,
      });
    } catch (err) {
      console.warn('failed to persist validator reveal metadata', err);
    }
    await secureLogAction({
      component: 'validator',
      action: 'reveal',
      jobId,
      agent: assignment.wallet.address,
      metadata: { txHash: tx.hash, approve: commitInfo.approve },
      success: true,
    });
  } catch (err: any) {
    assignment.error = err?.message || String(err);
    await secureLogAction({
      component: 'validator',
      action: 'reveal-failed',
      jobId,
      agent: assignment.wallet.address,
      metadata: { error: assignment.error },
      success: false,
    });
    throw err;
  }
}

async function scheduleReveal(
  jobId: string,
  assignment: ValidationAssignment
): Promise<void> {
  if (!validation) return;
  if (assignment.scheduledReveal) {
    clearTimeout(assignment.scheduledReveal);
    assignment.scheduledReveal = null;
  }
  try {
    const round = await validation.rounds(jobId);
    const commitDeadline = Number(round[2] || round.commitDeadline || 0);
    const revealDeadline = Number(round[3] || round.revealDeadline || 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const baseTarget =
      Math.max(commitDeadline, nowSec) + VALIDATOR_REVEAL_LEAD_SECONDS;
    const maxTarget = revealDeadline
      ? Math.min(revealDeadline - 1, baseTarget)
      : baseTarget;
    const targetSec = Math.max(nowSec, maxTarget);
    let delayMs = Math.max(0, targetSec - nowSec) * 1000;
    if (delayMs === 0) {
      delayMs = VALIDATOR_REVEAL_FALLBACK_MS;
    }
    assignment.scheduledReveal = setTimeout(() => {
      revealValidation(jobId, assignment).catch((err) =>
        console.error('validator reveal error', err)
      );
    }, delayMs);
    assignment.round = {
      commitDeadline,
      revealDeadline,
      approvals: round[4]?.toString?.(),
      rejections: round[5]?.toString?.(),
      committeeSize: Number(round[7] || round.committeeSize || 0),
    };
  } catch (err) {
    console.warn('Failed to schedule validator reveal', jobId, err);
    assignment.scheduledReveal = setTimeout(() => {
      revealValidation(jobId, assignment).catch((error) =>
        console.error('validator reveal retry error', error)
      );
    }, VALIDATOR_REVEAL_FALLBACK_MS);
  }
}

async function evaluateAndCommit(
  submission: SubmissionInfo,
  assignment: ValidationAssignment
): Promise<void> {
  if (!validation) return;
  if (assignment.processing) return;
  if (assignment.status === 'committed' || assignment.status === 'revealed') {
    return;
  }
  if (assignment.attempts >= VALIDATOR_MAX_RETRIES) {
    return;
  }
  assignment.processing = true;
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
  try {
    await ensureStake(assignment.wallet, 0n, ROLE_VALIDATOR);
  } catch (err: any) {
    assignment.processing = false;
    assignment.error = err?.message || String(err);
    assignment.status = 'failed';
    await secureLogAction({
      component: 'validator',
      action: 'stake-failed',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: { error: assignment.error },
      success: false,
    });
    return;
  }

  let evaluation: ValidationEvaluation | null = null;
  let energySample: EnergySample | undefined;
  try {
    const content = await loadSubmissionContent(submission);
    evaluation = analysePayload(content.payload, submission);
    if (content.source) {
      evaluation.source = content.source;
    }
    const label = assignment.identity.label || assignment.identity.ensName;
    if (!label) {
      throw new Error('Validator identity missing label');
    }
    const nonce = await validation.jobNonce(submission.jobId);
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const commitHash = ethers.solidityPackedKeccak256(
      ['uint256', 'uint256', 'bool', 'bytes32'],
      [
        BigInt(submission.jobId),
        BigInt(nonce.toString()),
        evaluation.approve,
        salt,
      ]
    );

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

    const tx = await (validation as any)
      .connect(assignment.wallet)
      .commitValidation(submission.jobId, commitHash, label, []);
    await tx.wait();
    assignment.commit = {
      txHash: tx.hash,
      salt,
      approve: evaluation.approve,
      committedAt: new Date().toISOString(),
      evaluation,
    };
    assignment.status = 'committed';
    try {
      updateCommitRecord(submission.jobId, assignment.wallet.address, {
        approve: evaluation.approve,
        salt,
        commitHash,
        commitTx: tx.hash,
        committedAt: assignment.commit.committedAt,
        evaluation,
        submission,
        validatorEns: assignment.identity.ensName,
        validatorLabel: assignment.identity.label,
        metadata: assignment.notifiedAt
          ? {
              notifiedAt: assignment.notifiedAt,
              notificationDelivered:
                assignment.notificationDelivered ?? false,
            }
          : undefined,
      });
    } catch (err) {
      console.warn('failed to persist validator commit state', err);
    }
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
    assignment.error = err?.message || String(err);
    assignment.status = 'failed';
    await secureLogAction({
      component: 'validator',
      action: 'commit-failed',
      jobId: submission.jobId,
      agent: assignment.wallet.address,
      metadata: { error: assignment.error },
      success: false,
    });
    if (assignment.attempts < VALIDATOR_MAX_RETRIES) {
      setTimeout(() => {
        evaluateAndCommit(submission, assignment).catch((error) =>
          console.error('validator evaluation retry error', error)
        );
      }, VALIDATOR_RETRY_DELAY_MS);
    }
    return;
  } finally {
    assignment.processing = false;
    energySample = await endEnergySpan(span, {
      jobId: submission.jobId,
      stage: 'validation',
      approve: assignment.commit?.approve ?? false,
    });
    assignment.energySample = energySample;
    await publishEnergySample(energySample);
    if (evaluation) {
      await recordValidationTraining(assignment, evaluation, energySample);
    }
  }

  try {
    await scheduleReveal(submission.jobId, assignment);
  } catch (err) {
    console.warn('Failed to schedule validator reveal', err);
  }
}

export async function handleValidatorSelection(
  jobId: string,
  validators: string[]
): Promise<void> {
  if (!validation) return;
  const managed = new Set(
    walletManager.list().map((address) => address.toLowerCase())
  );
  const bucket = getAssignmentBucket(jobId);
  for (const address of validators) {
    const lower = address.toLowerCase();
    if (!managed.has(lower)) continue;
    if (bucket.has(lower)) continue;
    const wallet = walletManager.get(address);
    if (!wallet) continue;
    try {
      const identity = await ensureIdentity(wallet, 'validator');
      const assignment: ValidationAssignment = {
        jobId,
        wallet,
        identity,
        status: 'selected',
        createdAt: new Date().toISOString(),
        attempts: 0,
      };
      rehydrateAssignmentFromStore(jobId, assignment);
      bucket.set(lower, assignment);
      await secureLogAction({
        component: 'validator',
        action: 'selected',
        jobId,
        agent: wallet.address,
        metadata: { validators },
        success: true,
      });
      if (assignment.status === 'committed' && !assignment.scheduledReveal) {
        try {
          await scheduleReveal(jobId, assignment);
        } catch (err) {
          console.warn('Failed to reschedule reveal for restored validator', err);
        }
      }
      const submission = submissions.get(jobId);
      if (submission) {
        try {
          await notifyDomainAgent(submission, assignment);
        } catch (err) {
          console.warn('validator notification during selection failed', err);
        }
        await evaluateAndCommit(submission, assignment);
      }
    } catch (err: any) {
      console.error('Validator identity verification failed', err);
      await secureLogAction({
        component: 'validator',
        action: 'selection-failed',
        jobId,
        agent: wallet.address,
        metadata: { error: err?.message },
        success: false,
      });
    }
  }
}

export async function handleJobAwaitingValidation(
  submission: SubmissionInfo
): Promise<void> {
  submissions.set(submission.jobId, submission);
  const bucket = assignments.get(submission.jobId);
  if (!bucket) return;
  for (const assignment of bucket.values()) {
    try {
      await notifyDomainAgent(submission, assignment);
    } catch (err) {
      console.warn('validator notification failed', err);
    }
    await evaluateAndCommit(submission, assignment);
  }
}

export const handleJobSubmissionForValidators = handleJobAwaitingValidation;

export function handleJobCompletionForValidators(jobId: string): void {
  submissions.delete(jobId);
  const bucket = assignments.get(jobId);
  if (!bucket) return;
  for (const [address, assignment] of bucket.entries()) {
    if (assignment.scheduledReveal) {
      clearTimeout(assignment.scheduledReveal);
      assignment.scheduledReveal = null;
    }
    try {
      const metadata: Record<string, unknown> = {
        completedAt: new Date().toISOString(),
      };
      if (assignment.notifiedAt) {
        metadata.notifiedAt = assignment.notifiedAt;
        metadata.notificationDelivered =
          assignment.notificationDelivered ?? false;
      }
      updateCommitRecord(jobId, assignment.wallet.address, { metadata });
    } catch (err) {
      if (
        !(err instanceof Error && /missing required base fields/.test(err.message))
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
  assignments.clear();
  submissions.clear();
  assignmentHistory.length = 0;
}
