# SRE Runbook

## Alert response workflow
1. Acknowledge PagerDuty page.
2. Open Grafana dashboard `AA Stack Overview` and correlate with Alertmanager details.
3. Capture current metrics snapshots for the incident document.

## Common alerts
### GasTreasuryLow
- Severity: High
- Actions:
  1. Confirm treasury balance via Operator Console → Treasury.
  2. Notify finance (treasury@example.com) with the recommended top-up amount.
  3. Update incident ticket with ETA for replenishment.

### SponsorshipRejectSpike
- Severity: Critical
- Actions:
  1. Inspect orchestrator logs via Loki (query: `{app="orchestrator"}`) for error context.
  2. Check RPC status on statuspage.io and fail over by toggling to the fallback RPC in the Operator Console.
  3. If errors persist, activate the pause switch and escalate to protocol engineering.

### SponsoredRevertSpike
- Severity: Medium
- Actions:
  1. Validate the latest contract deployment status in GitHub releases.
  2. Compare revert signatures against known issue list in internal wiki.
  3. Communicate status in `#aa-incident` Slack channel every 15 minutes.

## Pause / Resume
- Pause: Operator Console → Controls → Pause sponsorships.
- Resume: Toggle off and monitor success rate. Ensure backlog drains before unpausing bundlers.

## Disaster recovery hooks
- For regional outage, trigger `dr-start` GitHub Action workflow to spin up the stack in the secondary cluster.
- Update DNS weightings through Cloudflare to reroute traffic.

## Post-incident
- Complete postmortem template within 72 hours.
- File follow-up issues in Jira using the `SLO Regression` label.
