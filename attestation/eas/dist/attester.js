"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiptAttester = void 0;
exports.createAwsReceiptAttester = createAwsReceiptAttester;
const eas_sdk_1 = require("@ethereum-attestation-service/eas-sdk");
const ethers_1 = require("ethers");
const kmsSigner_1 = require("./kmsSigner");
const utils_1 = require("./utils");
function toBigInt(value, fallback) {
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
class ReceiptAttester {
    constructor(config) {
        this.encoder = new eas_sdk_1.SchemaEncoder("string stage,bytes32 digest,string cid,string uri,string context");
        if (!config.schemaUid) {
            throw new Error("Receipt attestation schema UID is required");
        }
        this.schemaUid = config.schemaUid;
        this.signer = config.signer;
        this.defaultRecipient = config.defaultRecipient;
        this.eas = new eas_sdk_1.EAS(config.easAddress, { signer: config.signer }).connect(config.signer);
    }
    static computeDigest(payload) {
        return (0, utils_1.computeReceiptDigest)(payload);
    }
    static canonicalize(payload) {
        return (0, utils_1.canonicalizeToJson)(payload);
    }
    async attest(request) {
        const digest = ReceiptAttester.computeDigest(request.payload);
        const payloadContext = (0, utils_1.normalizeContext)(request.context);
        const data = this.encoder.encodeData([
            { name: "stage", type: "string", value: request.stage },
            { name: "digest", type: "bytes32", value: digest },
            { name: "cid", type: "string", value: request.cid ?? "" },
            { name: "uri", type: "string", value: request.uri ?? "" },
            { name: "context", type: "string", value: payloadContext ?? "" },
        ]);
        const recipient = request.recipient ?? this.defaultRecipient ?? eas_sdk_1.ZERO_ADDRESS;
        const expiration = toBigInt(request.expirationTime, eas_sdk_1.NO_EXPIRATION);
        const value = toBigInt(request.value, 0n);
        const tx = await this.eas.attest({
            schema: this.schemaUid,
            data: {
                recipient,
                data,
                expirationTime: expiration,
                revocable: false,
                refUID: request.refUid ?? eas_sdk_1.ZERO_BYTES32,
                value,
            },
        });
        const uid = await tx.wait();
        const txHash = tx.data.hash ?? "";
        return {
            uid,
            digest,
            txHash,
            cid: request.cid ?? undefined,
            uri: request.uri ?? undefined,
        };
    }
    async fetch(uid) {
        const attestation = await this.eas.getAttestation(uid);
        if (!attestation) {
            throw new Error(`Attestation ${uid} not found`);
        }
        if (attestation.schema.toLowerCase() !== this.schemaUid.toLowerCase()) {
            throw new Error(`Attestation ${uid} does not match receipt schema`);
        }
        const decoded = this.encoder.decodeData(attestation.data);
        const lookup = new Map();
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
    async verify(uid, expectedDigest, expectedCid) {
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
exports.ReceiptAttester = ReceiptAttester;
function createAwsReceiptAttester(config) {
    const provider = new ethers_1.ethers.JsonRpcProvider(config.rpcUrl ?? process.env.RPC_URL);
    const signer = new kmsSigner_1.AwsKMSSigner({
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
