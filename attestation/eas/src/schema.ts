import { SchemaRegistry, ZERO_ADDRESS } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";

export const RECEIPT_SCHEMA_DEFINITION = "string stage,bytes32 digest,string cid,string uri,string context";

export interface PublishReceiptSchemaOptions {
  registryAddress: string;
  signer: ethers.Signer;
  resolverAddress?: string;
  revocable?: boolean;
}

export async function publishReceiptSchema(options: PublishReceiptSchemaOptions): Promise<string> {
  const registry = new SchemaRegistry(options.registryAddress).connect(options.signer);
  const tx = await registry.register({
    schema: RECEIPT_SCHEMA_DEFINITION,
    resolverAddress: options.resolverAddress ?? ZERO_ADDRESS,
    revocable: options.revocable ?? false,
  });
  return tx.wait();
}
