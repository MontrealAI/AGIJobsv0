# SRE Runbooks

## Runbook Index

| Scenario | Trigger | Runbook Link |
| -------- | ------- | ------------ |
| Paymaster gas low | `LowGasBalance` alert | https://docs.example.com/runbooks/paymaster-gas |
| Sponsorship rejection spike | `SponsorshipRejectionSpike` alert | https://docs.example.com/runbooks/rejection-spike |
| Bundler reverts spike | `BundlerRevertSpike` alert | https://docs.example.com/runbooks/revert-spike |
| IPFS backlog | Dashboard panel "IPFS Pinning p95" > 60s | https://docs.example.com/runbooks/ipfs-backlog |
| Subgraph lag | `service:subgraph_lag_blocks` > 40 | https://docs.example.com/runbooks/subgraph-lag |

## CI Artifact Reference

- Container image digests are published per target/network combination as CI artifacts named `image-digest-${target}-${network}`.
- Bundler releases: download `image-digest-bundler-mainnet` for mainnet or `image-digest-bundler-testnet` for testnet validation.
- Paymaster supervisor releases: download `image-digest-paymaster-supervisor-mainnet` (or `...-testnet`) when preparing a rollout or comparing against running deployments.

## Paymaster Gas Low

1. Acknowledge alert in PagerDuty.
2. Confirm gas balance in Operator Portal.
3. Request treasury to top up via custodial wallet.
4. Update incident ticket with transaction hash.
5. Monitor cpvo_usd to ensure sponsorship pricing covers new cost basis.
6. If a redeploy is necessary, retrieve the latest paymaster image digest from the `image-digest-paymaster-supervisor-${network}` artifact before rolling out.

## Sponsorship Rejection Spike

1. Inspect the Grafana panel "Sponsorship Rejections by Result" (derived from
   `rate(paymaster_sponsored_operations_rejections_total[5m])`) to understand
   which policy guardrails are firing.
2. Review Paymaster Supervisor logs for policy enforcement messages.
3. If due to contract upgrades, coordinate rollback or whitelist update via Policy Playbook.
4. If due to chain reorg, switch orchestrator to fallback RPC using Portal failover control.

## Bundler Revert Spike

1. Check mempool health and base fee using RPC diagnostics.
2. Validate the bundler image digest matches the latest signed artifact from CI by downloading the `image-digest-bundler-${network}` artifact (mainnet uses `image-digest-bundler-mainnet`).
3. Pause sponsorship if revert rate > 20% for 15 minutes.
4. Resume once reverts fall below 2/min and on-chain transactions confirm normally.

## IPFS Pin Backlog

1. Compare `service:ipfs_pin_latency_seconds:p95` to baseline (under 10s).
2. Increase IPFS StatefulSet replicas temporarily via `helm upgrade --set ipfs.replicaCount=3`.
3. Flush queue by retriggering pin workers in the Operator Portal.
4. Scale down once backlog clears to avoid excess cost.

## Subgraph Lag

1. Inspect Graph Node logs for `head block behind` messages.
2. Verify Postgres IOPS not saturated; scale volume or CPU if necessary.
3. Trigger resync for affected subgraphs.
4. If lag persists > 100 blocks, escalate to Indexing vendor support.
