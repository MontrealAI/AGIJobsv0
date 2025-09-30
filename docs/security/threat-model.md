# AGI Stack Threat Model & Table-Top Playbooks

## Overview
The AGI stack relies on deterministic sponsorship, attestation issuance, and decentralized storage. The following sections document high-risk scenarios and provide tabletop exercises for the incident response team.

## Assets
- **KMS-backed keys** for paymaster sponsorship and attestations.
- **Receipts and attestation proofs** stored in Postgres/IPFS.
- **RPC connectivity** to the target chain.
- **Ingress endpoints** exposed to integrators.

## Attack Surface Summary
| Component | Risks | Mitigations |
| --- | --- | --- |
| Orchestrator API | Abuse via oversized requests, CORS bypass | Strict CORS allowlist, 1 MB body limit, WAF enabled |
| Bundler | Chain reorgs, revert storms | Observability alerts, pause switch, fallback RPC |
| Paymaster Supervisor | Sponsorship abuse, budget overrun | Policy playbook, budget caps, KMS signing |
| Attester | Key compromise | KMS custody, hardware-backed approvals |
| IPFS | Pin backlog, data unavailability | Pin latency monitoring, disaster recovery sync |

## Scenario Playbooks

### Chain Reorg
- **Symptoms**: Sudden spike in attestation replays, `service:subgraph_lag_blocks` increases.
- **Immediate Actions**:
  1. Pause sponsorships via OCP.
  2. Switch bundler RPC to fallback provider using Helm override or OCP toggle.
  3. Coordinate with chain infrastructure provider to confirm reorg depth.
- **Recovery**: Resume operations once finality depth > 20 blocks and receipts reconciled.

### RPC Outage
- **Symptoms**: Bundler error logs with `connection refused`, success rate drops.
- **Immediate Actions**:
  1. Confirm outage with provider status page.
  2. Update `global.rpc.primary` to fallback endpoint in values override and run `helm upgrade`.
  3. Monitor Grafana success rate panel for recovery.
- **Tabletop Drill**: Quarterly exercise to rotate RPC providers without downtime.

### IPFS Pin Backlog
- **Symptoms**: `service:ipfs_pin_latency_seconds:p95` > 120 seconds, receipts pending.
- **Immediate Actions**:
  1. Scale IPFS StatefulSet replicas via Helm values (increase to 2).
  2. Trigger manual pin sync using `ipfs-cluster-ctl sync --all`.
  3. Offload large artifacts to secondary pinning service if backlog persists > 30 minutes.
- **Recovery**: Confirm latency returns < 30 seconds and disaster recovery sync plan executed.

### Account Abstraction (AA) Sponsorship Abuse
- **Symptoms**: Sponsorship spend spikes, rejection alerts triggered.
- **Immediate Actions**:
  1. Enable pause switch and activate rate limit override in OCP.
  2. Apply deny list for malicious smart accounts in Policy Playbook.
  3. Notify integrators of temporary suspension.
- **Recovery**: Reinstate traffic once budgets reset and abuse vector closed.

## Validation
- Run quarterly ZAP/Burp scans against the orchestrator ingress (document results in security backlog).
- Ensure KMS audit logs show no export operations; keys remain in HSM.
- Confirm tabletop drills recorded in the incident tracker with action items.

## Change Log
- v1.0 – Initial threat model coverage.
