import { EAS, SchemaEncoder, NO_EXPIRATION, ZERO_ADDRESS, ZERO_BYTES32 } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";
import { AwsKMSSigner } from "./kmsSigner";
import {
  canonicalizeToJson,
  computeReceiptDigest,
  normalizeContext,
} from "./utils";

export type ReceiptStage = "PLAN" | "SIMULATION" | "EXECUTION";

export interface ReceiptAttesterConfig {
  easAddress: string;
  schemaUid: string;
  signer: ethers.Signer;
  defaultRecipient?: string;
}

export interface ReceiptAttestationRequest {
  stage: ReceiptStage;
  payload: unknown;
  cid?: string | null;
  uri?: string | null;
  context?: Record<string, unknown>;
  recipient?: string;
  refUid?: string;
  expirationTime?: bigint | number;
  value?: bigint | number;
}

export interface ReceiptAttestationResult {
  uid: string;
  digest: string;
  txHash: string;
  cid?: string;
  uri?: string;
}

export interface ReceiptAttestationMetadata {
  stage: ReceiptStage;
  digest: string;
  cid?: string;
  uri?: string;
  context?: string;
}

function toBigInt(value: bigint | number | undefined, fallback: bigint): bigint {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "bigint") {
    return value;
  }
  if (!Number.isFinite(value)) {
    throw new Error("Expiration or value must be finite");
  }
  return BigInt(Math.trunc(value));
}

export class ReceiptAttester {
  private readonly eas: EAS;

  private readonly schemaUid: string;

  private readonly signer: ethers.Signer;

  private readonly defaultRecipient?: string;

  private readonly encoder = new SchemaEncoder(
    "string stage,bytes32 digest,string cid,string uri,string context"
  );

  constructor(config: ReceiptAttesterConfig) {
    if (!config.schemaUid) {
      throw new Error("Receipt attestation schema UID is required");
    }
    this.schemaUid = config.schemaUid;
    this.signer = config.signer;
    this.defaultRecipient = config.defaultRecipient;
    this.eas = new EAS(config.easAddress, { signer: config.signer }).connect(config.signer);
  }

  static computeDigest(payload: unknown): string {
    return computeReceiptDigest(payload);
  }

  static canonicalize(payload: unknown): string {
    return canonicalizeToJson(payload);
  }

  async attest(request: ReceiptAttestationRequest): Promise<ReceiptAttestationResult> {
    const digest = ReceiptAttester.computeDigest(request.payload);
    const payloadContext = normalizeContext(request.context);
    const data = this.encoder.encodeData([
      { name: "stage", type: "string", value: request.stage },
      { name: "digest", type: "bytes32", value: digest },
      { name: "cid", type: "string", value: request.cid ?? "" },
      { name: "uri", type: "string", value: request.uri ?? "" },
      { name: "context", type: "string", value: payloadContext ?? "" },
    ]);
    const recipient = request.recipient ?? this.defaultRecipient ?? ZERO_ADDRESS;
    const expiration = toBigInt(request.expirationTime, NO_EXPIRATION);
    const value = toBigInt(request.value, 0n);
    const tx = await this.eas.attest({
      schema: this.schemaUid,
      data: {
        recipient,
        data,
        expirationTime: expiration,
        revocable: false,
        refUID: request.refUid ?? ZERO_BYTES32,
        value,
      },
    });
    const uid = await tx.wait();
    const txHash = (tx.data as { hash?: string }).hash ?? "";
    return {
      uid,
      digest,
      txHash,
      cid: request.cid ?? undefined,
      uri: request.uri ?? undefined,
    };
  }

  async fetch(uid: string): Promise<ReceiptAttestationMetadata> {
    const attestation = await this.eas.getAttestation(uid);
    if (!attestation) {
      throw new Error(`Attestation ${uid} not found`);
    }
    if (attestation.schema.toLowerCase() !== this.schemaUid.toLowerCase()) {
      throw new Error(`Attestation ${uid} does not match receipt schema`);
    }
    const decoded = this.encoder.decodeData(attestation.data);
    const lookup = new Map<string, string>();
    for (const item of decoded) {
      const value = String(item.value.value ?? "");
      lookup.set(item.name, value);
    }
    const stageValue = lookup.get("stage");
    if (stageValue !== "PLAN" && stageValue !== "SIMULATION" && stageValue !== "EXECUTION") {
      throw new Error(`Unexpected stage value ${stageValue ?? "<missing>"}`);
    }
    return {
      stage: stageValue,
      digest: lookup.get("digest") ?? "",
      cid: lookup.get("cid") || undefined,
      uri: lookup.get("uri") || undefined,
      context: lookup.get("context") || undefined,
    };
  }

  async verify(
    uid: string,
    expectedDigest: string,
    expectedCid?: string | null
  ): Promise<boolean> {
    const metadata = await this.fetch(uid);
    if (metadata.digest.toLowerCase() !== expectedDigest.toLowerCase()) {
      return false;
    }
    if (expectedCid) {
      const normalizedCid = expectedCid.trim();
      if (normalizedCid && (metadata.cid ?? "").trim() !== normalizedCid) {
        return false;
      }
    }
    return true;
  }
}

export interface AwsReceiptAttesterConfig {
  easAddress: string;
  schemaUid: string;
  kmsKeyId: string;
  kmsRegion?: string;
  kmsEndpoint?: string;
  rpcUrl?: string;
  defaultRecipient?: string;
}

export function createAwsReceiptAttester(config: AwsReceiptAttesterConfig): ReceiptAttester {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl ?? process.env.RPC_URL);
  const signer = new AwsKMSSigner({
    keyId: config.kmsKeyId,
    region: config.kmsRegion,
    endpoint: config.kmsEndpoint,
    provider,
  });
  return new ReceiptAttester({
    easAddress: config.easAddress,
    schemaUid: config.schemaUid,
    signer,
    defaultRecipient: config.defaultRecipient,
  });
}
