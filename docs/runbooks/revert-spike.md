# Bundler Revert Spike Runbook

## Trigger
- Alert: **BundlerRevertSpike** (warning).
- Metric: `rate(bundler_operations_total{status="reverted"}[5m])` > 2.

## Response Steps
1. Inspect the Bundler dashboard in Grafana for correlating latency or mempool anomalies.
2. Pull recent transaction hashes from the Bundler UI and review them on Etherscan.
3. Validate entry point configuration and ensure the latest contract addresses match Helm values.
4. Check L2 sequencer status (for rollups) and RPC health dashboards.
5. If reverts stem from user operations, notify affected integrators via the status page.
6. Reduce the bundler submission rate via the OCP toggle if mempool congestion persists.

## Escalation
- Escalate to the smart contract engineering team if contract-level reverts persist beyond 15 minutes.
- Consider pausing sponsorships if reverts are due to upstream chain instability.

## Post-Mortem Checklist
- Capture failing calldata samples.
- Update integration guides with mitigation steps.
