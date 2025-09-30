import {
  ReceiptAttester,
  ReceiptStage,
  ReceiptAttestationSettings,
  loadReceiptAttesterFromEnv,
  loadReceiptAttestationSettings,
} from "@agi/receipt-attestation";

let cachedAttester: ReceiptAttester | null | undefined;

function resolveAttester(): ReceiptAttester | null {
  if (cachedAttester !== undefined) {
    return cachedAttester;
  }
  cachedAttester = loadReceiptAttesterFromEnv({});
  return cachedAttester;
}

export function setReceiptAttester(attester: ReceiptAttester | null): void {
  cachedAttester = attester;
}

export function getReceiptAttester(): ReceiptAttester | null {
  return resolveAttester();
}

export interface AttestationExtras {
  cid?: string | null;
  uri?: string | null;
  context?: Record<string, unknown>;
  recipient?: string;
}

export interface AttestationMetadataFields {
  receiptDigest: string;
  receiptAttestationUid?: string;
  receiptAttestationTxHash?: string;
  receiptAttestationCid?: string | null;
  receiptAttestationUri?: string | null;
}

export function computeReceiptDigest(payload: unknown): string {
  return ReceiptAttester.computeDigest(payload);
}

export async function decorateWithAttestation(
  stage: ReceiptStage,
  baseMetadata: Record<string, unknown>,
  extras: AttestationExtras = {}
): Promise<Record<string, unknown> & AttestationMetadataFields> {
  const digest = computeReceiptDigest(baseMetadata);
  const attester = resolveAttester();
  if (!attester) {
    return {
      ...baseMetadata,
      receiptDigest: digest,
    };
  }

  try {
    const attestation = await attester.attest({
      stage,
      payload: baseMetadata,
      cid: extras.cid ?? undefined,
      uri: extras.uri ?? undefined,
      context: extras.context,
      recipient: extras.recipient,
    });

    return {
      ...baseMetadata,
      receiptDigest: digest,
      receiptAttestationUid: attestation.uid,
      receiptAttestationTxHash: attestation.txHash || undefined,
      receiptAttestationCid: attestation.cid ?? extras.cid ?? null,
      receiptAttestationUri: attestation.uri ?? extras.uri ?? null,
    };
  } catch (error) {
    console.warn("Receipt attestation failed", error);
    return {
      ...baseMetadata,
      receiptDigest: digest,
    };
  }
}

export async function verifyRecordedAttestation(
  uid: string,
  expectedDigest: string,
  expectedCid?: string | null
): Promise<boolean> {
  const attester = resolveAttester();
  if (!attester) {
    return false;
  }
  try {
    return await attester.verify(uid, expectedDigest, expectedCid ?? undefined);
  } catch (error) {
    console.warn("Receipt attestation verification failed", error);
    return false;
  }
}

export function getReceiptAttestationConfig(): ReceiptAttestationSettings | null {
  return loadReceiptAttestationSettings();
}

export type { ReceiptAttester, ReceiptStage, ReceiptAttestationSettings };
