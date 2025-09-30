import {
  ReceiptAttester,
  ReceiptAttestationResult,
  loadReceiptAttesterFromEnv,
} from '../attestation/eas';

let cachedAttester: ReceiptAttester | null | undefined;

function getAttester(): ReceiptAttester | null {
  if (cachedAttester !== undefined) {
    return cachedAttester;
  }
  cachedAttester = loadReceiptAttesterFromEnv();
  return cachedAttester;
}

export function setReceiptAttester(attester: ReceiptAttester | null): void {
  cachedAttester = attester;
}

export interface ExecutionReceiptExtras {
  cid?: string | null;
  uri?: string | null;
  context?: Record<string, unknown>;
}

export interface ExecutionAttestationOutcome {
  digest: string;
  attestation?: ReceiptAttestationResult;
}

export async function attestExecutionReceipt(
  payload: Record<string, unknown>,
  extras: ExecutionReceiptExtras = {}
): Promise<ExecutionAttestationOutcome> {
  const digest = ReceiptAttester.computeDigest(payload);
  const attester = getAttester();
  if (!attester) {
    return { digest };
  }
  try {
    const attestation = await attester.attest({
      stage: 'EXECUTION',
      payload,
      cid: extras.cid ?? undefined,
      uri: extras.uri ?? undefined,
      context: extras.context,
    });
    return { digest, attestation };
  } catch (error) {
    console.warn('Execution receipt attestation failed', error);
    return { digest };
  }
}
