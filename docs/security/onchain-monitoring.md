# On-Chain Monitoring & Alerting Runbook

This runbook hardens the production deployment to the "institutional" bar by
providing actionable monitoring for every privileged action exposed by the AGI
Jobs v0 (v2) contracts. It assumes a non-technical operator can deploy the
sensors, receive alerts, and escalate using the incident-response playbook.

## 1. Sentinel policy (OpenZeppelin Defender)

Create a Defender Sentinel named **AGI Jobs v2 – Privileged Actions** with the
following configuration:

| Setting | Value |
| --- | --- |
| Network | Ethereum mainnet (add Sepolia as secondary for rehearsals) |
| Contracts | FeePool, StakeManager, JobRouter, IdentityRegistry, TaxPolicy, Thermostat |
| Function selectors | `setGovernance`, `setRewarder`, `setStakeManager`, `pause`, `unpause`, `governanceWithdraw`, `upgradeTo`, `grantRole`, `revokeRole` |
| Event filters | `Paused(address)`, `Unpaused(address)`, `GovernanceWithdrawal(address,address,uint256)`, `OwnerAction(address,bytes4)` |
| Alert channels | PagerDuty (Critical), Slack (Ops channel), Email (compliance archive) |

Enable **Autotasks** that invoke `scripts/v2/ownerControlPulse.ts` whenever the
Sentinel fires. The autotask posts the owner dashboard snapshot into the PagerDuty
alert so the incident commander can see module state without running local scripts.
All Defender projects should be linked to the GitHub OIDC trust relationship
outlined in `docs/release-signing.md` so credentials remain short-lived.

## 2. Forta agent cluster

Deploy the [Forta](https://forta.org) bot template stored in
`monitoring/forta/bot-template/` (create the directory if it does not yet exist)
with the following detectors:

1. **Pause/Unpause watcher** – emits `Critical` findings when any module is
   paused or unpaused outside the approved timelock queue.
2. **Treasury drain watcher** – tracks cumulative token outflows from FeePool and
   StakeManager. Raise a `High` severity alert if the 1-hour rolling delta exceeds
   5% of the operator treasury or if the recipient is not in the allowlist defined
   in `deployment-config/mainnet.json`.
3. **Governance executor watcher** – verifies that every privileged call is
   submitted by the authorised Safe or timelock. Anything else is tagged `Critical`.

Bots publish alerts to the Forta scan node you control plus a webhook that bridges
into the Ops Slack channel. Configure the webhook to include links to the Defender
Sentinel alert and the incident-response runbook section (§4). Forta findings are
retained for 180 days to satisfy institutional audit requirements.

## 3. Prometheus bridge for on-chain metrics

The Grafana dashboard already exposes off-chain service SLOs. Extend
`monitoring/prometheus/prometheus.yml` with the [forta-exporter](https://github.com/forta-network/forta-node/tree/master/exporter)
job so that critical Forta alerts appear as Prometheus series. Suggested rule:

```yaml
- alert: FortaCriticalFinding
  expr: forta_findings_severity{severity="critical"} > 0
  for: 1m
  labels:
    severity: critical
    runbook: https://github.com/MontrealAI/AGIJobsv0/blob/main/docs/incident-response.md
  annotations:
    summary: "Forta reported a critical on-chain event"
    description: "Check Defender Sentinel and execute the emergency pause procedure."
```

This keeps PagerDuty, Forta, and Defender alerts consistent while delivering a
single timeline inside Grafana for audits.

## 4. Tabletop validation cadence

After every production release tag, schedule a tabletop exercise that rehearses:

1. Defender Sentinel triggers on an unexpected pause.
2. Forta detects an unapproved governance withdrawal.
3. Prometheus forwards the alert to Alertmanager, which escalates to PagerDuty.

Document learnings in `docs/incident-response.md` and close the loop by updating
Sentinel/Forta thresholds if false positives occurred. Maintaining this cadence
keeps the monitoring configuration aligned with protocol changes and meets the
"monitoring & incident response" pillar of the institutional readiness checklist.
