# Node Operator Runbook (Browser-Only)

This runbook is designed for non-technical operators. Every workflow is achievable with a browser-based console such as Grafana, the stack dashboard, or a managed blockchain explorer.

## Prerequisites

- Access to the AGI Stack Operator Portal with multi-factor authentication.
- Access to the treasury wallet view-only dashboard.
- PagerDuty or Slack mobile app for receiving alerts.

## Adjust Sponsored Fee Rates

1. Navigate to **Operator Portal → Paymaster Controls**.
2. Select **Fee Schedule** and choose the target chain (Testnet/Mainnet).
3. Use the slider to set the base sponsorship fee in gwei. Tooltips show the resulting USD equivalent (sourced from the cpvo_usd metric).
4. Click **Preview** to confirm the change and **Submit**. The portal creates a signed policy update via the Paymaster Supervisor API. No CLI steps are required.

## Top Up Gas Treasury

1. On the same portal, open **Treasury → Gas Wallet**.
2. Review current balance and projected runway (based on 6h moving average of paymaster_sponsored_operations_total).
3. If below the runbook threshold (0.05 ETH), click **Request Top-Up**.
4. Approve the transaction in the connected custodial wallet UI (Fireblocks, Anchorage, etc.).
5. The portal confirms the broadcast and records the transaction hash for auditing.

## Flip Emergency Pause

1. Open **Safety → Circuit Breaker**.
2. Review live status of orchestrator success rates and current alerts.
3. Click **Pause Sponsored Operations**. The portal performs a KMS-backed signature to toggle the on-chain pause switch.
4. Confirm the dialog. The UI displays the resulting transaction hash and expected block confirmation time.
5. To resume, use **Resume Operations** with the same confirmation flow.

## View Receipts & EAS Proofs

1. Navigate to **Receipts → Search**.
2. Filter by wallet address, session ID, or attestation UID.
3. The portal queries the subgraph and IPFS gateway to render:
   - Sponsored operation metadata.
   - EAS attestation details.
   - Download link for receipt bundle.
4. Click **Export** to save a PDF summary for compliance teams.

## Respond to Alerts

- Alerts contain direct runbook links. Tap the link to open the corresponding SRE action plan.
- Acknowledge the alert in PagerDuty to avoid duplication.
- For critical alerts, follow the escalation policy in the SRE runbook.
