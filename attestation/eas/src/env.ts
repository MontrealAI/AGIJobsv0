import fs from "node:fs";
import path from "node:path";
import { ReceiptAttester, createAwsReceiptAttester } from "./attester";

export interface ReceiptAttestationSettings {
  easAddress: string;
  schemaUid: string;
  defaultRecipient?: string;
  kmsKeyId?: string;
  kmsRegion?: string;
  kmsEndpoint?: string;
  rpcUrl?: string;
  schemaRegistryAddress?: string;
}

export interface LoadSettingsOptions {
  configPath?: string;
  prefix?: string;
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enabled"].includes(normalized);
}

function readConfigFile(configPath: string | undefined): Partial<ReceiptAttestationSettings> {
  if (!configPath) {
    return {};
  }
  try {
    const contents = fs.readFileSync(configPath, "utf8");
    if (!contents) {
      return {};
    }
    const parsed = JSON.parse(contents) as Partial<ReceiptAttestationSettings> & {
      receiptSchemaUid?: string;
    };
    if (parsed.receiptSchemaUid && !parsed.schemaUid) {
      parsed.schemaUid = parsed.receiptSchemaUid;
    }
    return parsed;
  } catch (error) {
    console.warn(`Failed to read attestation config ${configPath}`, error);
    return {};
  }
}

export function loadReceiptAttestationSettings(
  options: LoadSettingsOptions = {}
): ReceiptAttestationSettings | null {
  const prefix = (options.prefix ?? "RECEIPT_ATTESTATION").toUpperCase();
  const configPath = options.configPath ?? path.resolve(process.cwd(), "config", "attestation.eas.json");
  const fileSettings = readConfigFile(fs.existsSync(configPath) ? configPath : undefined);

  if (parseBoolean(process.env[`${prefix}_DISABLE`])) {
    return null;
  }

  const pick = (key: keyof ReceiptAttestationSettings, envSuffix: string): string | undefined => {
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

  const settings: ReceiptAttestationSettings = {
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

export interface LoadAttesterOptions extends LoadSettingsOptions {}

export function loadReceiptAttesterFromEnv(options: LoadAttesterOptions = {}): ReceiptAttester | null {
  const settings = loadReceiptAttestationSettings(options);
  if (!settings) {
    return null;
  }
  if (!settings.kmsKeyId) {
    console.warn("Receipt attestation KMS key is not configured; attester disabled");
    return null;
  }
  return createAwsReceiptAttester({
    easAddress: settings.easAddress,
    schemaUid: settings.schemaUid,
    kmsKeyId: settings.kmsKeyId,
    kmsRegion: settings.kmsRegion,
    kmsEndpoint: settings.kmsEndpoint,
    rpcUrl: settings.rpcUrl,
    defaultRecipient: settings.defaultRecipient,
  });
}
