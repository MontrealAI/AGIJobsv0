# Node Operator Runbook (Browser-Only)

This guide assumes operators do not have shell or `kubectl` access. All actions are performed via the Operator Console (https://operators.example.com) and Grafana.

## Monitor health
1. Open the "AA Stack Overview" Grafana dashboard.
2. Verify that the **Success Rate** panel remains above 99%. If it drops:
   - Check the **Time To Operation (p95)** panel for latency spikes.
   - Review the alert banner within the console.
3. Confirm the **Treasury Balance (USD)** panel is above the `Gas Top-up` threshold configured in the console settings page.

## Adjust sponsorship fees
1. Navigate to **Operator Console → Economics → Fees**.
2. Set the **Base Sponsorship Fee** slider to the desired value in USD.
3. Click **Preview impact** to view projected margins.
4. Hit **Commit update**. Changes propagate through the paymaster supervisor via the management API.

## Top-up gas / treasury
1. Visit **Operator Console → Treasury**.
2. Review the **Current balance** card and compare against the minimum safe threshold (displayed inline).
3. Click **Top-up via Safe**.
4. The console opens the Safe App with the recommended amount. Approve the transaction using your wallet.
5. Watch the balance card for confirmation.

## Flip the pause switch
1. Navigate to **Operator Console → Controls**.
2. Locate the **Pause sponsorships** toggle.
3. Toggle **ON** to halt new sponsorships. Confirm the modal prompt.
4. When safe to resume, toggle **OFF**. The console waits for cluster reconciliation and shows a green "Resumed" badge when complete.

## View receipts & verify attestations
1. From **Operator Console → Receipts**, select the relevant User Operation hash.
2. Click **Download receipt** to fetch the IPFS-backed JSON receipt.
3. Click **Verify EAS attestation**. The console automatically checks the schema UID and status via the EAS API and displays a green check when valid.

## Escalation matrix
- **Critical alerts (PagerDuty)**: acknowledge within 5 minutes.
- **Finance questions**: email treasury@example.com.
- **Security incidents**: call the on-call security engineer per the incident response card.
