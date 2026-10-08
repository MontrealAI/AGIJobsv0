import { Wallet, ethers } from 'ethers';
import {
  recordDeliverable,
  type AgentDeliverableRecord,
  type DeliverableContributor,
} from './deliverableStore';
import { registry, jobs } from './utils';
import { acknowledgeTaxPolicy as ensureTaxAcknowledgement } from './stakeCoordinator';
import { publishCertificateMetadata } from './certificateMetadata';

type SubmissionMethod = 'submit' | 'none';

export class SubmissionInputError extends Error {}

/** Convert legacy packed proof bytes or a bytes32 array to the current ABI. */
export function normaliseIdentityProof(value: unknown): string[] {
  if (value === undefined || value === null || value === '' || value === '0x')
    return [];
  if (Array.isArray(value)) {
    if (
      [...value].every(
        (word) => typeof word === 'string' && ethers.isHexString(word, 32)
      )
    )
      return [...value];
  } else if (
    typeof value === 'string' &&
    /^0x(?:[0-9a-fA-F]{64})+$/.test(value)
  ) {
    return value
      .slice(2)
      .match(/.{64}/g)!
      .map((word) => `0x${word}`);
  }
  throw new SubmissionInputError(
    'Identity proof must contain complete bytes32 words'
  );
}

export interface SubmitDeliverableOptions {
  jobId: string;
  wallet: Wallet;
  resultUri?: string;
  resultCid?: string;
  resultRef?: string;
  resultHash?: string;
  proofBytes?: string | string[];
  subdomain?: string;
  proof?: unknown;
  success?: boolean;
  finalize?: boolean;
  finalizeOnly?: boolean;
  preferFinalize?: boolean;
  metadata?: Record<string, unknown>;
  telemetry?: unknown;
  telemetryCid?: string;
  telemetryUri?: string;
  contributors?: DeliverableContributor[];
  digest?: string;
  signature?: string;
  signedPayload?: unknown;
}

export interface SubmitDeliverableResult {
  txHash?: string;
  submissionMethod: SubmissionMethod;
  resultHash: string;
  deliverable: AgentDeliverableRecord;
}

function canonicalisePayload(payload: unknown): string {
  try {
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function normaliseProof(proof: unknown): Record<string, unknown> | undefined {
  if (!proof) {
    return undefined;
  }
  if (typeof proof === 'string') {
    if (proof.trim().length === 0) {
      return undefined;
    }
    return { raw: proof };
  }
  if (typeof proof === 'object') {
    return proof as Record<string, unknown>;
  }
  return undefined;
}

export async function submitDeliverable(
  options: SubmitDeliverableOptions
): Promise<SubmitDeliverableResult> {
  const {
    jobId,
    wallet,
    resultUri,
    resultCid,
    resultRef,
    resultHash,
    proofBytes,
    subdomain,
    proof,
    success,
    finalizeOnly,
    metadata,
    telemetry,
    telemetryCid,
    telemetryUri,
    contributors,
    digest,
    signature,
    signedPayload,
  } = options;

  if (!jobId) {
    throw new Error('jobId is required');
  }
  if (!wallet) {
    throw new Error('wallet is required');
  }
  if (finalizeOnly) {
    throw new SubmissionInputError(
      'finalizeOnly is unsupported: submit results for independent validation before settlement'
    );
  }
  const identityProof = normaliseIdentityProof(
    proofBytes ?? (typeof proof === 'string' ? proof : undefined)
  );

  const resolvedResultRef =
    (resultRef && resultRef.trim().length > 0 ? resultRef : undefined) ||
    (resultCid && resultCid.trim().length > 0 ? resultCid : undefined) ||
    (resultUri && resultUri.trim().length > 0 ? resultUri : undefined);

  let resolvedHash: string;
  if (resultHash && resultHash.trim().length > 0) {
    if (!ethers.isHexString(resultHash, 32))
      throw new SubmissionInputError('resultHash must be a bytes32 value');
    resolvedHash = resultHash;
  } else if (resolvedResultRef) {
    resolvedHash = ethers.id(resolvedResultRef);
  } else {
    resolvedHash = ethers.ZeroHash;
  }

  if (signature && signedPayload !== undefined) {
    const canonical = canonicalisePayload(signedPayload);
    const recovered = ethers.verifyMessage(canonical, signature).toLowerCase();
    if (recovered !== wallet.address.toLowerCase()) {
      throw new Error('signature mismatch');
    }
  }

  let submissionMethod: SubmissionMethod = 'none';
  let txHash: string | undefined;
  await ensureTaxAcknowledgement(wallet);
  const submissionUri = resultUri || resolvedResultRef || '';
  try {
    const submitTx = await (registry as any)
      .connect(wallet)
      .submit(
        jobId,
        resolvedHash,
        submissionUri,
        subdomain ?? '',
        identityProof
      );
    await submitTx.wait();
    submissionMethod = 'submit';
    txHash = submitTx.hash;
  } catch (err) {
    console.error('submit transaction failed', err);
    throw new Error('Failed to submit job result transaction');
  }

  const submittedAt = new Date().toISOString();
  const cachedJob = jobs.get(jobId);
  let certificateMetadata;
  try {
    certificateMetadata = await publishCertificateMetadata({
      jobId,
      agent: wallet.address,
      resultHash: resolvedHash,
      resultUri: resultUri || resolvedResultRef || undefined,
      resultCid: resultCid || undefined,
      signature,
      success: success !== false,
      submittedAt,
      submissionMethod,
      txHash,
      job: cachedJob
        ? {
            employer: cachedJob.employer,
            agent: cachedJob.agent,
            specUri: cachedJob.uri,
            specHash: cachedJob.specHash,
          }
        : undefined,
    });
  } catch (metaErr) {
    console.warn('Failed to publish certificate metadata', metaErr);
  }

  const deliverable = recordDeliverable({
    jobId,
    agent: wallet.address,
    success: success !== false,
    submittedAt,
    resultUri: resultUri || resolvedResultRef || undefined,
    resultCid: resultCid || undefined,
    resultRef: resolvedResultRef || undefined,
    resultHash: resolvedHash,
    digest,
    signature,
    proof: normaliseProof(proof),
    metadata,
    telemetry,
    telemetryCid,
    telemetryUri,
    contributors,
    submissionMethod,
    txHash,
    certificateMetadataUri: certificateMetadata?.uri,
    certificateMetadataCid: certificateMetadata?.cid,
    certificateMetadataIpnsName: certificateMetadata?.ipnsName,
  });

  return {
    txHash,
    submissionMethod,
    resultHash: resolvedHash,
    deliverable,
  };
}
