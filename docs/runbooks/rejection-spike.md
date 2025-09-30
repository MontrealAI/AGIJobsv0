# Sponsorship Rejection Spike Runbook

## Trigger
- Alert: **SponsorshipRejectionSpike** (warning).
- Metric: `service:sponsored_ops_rejections:rate5m` > 5.

## Response Steps
1. Confirm the alert in Grafana by inspecting the "Sponsorship Rejections by Result" panel.
2. Identify the top offending result label (e.g., `rate_limit`, `policy_denied`, `reorg`).
3. In OCP, filter the Receipts tab by the current hour to inspect failed requests.
4. If abuse is detected, use the Policy Playbook to block the offending wallet or schema.
5. Review bundler logs via Loki for accompanying errors.
6. Document mitigation actions in the incident ticket.

## Escalation
- If rejection rate exceeds 50% for more than 30 minutes, escalate to the Policy Owner and Security Lead.
- Consider pausing sponsorships if legitimate users are impacted.

## Post-Mortem Checklist
- Capture the timeline and root cause.
- Update policy automation tests if a rule misfired.
