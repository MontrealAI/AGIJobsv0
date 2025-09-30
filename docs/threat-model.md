# Threat Model & Tabletop Runbook

## Assets & Trust Boundaries

- **KMS-backed Keys** – Stored in cloud HSM, never written to disk. Used by Attester and Paymaster Supervisor pods via workload identity.
- **Sponsored Funds** – Paymaster treasury wallet and bundler hot wallet.
- **Attestations** – EAS schema data stored on-chain and pinned to IPFS.
- **RPC Connectivity** – Primary and fallback RPC endpoints for orchestrator and bundler.

Trust boundaries exist between the Kubernetes cluster, external RPC providers, IPFS gateways, and operator portal users.

## Threat Scenarios

| ID | Scenario | Control |
| -- | -------- | ------- |
| TM-1 | Chain reorg invalidates sponsored ops | Use fallback RPC, replay pending ops, alert via BundlerRevertSpike |
| TM-2 | RPC outage causes downtime | Fallback RPC URLs, health probes, portal failover control |
| TM-3 | IPFS pin backlog delays receipts | Autoscaling IPFS, monitoring `service:ipfs_pin_latency_seconds:p95` |
| TM-4 | Account abstraction abuse (spam ops) | Rate limits, allowlists, WAF on ingress, emergency pause switch |
| TM-5 | Key compromise | Workload identity, KMS HSM, strict pod security |

## Tabletop Exercise Playbook

### Chain Reorg (TM-1)
1. Simulate reorg alert with sample Grafana annotation.
2. Operator triggers orchestrator failover to fallback RPC.
3. Bundler replays pending mempool and verifies receipts via portal.
4. Post-incident review ensures cpvo_usd stays within budget.

### RPC Outage (TM-2)
1. Disable primary RPC endpoint in staging.
2. Confirm alerts fire and portal failover toggled.
3. Observe orchestrator pods using fallback endpoints from ConfigMap.
4. Validate success rate recovers to >95% within 10 minutes.

### IPFS Pin Backlog (TM-3)
1. Flood pin queue in staging.
2. Autoscale IPFS chart to 3 replicas via Helm upgrade.
3. Monitor latency metric drop below 15s.
4. Document actions in incident ticket.

### AA Sponsorship Abuse (TM-4)
1. Generate synthetic burst above configured rate limit.
2. Confirm ingress WAF and paymaster supervisor rejections increase.
3. Apply policy update using Policy Playbook.
4. Validate the pause switch using Operator Portal "Safety" control, then resume normal operations once `SponsorshipRejectionSpike` alert clears.

## Residual Risks

- Dependence on third-party RPC SLA.
- Operator portal availability (mitigated via multi-region hosting).
- IPFS gateway rate limiting (mitigated by maintaining local pinning cluster).
