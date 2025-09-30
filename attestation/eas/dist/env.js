"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadReceiptAttestationSettings = loadReceiptAttestationSettings;
exports.loadReceiptAttesterFromEnv = loadReceiptAttesterFromEnv;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const attester_1 = require("./attester");
function parseBoolean(value) {
    if (!value) {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y", "on", "enabled"].includes(normalized);
}
function readConfigFile(configPath) {
    if (!configPath) {
        return {};
    }
    try {
        const contents = node_fs_1.default.readFileSync(configPath, "utf8");
        if (!contents) {
            return {};
        }
        const parsed = JSON.parse(contents);
        if (parsed.receiptSchemaUid && !parsed.schemaUid) {
            parsed.schemaUid = parsed.receiptSchemaUid;
        }
        return parsed;
    }
    catch (error) {
        console.warn(`Failed to read attestation config ${configPath}`, error);
        return {};
    }
}
function loadReceiptAttestationSettings(options = {}) {
    const prefix = (options.prefix ?? "RECEIPT_ATTESTATION").toUpperCase();
    const configPath = options.configPath ?? node_path_1.default.resolve(process.cwd(), "config", "attestation.eas.json");
    const fileSettings = readConfigFile(node_fs_1.default.existsSync(configPath) ? configPath : undefined);
    if (parseBoolean(process.env[`${prefix}_DISABLE`])) {
        return null;
    }
    const pick = (key, envSuffix) => {
        const envValue = process.env[`${prefix}_${envSuffix}`];
        if (envValue && envValue.trim()) {
            return envValue.trim();
        }
        const fileValue = fileSettings[key];
        if (typeof fileValue === "string" && fileValue.trim()) {
            return fileValue.trim();
        }
        return undefined;
    };
    const settings = {
        easAddress: pick("easAddress", "EAS_ADDRESS") ?? "",
        schemaUid: pick("schemaUid", "SCHEMA_UID") ?? "",
        defaultRecipient: pick("defaultRecipient", "DEFAULT_RECIPIENT"),
        kmsKeyId: pick("kmsKeyId", "KMS_KEY_ID"),
        kmsRegion: pick("kmsRegion", "KMS_REGION"),
        kmsEndpoint: pick("kmsEndpoint", "KMS_ENDPOINT"),
        rpcUrl: pick("rpcUrl", "RPC_URL"),
        schemaRegistryAddress: pick("schemaRegistryAddress", "SCHEMA_REGISTRY_ADDRESS"),
    };
    if (!settings.easAddress || !settings.schemaUid) {
        return null;
    }
    return settings;
}
function loadReceiptAttesterFromEnv(options = {}) {
    const settings = loadReceiptAttestationSettings(options);
    if (!settings) {
        return null;
    }
    if (!settings.kmsKeyId) {
        console.warn("Receipt attestation KMS key is not configured; attester disabled");
        return null;
    }
    return (0, attester_1.createAwsReceiptAttester)({
        easAddress: settings.easAddress,
        schemaUid: settings.schemaUid,
        kmsKeyId: settings.kmsKeyId,
        kmsRegion: settings.kmsRegion,
        kmsEndpoint: settings.kmsEndpoint,
        rpcUrl: settings.rpcUrl,
        defaultRecipient: settings.defaultRecipient,
    });
}
