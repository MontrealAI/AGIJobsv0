import { ReceiptAttester } from "./attester";
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
export declare function loadReceiptAttestationSettings(options?: LoadSettingsOptions): ReceiptAttestationSettings | null;
export interface LoadAttesterOptions extends LoadSettingsOptions {
}
export declare function loadReceiptAttesterFromEnv(options?: LoadAttesterOptions): ReceiptAttester | null;
