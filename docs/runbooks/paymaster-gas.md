# Paymaster Gas Top-Up Runbook

## Trigger
- Alert: **LowGasBalance** (critical)
- Metric: `eth_wallet_balance_wei{wallet="paymaster"}` < 0.05 ETH equivalent.

## Response Steps
1. Acknowledge the Alertmanager notification.
2. Confirm the balance in OCP (**Finance > Wallets**).
3. Initiate a transfer from the treasury hot wallet to the paymaster gas wallet.
4. Verify the transaction on Etherscan (target confirmations: 6).
5. Update the incident ticket with tx hash and new balance.
6. Close the alert once the metric recovers above the threshold.

## Preventative Actions
- Schedule weekly automated top-ups through Fireblocks.
- Review sponsorship usage trends in Grafana.

## Escalation
If the wallet cannot receive funds (e.g., account frozen), escalate to Finance leadership and pause sponsorships.
