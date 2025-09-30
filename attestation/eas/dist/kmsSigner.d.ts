import { KMSClient } from "@aws-sdk/client-kms";
import { AbstractSigner, Provider, TransactionRequest, TypedDataDomain, TypedDataField } from "ethers";
export interface AwsKMSSignerConfig {
    keyId: string;
    client?: KMSClient;
    region?: string;
    endpoint?: string;
    provider?: Provider;
}
export declare class AwsKMSSigner extends AbstractSigner {
    private readonly client;
    private readonly keyId;
    private cachedAddress?;
    private cachedPublicKey?;
    constructor(options: AwsKMSSignerConfig);
    connect(provider: Provider): AwsKMSSigner;
    private loadPublicKey;
    getAddress(): Promise<string>;
    private signDigest;
    signMessage(message: string | Uint8Array): Promise<string>;
    signTransaction(transaction: TransactionRequest): Promise<string>;
    signTypedData(domain: TypedDataDomain, types: Record<string, TypedDataField[]>, value: Record<string, unknown>): Promise<string>;
}
