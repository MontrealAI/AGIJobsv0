import { ethers } from "ethers";
export declare const RECEIPT_SCHEMA_DEFINITION = "string stage,bytes32 digest,string cid,string uri,string context";
export interface PublishReceiptSchemaOptions {
    registryAddress: string;
    signer: ethers.Signer;
    resolverAddress?: string;
    revocable?: boolean;
}
export declare function publishReceiptSchema(options: PublishReceiptSchemaOptions): Promise<string>;
