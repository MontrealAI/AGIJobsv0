"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIPT_SCHEMA_DEFINITION = void 0;
exports.publishReceiptSchema = publishReceiptSchema;
const eas_sdk_1 = require("@ethereum-attestation-service/eas-sdk");
exports.RECEIPT_SCHEMA_DEFINITION = "string stage,bytes32 digest,string cid,string uri,string context";
async function publishReceiptSchema(options) {
    const registry = new eas_sdk_1.SchemaRegistry(options.registryAddress).connect(options.signer);
    const tx = await registry.register({
        schema: exports.RECEIPT_SCHEMA_DEFINITION,
        resolverAddress: options.resolverAddress ?? eas_sdk_1.ZERO_ADDRESS,
        revocable: options.revocable ?? false,
    });
    return tx.wait();
}
