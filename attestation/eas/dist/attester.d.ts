import { ethers } from "ethers";
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
export declare class ReceiptAttester {
    private readonly eas;
    private readonly schemaUid;
    private readonly signer;
    private readonly defaultRecipient?;
    private readonly encoder;
    constructor(config: ReceiptAttesterConfig);
    static computeDigest(payload: unknown): string;
    static canonicalize(payload: unknown): string;
    attest(request: ReceiptAttestationRequest): Promise<ReceiptAttestationResult>;
    fetch(uid: string): Promise<ReceiptAttestationMetadata>;
    verify(uid: string, expectedDigest: string, expectedCid?: string | null): Promise<boolean>;
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
export declare function createAwsReceiptAttester(config: AwsReceiptAttesterConfig): ReceiptAttester;
