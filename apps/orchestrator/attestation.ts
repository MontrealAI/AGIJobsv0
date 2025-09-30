import {
  ReceiptAttester,
  ReceiptStage,
  loadReceiptAttesterFromEnv,
} from '../../attestation/eas';

let cachedAttester: ReceiptAttester | null | undefined;

function resolveAttester(): ReceiptAttester | null {
  if (cachedAttester !== undefined) {
    return cachedAttester;
  }
  cachedAttester = loadReceiptAttesterFromEnv();
  return cachedAttester;
}

export function setReceiptAttester(attester: ReceiptAttester | null): void {
  cachedAttester = attester;
}

export interface ReceiptAttestationExtras {
  cid?: string | null;
  uri?: string | null;
  context?: Record<string, unknown>;
  recipient?: string;
}

export interface ReceiptDecorationOutcome {
  metadata: Record<string, unknown>;
  digest: string;
  attestationUid?: string;
  attestationTxHash?: string;
  attestationCid?: string | null;
  attestationUri?: string | null;
}

export async function decorateReceipt(
  stage: ReceiptStage,
  base: Record<string, unknown>,
  extras: ReceiptAttestationExtras = {}
): Promise<ReceiptDecorationOutcome> {
  const digest = ReceiptAttester.computeDigest(base);
  const attester = resolveAttester();
  if (!attester) {
    return { metadata: { ...base, receiptDigest: digest }, digest };
  }

  try {
    const attestation = await attester.attest({
      stage,
      payload: base,
      cid: extras.cid ?? undefined,
      uri: extras.uri ?? undefined,
      context: extras.context,
      recipient: extras.recipient,
    });
    return {
      metadata: {
        ...base,
        receiptDigest: digest,
        receiptAttestationUid: attestation.uid,
        receiptAttestationTxHash: attestation.txHash || undefined,
        receiptAttestationCid: attestation.cid ?? extras.cid ?? null,
        receiptAttestationUri: attestation.uri ?? extras.uri ?? null,
      },
      digest,
      attestationUid: attestation.uid,
      attestationTxHash: attestation.txHash || undefined,
      attestationCid: attestation.cid ?? null,
      attestationUri: attestation.uri ?? null,
    };
  } catch (error) {
    console.warn('Receipt attestation failed', error);
    return { metadata: { ...base, receiptDigest: digest }, digest };
  }
}

export async function verifyReceiptAttestation(
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
    console.warn('Receipt attestation verification failed', error);
    return false;
  }
}
