# Sponsorship Policy Playbook

This playbook defines the guardrails for paymaster sponsorship and on-chain policies managed by the Paymaster Supervisor.

## Governance Roles

| Role | Responsibility | Approval Threshold |
| ---- | -------------- | ------------------ |
| Policy Admin | Draft and submit rule changes | 1 of 2 | 
| Security Steward | Reviews changes for abuse vectors | 1 of 1 | 
| Treasury | Confirms fee schedules | 1 of 1 |

All changes are executed through the Operator Portal with KMS-backed signatures. Manual keys are prohibited.

## Policy Types

1. **Fee Schedule** – Sets base gas markup and USD equivalency thresholds.
2. **Allowlist** – Defines dApps or AA accounts allowed to request sponsorship.
3. **Velocity Controls** – Caps sponsored operations per minute per dApp.
4. **Chain Failover** – Toggles fallback RPCs or disables chains after reorg events.

## Change Workflow

1. Draft policy in the portal and attach Jira ticket reference.
2. Portal routes change to Security Steward for approval.
3. Upon dual approval, the Paymaster Supervisor API executes an update transaction using a dedicated KMS key.
4. CI/CD pipeline records the change hash in the provenance log artifact.
5. Grafana annotation is created for visibility.
6. Helm values are updated via signed PR to ensure rate-limit and ingress policies remain immutable.

## Emergency Controls

- **Pause Switch** – Immediately halts sponsorship. Only Security Stewards can activate.
- **Rate-Limit Override** – Temporarily increases rate limits to absorb legitimate traffic surges; auto expires in 60 minutes.
- **RPC Failover** – Switches orchestrator RPC URLs to fallback set.
- **WAF Rule Push** – Applies emergency IP blocklist to ingress controller; requires Security Steward approval and expires after 4 hours.

## Review Cadence

- Weekly review of cpvo_usd trend vs. treasury forecasts.
- Monthly table-top validation of policy enforcement paths.
- Quarterly red-team simulation for sponsorship abuse patterns.
