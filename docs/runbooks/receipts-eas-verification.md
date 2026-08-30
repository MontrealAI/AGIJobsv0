# Receipts & EAS Verification Guide

This document explains how to retrieve sponsorship receipts and verify their associated attestations.

## Retrieve receipts
1. Access the Operator Console and open **Receipts**.
2. Filter by User Operation hash, wallet address, or time range.
3. Click the receipt row to open the detail drawer.
4. Download the receipt JSON or view inline. The payload includes:
   - `userOpHash`
   - `sponsor`
   - `paymasterStake`
   - `attestationUID`
   - `ipfsCid`

## Verify IPFS content
1. Click **Open in IPFS Gateway**. The console requests the configured gateway using the pinned CID.
2. The response is hashed client-side to ensure integrity.
3. If verification fails, the console displays the mismatch and provides a retry link.

## Verify EAS attestation
1. Click **Verify attestation** in the drawer.
2. The console queries the EAS RPC for the provided `attestationUID`.
3. Validation passes when:
   - `schema` equals the configured `global.eas.schemaUid`.
   - The attestation is not revoked or expired.
   - The `recipient` matches the smart account on the receipt.
4. On success, the UI displays a green badge and allows exporting a signed PDF certificate.

## Manual verification (fallback)
If the console is unavailable:
1. Use https://easscan.org and paste the attestation UID.
2. Ensure the schema matches the value in `deploy/helm/values.yaml`.
3. Download the IPFS payload from the `ipfsCid` using an IPFS gateway (e.g., https://ipfs.io/ipfs/).
4. Compare the JSON `checksum` against the attestation `data` field.

## Troubleshooting
- **CID not found**: Check IPFS pod logs for pin backlog alerts.
- **Schema mismatch**: Confirm the attester deployment is using the latest config map.
- **Revoked attestation**: escalate to security per the incident response guide.
