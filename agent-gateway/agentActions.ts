import { Wallet, ethers } from 'ethers';
import {
  recordDeliverable,
  validateDeliverableInput,
  assertDeliverableStorageReady,
  DeliverableInputError,
  type AgentDeliverableRecord,
  type DeliverableInput,
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
  signature?: unknown;
  signedPayload?: unknown;
}

export interface SubmitDeliverableResult {
  txHash?: string;
  submissionMethod: SubmissionMethod;
  resultHash: string;
  deliverable: AgentDeliverableRecord;
}

type ContentAttestation =
  | { kind: 'unsigned' }
  | { kind: 'signed'; signature: string; resultHash: string };

/**
 * Evidence signatures are optional content attestations, not authorization to
 * use a managed wallet. HTTP/gRPC authentication and the signed registry
 * transaction establish that authority. An attestation must be complete and
 * cover exactly the digest advertised by the certificate metadata.
 */
function parseContentAttestation(
  signature: unknown,
  signedPayload: unknown,
  resultHash: string
): ContentAttestation {
  if (signature === undefined && signedPayload === undefined) {
    return { kind: 'unsigned' };
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    throw new SubmissionInputError(
      'A content attestation requires a signature and signedPayload'
    );
  }
  if (
    typeof signedPayload !== 'string' ||
    !ethers.isHexString(signedPayload, 32) ||
    signedPayload.toLowerCase() !== resultHash.toLowerCase()
  ) {
    throw new SubmissionInputError(
      'signedPayload must be the exact submitted resultHash digest'
    );
  }
  return { kind: 'signed', signature, resultHash };
}

function verifyContentAttestation(
  attestation: Extract<ContentAttestation, { kind: 'signed' }>,
  agent: string
): string {
  try {
    const signature = ethers.Signature.from(attestation.signature).serialized;
    const recovered = ethers.verifyMessage(
      ethers.getBytes(attestation.resultHash),
      signature
    );
    if (recovered.toLowerCase() !== agent.toLowerCase()) {
      throw new Error('signer mismatch');
    }
    return signature;
  } catch {
    throw new SubmissionInputError(
      'Content signature must be an EIP-191 signature of resultHash bytes by the managed wallet'
    );
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

  const attestation = parseContentAttestation(
    signature,
    signedPayload,
    resolvedHash
  );
  let verifiedSignature: string | undefined;
  if (attestation.kind === 'signed') {
    verifiedSignature = verifyContentAttestation(attestation, wallet.address);
    if (
      digest !== undefined &&
      (typeof digest !== 'string' ||
        digest.toLowerCase() !== resolvedHash.toLowerCase())
    ) {
      throw new SubmissionInputError(
        'An attested digest must match the submitted resultHash'
      );
    }
  }

  // Validate and detach caller evidence before any transaction. Otherwise a
  // malformed/oversized record could be rejected only after a confirmed submit.
  let deliverableInput: DeliverableInput;
  try {
    deliverableInput = validateDeliverableInput({
      jobId,
      agent: wallet.address,
      success: success !== false,
      resultUri: resultUri || resolvedResultRef || undefined,
      resultCid: resultCid || undefined,
      resultRef: resolvedResultRef || undefined,
      resultHash: resolvedHash,
      digest: verifiedSignature ? resolvedHash : digest,
      signature: verifiedSignature,
      proof: normaliseProof(proof),
      metadata,
      telemetry,
      telemetryCid,
      telemetryUri,
      contributors,
    });
  } catch (error) {
    if (error instanceof DeliverableInputError) {
      throw new SubmissionInputError(error.message);
    }
    throw error;
  }
  assertDeliverableStorageReady();

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
      signature: verifiedSignature,
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
    ...deliverableInput,
    submittedAt,
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
