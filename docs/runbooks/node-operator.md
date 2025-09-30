# Node Operator Runbook (Browser-Only)

This runbook documents the end-to-end operating procedures for an AGI stack node operator without requiring shell access.

## Prerequisites
- Access to the Operator Control Plane (OCP) at `https://operator.example.com`.
- Permissions to manage the AGI cluster namespace in Argo CD or Lens (view-only).
- Hardware security key for SSO and WebAuthn prompts.

## Daily Checklist
1. Log into the OCP dashboard and verify all service widgets are **green**.
2. Review the "Gas Balance" card. If the balance is below 0.1 ETH, follow the gas top-up procedure.
3. Confirm the "Pause Switch" indicator is **OFF** unless there is an active incident.
4. Review the latest attestation receipts in the Receipts tab.

## Adjust Fees and Treasury Address
1. Navigate to **Policy > Sponsorship Profile** in OCP.
2. Click **Edit** and update:
   - **Flat Fee (USD)** or **% of Sponsored Gas** as required.
   - **Treasury Address** — paste the checksummed address.
3. Submit the change and approve the WebAuthn prompt to sign the policy update transaction.
4. Validate the change landed by checking the "Pending Changes" drawer and ensuring the status becomes `Applied`.

## Top Up Paymaster Gas Wallet
1. From **Finance > Wallets**, locate the **Paymaster Gas Wallet**.
2. Click **Deposit** and copy the wallet address.
3. Using the hosted wallet UI (e.g., Fireblocks console), initiate a transfer to the copied address.
4. Back in the OCP dashboard, watch the balance auto-refresh (should update within 2 blocks). The Alert feed clears when the balance exceeds 0.05 ETH.

## Flip the Pause Switch
1. Go to **Operations > Safeguards**.
2. Review the checklist (ensure all in-flight sponsorships are settled).
3. Toggle **Pause Sponsorships** to ON. Confirm the modal and WebAuthn signature.
4. To resume, repeat the steps and toggle OFF.
5. Verify the pause flag is propagated by checking the "Stack Status" widget and ensuring bundler queue drains.

## View Receipts and EAS Proofs
1. Navigate to **Receipts** in the sidebar.
2. Filter by job ID, request hash, or attester.
3. Click a row to open the drawer:
   - View the **EAS Schema UID** and on-chain attestation link.
   - Download the JSON receipt for auditing.
4. Use the **Share** button to generate a read-only link for external auditors.

## Escalation
- For critical alerts, page the on-call SRE via Opsgenie (button in the top bar).
- For policy changes requiring sign-off, tag the policy owner in the OCP comments.

## Change Log
- v1.0 – Initial browser-only workflow documentation.
