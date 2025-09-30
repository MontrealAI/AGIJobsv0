# SRE Operations Runbook

This runbook covers alert response procedures for the AGI stack.

## Tooling
- **Grafana** (`https://grafana.agistack.dev`) – Dashboard `AGI Stack SLOs`.
- **Alertmanager** (`https://alerts.agistack.dev`) – Triage alerts, ensure runbook links resolve.
- **Opsgenie** – Paging integration for `sev1` and `sev2` alerts.

## Key Alerts
| Alert | Severity | Runbook |
| --- | --- | --- |
| LowGasBalance | Critical | `docs/runbooks/paymaster-gas.md` |
| SponsorshipRejectionSpike | Warning | `docs/runbooks/rejection-spike.md` |
| BundlerRevertSpike | Warning | `docs/runbooks/revert-spike.md` |

## Standard Response Flow
1. **Acknowledge** the Alertmanager notification.
2. **Inspect** the Grafana dashboard to confirm metric deviation.
3. **Execute** the linked runbook. Escalate to the on-call engineer if remediation exceeds 30 minutes.
4. **Post-Incident** – File a retrospective in the incident tracker within 48 hours.

## Manual Tests
- **Pause Switch** – Toggle to ON via OCP, confirm the ConfigMap updates and bundler queue drains.
- **RPC Fallback** – Simulate outage by blocking the primary RPC host in Cloudflare; ensure fallback metrics show traffic shift.

## Disaster Recovery Hooks
See `docs/runbooks/disaster-recovery.md` for detailed steps.

## Change Log
- v1.0 – Initial SRE incident response doc.
