import { keccak256 } from "ethers";
import { bls12_381 as bls } from "@noble/curves/bls12-381";

export interface JobResult {
  readonly jobId: string;
  readonly verdict: "success" | "failed";
  readonly commitment: string;
}

export interface ZkBatchProof {
  readonly batchId: string;
  readonly batchSize: number;
  readonly digest: string;
  readonly signature: string;
  readonly publicKey: string;
}

export function digestJobResults(results: readonly JobResult[]): string {
  const preimage = results
    .map((job) => `${job.jobId}:${job.verdict}:${job.commitment}`)
    .join("|");
  return keccak256(Buffer.from(preimage, "utf8"));
}

export class ZkBatchAggregator {
  private readonly privateKey: bigint;
  private readonly publicKey: Uint8Array;
  readonly publicKeyHex: string;

  constructor(privateKeyHex?: string) {
    this.privateKey = privateKeyHex
      ? BigInt(`0x${privateKeyHex.replace(/^0x/, "")}`)
      : bls.utils.randomPrivateKey();
    this.publicKey = bls.getPublicKey(this.privateKey);
    this.publicKeyHex = `0x${Buffer.from(this.publicKey).toString("hex")}`;
  }

  createProof(batchId: string, results: readonly JobResult[]): ZkBatchProof {
    if (results.length === 0) {
      throw new Error("Cannot create proof for empty batch");
    }
    const digest = digestJobResults(results);
    const signature = bls.sign(
      Buffer.from(digest.slice(2), "hex"),
      this.privateKey
    );
    return {
      batchId,
      batchSize: results.length,
      digest,
      signature: `0x${Buffer.from(signature).toString("hex")}`,
      publicKey: this.publicKeyHex,
    };
  }

  static verify(proof: ZkBatchProof, results: readonly JobResult[]): boolean {
    if (proof.batchSize !== results.length) {
      return false;
    }
    const digest = digestJobResults(results);
    if (digest.toLowerCase() !== proof.digest.toLowerCase()) {
      return false;
    }
    const publicKeyBytes = Buffer.from(proof.publicKey.slice(2), "hex");
    const signatureBytes = Buffer.from(proof.signature.slice(2), "hex");
    return bls.verify(
      signatureBytes,
      Buffer.from(proof.digest.slice(2), "hex"),
      publicKeyBytes
    );
  }
}
