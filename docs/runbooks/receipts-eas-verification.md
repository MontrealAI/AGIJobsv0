# Receipts & EAS Verification Guide

This guide helps auditors and integrators validate that attestation receipts emitted by the AGI stack correspond to on-chain EAS attestations.

## Retrieve a Receipt
1. Log into the Operator Control Plane (OCP).
2. Navigate to **Receipts** and locate the desired job.
3. Download the JSON payload via **Download Receipt**.

## Receipt Structure
```json
{
  "jobId": "uuid",
  "requestHash": "0x...",
  "attester": "0x...",
  "schemaUID": "0x...",
  "attestationUID": "0x...",
  "timestamp": 1700000000,
  "signature": "0x..."
}
```

## Verify the EAS Attestation
1. Open the EAS Explorer at `https://easscan.org/attestation/<attestationUID>`.
2. Confirm the attester matches the receipt and the schema UID equals `receipt.schemaUID`.
3. Ensure the attestation payload hash equals `receipt.requestHash`.

## Validate the Signature
1. Use the browser-based verifier at `https://docs.agistack.dev/tools/receipt-verify`.
2. Upload the JSON receipt.
3. The tool checks the signature against the configured attester public key and displays a green check.
4. Alternatively, use the CLI:
   ```bash
   npx @eas-project/verify --attestation <attestationUID>
   ```

## Troubleshooting
- **Mismatch attester** – Confirm the attestation originated from the correct network (see `receipt.chainId`).
- **Signature invalid** – Rotate the attester key using the KMS playbook and re-issue the attestation.
- **No attestation found** – Wait for the subgraph to catch up (monitor "Subgraph Lag" panel).

## Change Log
- v1.0 – Initial receipts verification workflow.
