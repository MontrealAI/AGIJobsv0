# Receipts & EAS Verification Guide

This guide shows auditors how to validate sponsored operation receipts and EAS attestations.

## 1. Locate the Receipt Bundle

1. Open the Operator Portal and navigate to **Receipts**.
2. Search by wallet address or attestation UID.
3. Download the bundle (ZIP) which contains:
   - `receipt.json` – metadata and transaction hash.
   - `eas.json` – attestation payload.
   - `ipfs.cid` – root CID for attachments.

## 2. Verify On-Chain Transaction

1. Use the embedded link to open the transaction on a block explorer.
2. Confirm the paymaster address matches the configured contract in `global.contracts.paymaster`.
3. Ensure the `sponsorUserOperation` event includes the expected session identifier.

## 3. Validate Attestation

1. Copy the `schemaUID` from `eas.json`.
2. Visit the EAS explorer and search by UID.
3. Confirm the schema matches the documented `global.contracts.eas.schemaUID`.
4. Verify the attester address equals the Attester service’s KMS-backed signer.

## 4. Rehydrate IPFS Assets

1. Use `ipfs cid get <CID>` via the managed gateway URL from the portal.
2. Confirm file hashes match those in `receipt.json`.
3. Retain the downloaded evidence for 7 years per compliance policy.

## 5. Offline Verification (Optional)

1. Run the `tools/verify_receipt.ts` script with the downloaded bundle.
2. The script checks:
   - Merkle proofs for the receipt bundle.
   - Attestation signature validity.
   - Subgraph confirmation that the attestation is indexed.
3. Record the success output in the compliance log.
