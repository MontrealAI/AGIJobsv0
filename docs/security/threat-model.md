# Threat Model

| Asset | Threat | Likelihood | Impact | Mitigations |
|-------|--------|------------|--------|-------------|
| Paymaster treasury | Chain reorg causing double-spend of sponsored tx | Medium | High | Use EntryPoint finality monitors, wait for 5 block confirmations before settlement, maintain ability to pause sponsorships. |
| Sponsored operations | RPC outage preventing bundler submission | High | Medium | Configure fallback RPC, monitor `success_rate`, automatic failover toggled via console. |
| IPFS receipts | Pin backlog leading to missing receipts | Medium | Medium | IPFS latency alerts, autoscaling, nightly pin audit job. |
| Attestation integrity | Malicious schema or key compromise | Low | High | Keys stored via KMS CSI driver, rotate weekly, enforce schema UID from config. |
| AA sponsorship abuse | Bot-driven flood of sponsor requests | High | High | WAF, strict CORS, per-key rate limiting, request size limits, manual review workflow. |

## Architecture overview
- Secrets sourced via KMS-backed CSI driver; no private keys written to disk.
- All ingress traffic terminates at TLS with HSTS enforced and WAF policy applied.
- Bundler and paymaster only communicate via authenticated gRPC with mutual TLS.

## Assumptions
- Kubernetes cluster is hardened per CIS benchmark.
- Operators use SSO with hardware keys.
- Chain finality assumptions rely on L2 canonical messaging.
