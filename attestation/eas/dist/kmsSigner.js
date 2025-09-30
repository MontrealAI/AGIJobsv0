"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsKMSSigner = void 0;
const client_kms_1 = require("@aws-sdk/client-kms");
const node_buffer_1 = require("node:buffer");
const ethers_1 = require("ethers");
const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const SECP256K1_N_HALF = SECP256K1_N / 2n;
function parseLength(bytes, offset) {
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
function parseDerSignature(signature) {
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
function padScalar(bytes) {
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
function extractUncompressedKey(spki) {
    const marker = node_buffer_1.Buffer.from([0x03, 0x42, 0x00]);
    const idx = node_buffer_1.Buffer.from(spki).indexOf(marker);
    if (idx === -1) {
        throw new Error("Unexpected public key format from KMS");
    }
    const key = spki.slice(idx + marker.length, idx + marker.length + 65);
    if (key.length !== 65 || key[0] !== 0x04) {
        throw new Error("Unsupported KMS public key encoding");
    }
    return key;
}
class AwsKMSSigner extends ethers_1.AbstractSigner {
    constructor(options) {
        super(options.provider);
        this.keyId = options.keyId;
        if (options.client) {
            this.client = options.client;
        }
        else {
            if (!options.region) {
                throw new Error("KMS region must be provided when client is omitted");
            }
            this.client = new client_kms_1.KMSClient({ region: options.region, endpoint: options.endpoint });
        }
    }
    connect(provider) {
        return new AwsKMSSigner({
            keyId: this.keyId,
            client: this.client,
            provider,
        });
    }
    async loadPublicKey() {
        if (!this.cachedPublicKey) {
            this.cachedPublicKey = (async () => {
                const response = await this.client.send(new client_kms_1.GetPublicKeyCommand({ KeyId: this.keyId }));
                if (!response.PublicKey) {
                    throw new Error("KMS public key response missing PublicKey");
                }
                return extractUncompressedKey(new Uint8Array(response.PublicKey));
            })();
        }
        return this.cachedPublicKey;
    }
    async getAddress() {
        if (!this.cachedAddress) {
            this.cachedAddress = (async () => {
                const key = await this.loadPublicKey();
                return ethers_1.ethers.computeAddress(ethers_1.ethers.hexlify(key));
            })();
        }
        return this.cachedAddress;
    }
    async signDigest(digest) {
        const bytes = ethers_1.ethers.getBytes(digest);
        if (bytes.length !== 32) {
            throw new Error("Digest must be 32 bytes for KMS signing");
        }
        const response = await this.client.send(new client_kms_1.SignCommand({
            KeyId: this.keyId,
            Message: bytes,
            MessageType: "DIGEST",
            SigningAlgorithm: "ECDSA_SHA_256",
        }));
        if (!response.Signature) {
            throw new Error("KMS signature response missing Signature");
        }
        const { r, s } = parseDerSignature(new Uint8Array(response.Signature));
        let sValue = BigInt(ethers_1.ethers.hexlify(padScalar(s)));
        let flipped = false;
        if (sValue > SECP256K1_N_HALF) {
            sValue = SECP256K1_N - sValue;
            flipped = true;
        }
        const rHex = ethers_1.ethers.hexlify(padScalar(r));
        const sHex = ethers_1.ethers.toBeHex(sValue, 32);
        const address = (await this.getAddress()).toLowerCase();
        let recoveryParam = null;
        for (let candidate = 0; candidate < 2; candidate += 1) {
            const adjusted = flipped ? candidate ^ 1 : candidate;
            const recovered = ethers_1.ethers.SigningKey.recoverPublicKey(digest, ethers_1.ethers.Signature.from({ r: rHex, s: sHex, v: 27 + adjusted }));
            if (ethers_1.ethers.computeAddress(recovered).toLowerCase() === address) {
                recoveryParam = adjusted;
                break;
            }
        }
        if (recoveryParam === null) {
            throw new Error("Failed to derive recovery parameter for KMS signature");
        }
        return ethers_1.ethers.Signature.from({ r: rHex, s: sHex, v: 27 + recoveryParam });
    }
    async signMessage(message) {
        const digest = ethers_1.ethers.hashMessage(message);
        const signature = await this.signDigest(digest);
        return signature.serialized;
    }
    async signTransaction(transaction) {
        const populated = await ethers_1.ethers.resolveProperties(transaction);
        const to = populated.to ? await ethers_1.ethers.resolveAddress(populated.to) : undefined;
        const from = populated.from ? await ethers_1.ethers.resolveAddress(populated.from) : undefined;
        const txData = { ...populated, to, from };
        const tx = ethers_1.ethers.Transaction.from(txData);
        if (!tx.unsignedHash) {
            throw new Error("Unable to compute unsigned transaction hash");
        }
        const signature = await this.signDigest(tx.unsignedHash);
        tx.signature = signature;
        return tx.serialized;
    }
    async signTypedData(domain, types, value) {
        const digest = ethers_1.TypedDataEncoder.hash(domain, types, value);
        const signature = await this.signDigest(digest);
        return signature.serialized;
    }
}
exports.AwsKMSSigner = AwsKMSSigner;
