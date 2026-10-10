import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  computerTaskDigest,
  executeComputerWork,
  requireComputerWorkAdmission,
} from './computerWork';

type RecordValue = Record<string, any>;
const { loadSuccessorBridge, loadSuccessorIntegrity } =
  require('./successor-runtime.cjs') as {
    loadSuccessorBridge(): Promise<{
      validateComputerWorkBinding(value: unknown): RecordValue;
      computerWorkBindingDigest(value: unknown): Promise<string>;
      authorizeJobLease(options: RecordValue): Promise<{
        allowed: boolean;
        code: string;
        reason?: string;
        validUntil?: number;
      }>;
    }>;
    loadSuccessorIntegrity(): Promise<{ canonicalize(value: unknown): string }>;
  };

export interface SuccessorDispatchBinding {
  manifestSha256: string;
  institutionId: string;
  missionId: string;
  candidateDigest: string;
  workOrderDigest: string;
  mode: 'fixture';
}

export class SuccessorComputerWorkError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SuccessorComputerWorkError';
  }
}

function reject(code: string, message: string): never {
  throw new SuccessorComputerWorkError(code, message);
}

function readProtectedPolicy(): RecordValue {
  const filename = process.env.SUCCESSOR_COMPUTER_WORK_POLICY_FILE;
  if (!filename || !path.isAbsolute(filename))
    reject(
      'UNCONFIGURED_SUCCESSOR_POLICY',
      'Configure an absolute protected SUCCESSOR_COMPUTER_WORK_POLICY_FILE'
    );
  let fd: number;
  try {
    if (typeof fs.constants.O_NOFOLLOW !== 'number') throw new Error();
    fd = fs.openSync(
      filename,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
  } catch {
    return reject(
      'UNSAFE_SUCCESSOR_POLICY',
      'Successor policy must be a protected operator-owned regular file'
    );
  }
  try {
    const stat = fs.fstatSync(fd);
    if (
      !stat.isFile() ||
      stat.size > 262144 ||
      (typeof process.geteuid === 'function' &&
        ((stat.uid !== process.geteuid() && stat.uid !== 0) ||
          (stat.mode & 0o022) !== 0))
    )
      reject(
        'UNSAFE_SUCCESSOR_POLICY',
        'Successor policy must be a protected operator-owned regular file no larger than 256 KiB'
      );
    const raw = fs.readFileSync(fd);
    const json = raw.toString('utf8');
    if (!Buffer.from(json, 'utf8').equals(raw))
      reject(
        'INVALID_SUCCESSOR_POLICY',
        'Successor policy must contain valid UTF-8'
      );
    const policy = JSON.parse(json);
    if (
      !policy ||
      typeof policy !== 'object' ||
      Array.isArray(policy) ||
      policy.schemaVersion !== 1 ||
      Object.keys(policy).sort().join(',') !==
        'assurance,schemaVersion,state,trustStore'
    )
      reject(
        'INVALID_SUCCESSOR_POLICY',
        'Successor policy requires version 1, trustStore, current state and assurance'
      );
    return policy;
  } finally {
    fs.closeSync(fd);
  }
}

function leaseClaimPath(stateDirectory: string, manifest: RecordValue): string {
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        manifest.institutionId,
        manifest.environment,
        manifest.mode,
        manifest.action.nonce,
      ])
    )
    .digest('hex');
  return path.join(stateDirectory, `successor-lease-${key}.json`);
}

function checkLeaseUnused(stateDirectory: string, manifest: RecordValue): void {
  try {
    fs.lstatSync(leaseClaimPath(stateDirectory, manifest));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  reject(
    'REPLAYED_NONCE',
    'This successor lease already has a durable dispatch claim; reconcile it before any further work'
  );
}

function claimLease(
  stateDirectory: string,
  manifest: RecordValue,
  digest: string,
  attemptId: string
): void {
  let fd: number;
  try {
    fd = fs.openSync(leaseClaimPath(stateDirectory, manifest), 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      reject(
        'REPLAYED_NONCE',
        'Another dispatcher already claimed this successor lease'
      );
    throw error;
  }
  try {
    fs.writeFileSync(
      fd,
      JSON.stringify({
        schemaVersion: 1,
        manifestSha256: digest,
        jobId: manifest.jobId,
        attemptId,
        nonce: manifest.action.nonce,
        status: 'dispatch-reserved',
        reservedAt: new Date().toISOString(),
      })
    );
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const parent = fs.openSync(stateDirectory, 'r');
  try {
    fs.fsyncSync(parent);
  } finally {
    fs.closeSync(parent);
  }
}

/** Read-only preflight, including signed lease verification, before any stake/application. */
export async function inspectSuccessorComputerWorkAdmission(
  jobId: string,
  taskValue: unknown,
  manifestValue: unknown
) {
  const core = await loadSuccessorBridge();
  const manifest = core.validateComputerWorkBinding(manifestValue);
  const manifestSha256 = await core.computerWorkBindingDigest(manifest);
  const admitted = requireComputerWorkAdmission(
    jobId,
    taskValue,
    manifestSha256
  );
  if (manifest.mode !== 'fixture' || admitted.profile.mode !== 'fixture')
    reject(
      'UNCOMMISSIONED_RUNTIME',
      'Successor computer work is fixture-only until an enforceable external driver is independently commissioned'
    );
  if (
    manifest.jobId !== jobId ||
    manifest.taskSha256 !== computerTaskDigest(admitted.task) ||
    manifest.deploymentId !== admitted.profile.deploymentId
  )
    reject(
      'WORK_ORDER_BINDING_MISMATCH',
      'Sealed mission, task, job or deployment differs from operator admission'
    );
  if (
    manifest.action.target !== admitted.profile.endpoint ||
    manifest.action.dataClass !== admitted.task.dataClass
  )
    reject(
      'SCOPE_DENIED',
      'Sealed action must bind the admitted endpoint and task data class'
    );
  if (
    manifest.lease.context?.institutionId !== manifest.institutionId ||
    manifest.lease.context?.missionId !== manifest.missionId ||
    manifest.lease.context?.environment !== manifest.environment ||
    manifest.lease.context?.mode !== manifest.mode
  )
    reject(
      'CONTEXT_MISMATCH',
      'Signed lease context differs from the sealed mission binding'
    );
  const policy = readProtectedPolicy();
  const integrity = await loadSuccessorIntegrity();
  integrity.canonicalize(policy);
  const authorized = await core.authorizeJobLease({
    action: manifest.action,
    lease: manifest.lease,
    trustStore: policy.trustStore,
    state: policy.state,
    assurance: policy.assurance,
    now: Date.now(),
  });
  if (!authorized.allowed)
    reject(
      authorized.code,
      authorized.reason ??
        'The signed successor lease does not authorize dispatch'
    );
  if (
    !Number.isFinite(authorized.validUntil) ||
    admitted.profile.timeoutMs >
      Math.min(authorized.validUntil!, Date.parse(manifest.action.deadline)) -
        Date.now()
  )
    reject(
      'INSUFFICIENT_AUTHORIZED_TIME',
      'The complete worker timeout must fit inside the remaining signed action window'
    );
  checkLeaseUnused(admitted.stateDirectory, manifest);
  const binding: SuccessorDispatchBinding = {
    manifestSha256,
    institutionId: manifest.institutionId,
    missionId: manifest.missionId,
    candidateDigest: manifest.candidateDigest,
    workOrderDigest: manifest.workOrderDigest,
    mode: 'fixture',
  };
  return { ...admitted, manifest, binding };
}

/** Integrate sealed formation work without conferring proof, admission or settlement. */
export async function executeSuccessorComputerWork(
  jobId: string,
  taskValue: unknown,
  manifestValue: unknown
) {
  const admitted = await inspectSuccessorComputerWorkAdmission(
    jobId,
    taskValue,
    manifestValue
  );
  return executeComputerWork(jobId, admitted.task, admitted.profile, {
    stateDirectory: admitted.stateDirectory,
    successor: admitted.binding,
    beforeDispatch: async (phase, attemptId) => {
      const current = await inspectSuccessorComputerWorkAdmission(
        jobId,
        admitted.task,
        admitted.manifest
      );
      if (
        current.binding.manifestSha256 !== admitted.binding.manifestSha256 ||
        JSON.stringify(current.profile) !== JSON.stringify(admitted.profile) ||
        current.stateDirectory !== admitted.stateDirectory
      )
        reject(
          'SUCCESSOR_ADMISSION_CHANGED',
          'Operator configuration changed; renew admission before dispatch'
        );
      if (phase === 'dispatch')
        claimLease(
          admitted.stateDirectory,
          admitted.manifest,
          admitted.binding.manifestSha256,
          attemptId!
        );
    },
  });
}
