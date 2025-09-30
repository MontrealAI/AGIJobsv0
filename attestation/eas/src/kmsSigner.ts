import { GetPublicKeyCommand, KMSClient, SignCommand } from "@aws-sdk/client-kms";
import { Buffer } from "node:buffer";
import type { TransactionLike } from "ethers";
import {
  AbstractSigner,
  Provider,
  TransactionRequest,
  TypedDataDomain,
  TypedDataField,
  TypedDataEncoder,
  ethers,
} from "ethers";

const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const SECP256K1_N_HALF = SECP256K1_N / 2n;

function parseLength(bytes: Uint8Array, offset: number): { length: number; offset: number } {
  let length = bytes[offset++];
  if ((length & 0x80) === 0) {
    return { length, offset };
  }
  const byteLength = length & 0x7f;
  if (byteLength === 0 || byteLength > 4) {
    throw new Error("Invalid DER length encoding");
  }
  length = 0;
  for (let i = 0; i < byteLength; i += 1) {
    length = (length << 8) | bytes[offset++];
  }
  return { length, offset };
}

function parseDerSignature(signature: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  if (signature.length < 8 || signature[0] !== 0x30) {
    throw new Error("Invalid DER signature");
  }
  let offset = 1;
  ({ offset } = parseLength(signature, offset));
  if (signature[offset++] !== 0x02) {
    throw new Error("Invalid DER signature (missing r)");
  }
  const rInfo = parseLength(signature, offset);
  offset = rInfo.offset;
  const r = signature.slice(offset, offset + rInfo.length);
  offset += rInfo.length;
  if (signature[offset++] !== 0x02) {
    throw new Error("Invalid DER signature (missing s)");
  }
  const sInfo = parseLength(signature, offset);
  offset = sInfo.offset;
  const s = signature.slice(offset, offset + sInfo.length);
  return { r, s };
}

function padScalar(bytes: Uint8Array): Uint8Array {
  const trimmed = bytes[0] === 0x00 ? bytes.slice(1) : bytes;
  if (trimmed.length > 32) {
    throw new Error("Scalar length exceeds 32 bytes");
  }
  if (trimmed.length === 32) {
    return trimmed;
  }
  const padded = new Uint8Array(32);
  padded.set(trimmed, 32 - trimmed.length);
  return padded;
}

function extractUncompressedKey(spki: Uint8Array): Uint8Array {
  const marker = Buffer.from([0x03, 0x42, 0x00]);
  const idx = Buffer.from(spki).indexOf(marker);
  if (idx === -1) {
    throw new Error("Unexpected public key format from KMS");
  }
  const key = spki.slice(idx + marker.length, idx + marker.length + 65);
  if (key.length !== 65 || key[0] !== 0x04) {
    throw new Error("Unsupported KMS public key encoding");
  }
  return key;
}

export interface AwsKMSSignerConfig {
  keyId: string;
  client?: KMSClient;
  region?: string;
  endpoint?: string;
  provider?: Provider;
}

export class AwsKMSSigner extends AbstractSigner {
  private readonly client: KMSClient;

  private readonly keyId: string;

  private cachedAddress?: Promise<string>;

  private cachedPublicKey?: Promise<Uint8Array>;

  constructor(options: AwsKMSSignerConfig) {
    super(options.provider);
    this.keyId = options.keyId;
    if (options.client) {
      this.client = options.client;
    } else {
      if (!options.region) {
        throw new Error("KMS region must be provided when client is omitted");
      }
      this.client = new KMSClient({ region: options.region, endpoint: options.endpoint });
    }
  }

  connect(provider: Provider): AwsKMSSigner {
    return new AwsKMSSigner({
      keyId: this.keyId,
      client: this.client,
      provider,
    });
  }

  private async loadPublicKey(): Promise<Uint8Array> {
    if (!this.cachedPublicKey) {
      this.cachedPublicKey = (async () => {
        const response = await this.client.send(new GetPublicKeyCommand({ KeyId: this.keyId }));
        if (!response.PublicKey) {
          throw new Error("KMS public key response missing PublicKey");
        }
        return extractUncompressedKey(new Uint8Array(response.PublicKey));
      })();
    }
    return this.cachedPublicKey;
  }

  async getAddress(): Promise<string> {
    if (!this.cachedAddress) {
      this.cachedAddress = (async () => {
        const key = await this.loadPublicKey();
        return ethers.computeAddress(ethers.hexlify(key));
      })();
    }
    return this.cachedAddress;
  }

  private async signDigest(digest: string): Promise<ethers.Signature> {
    const bytes = ethers.getBytes(digest);
    if (bytes.length !== 32) {
      throw new Error("Digest must be 32 bytes for KMS signing");
    }
    const response = await this.client.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: bytes,
        MessageType: "DIGEST",
        SigningAlgorithm: "ECDSA_SHA_256",
      })
    );
    if (!response.Signature) {
      throw new Error("KMS signature response missing Signature");
    }
    const { r, s } = parseDerSignature(new Uint8Array(response.Signature));
    let sValue = BigInt(ethers.hexlify(padScalar(s)));
    let flipped = false;
    if (sValue > SECP256K1_N_HALF) {
      sValue = SECP256K1_N - sValue;
      flipped = true;
    }
    const rHex = ethers.hexlify(padScalar(r));
    const sHex = ethers.toBeHex(sValue, 32);
    const address = (await this.getAddress()).toLowerCase();
    let recoveryParam: number | null = null;
    for (let candidate = 0; candidate < 2; candidate += 1) {
      const adjusted = flipped ? candidate ^ 1 : candidate;
      const recovered = ethers.SigningKey.recoverPublicKey(
        digest,
        ethers.Signature.from({ r: rHex, s: sHex, v: 27 + adjusted })
      );
      if (ethers.computeAddress(recovered).toLowerCase() === address) {
        recoveryParam = adjusted;
        break;
      }
    }
    if (recoveryParam === null) {
      throw new Error("Failed to derive recovery parameter for KMS signature");
    }
    return ethers.Signature.from({ r: rHex, s: sHex, v: 27 + recoveryParam });
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const digest = ethers.hashMessage(message);
    const signature = await this.signDigest(digest);
    return signature.serialized;
  }

  async signTransaction(transaction: TransactionRequest): Promise<string> {
    const populated = await ethers.resolveProperties(transaction);
    const to = populated.to ? await ethers.resolveAddress(populated.to) : undefined;
    const from = populated.from ? await ethers.resolveAddress(populated.from) : undefined;
    const txData = { ...populated, to, from } as TransactionLike<string>;
    const tx = ethers.Transaction.from(txData);
    if (!tx.unsignedHash) {
      throw new Error("Unable to compute unsigned transaction hash");
    }
    const signature = await this.signDigest(tx.unsignedHash);
    tx.signature = signature;
    return tx.serialized;
  }

  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    const digest = TypedDataEncoder.hash(domain, types, value);
    const signature = await this.signDigest(digest);
    return signature.serialized;
  }
}
