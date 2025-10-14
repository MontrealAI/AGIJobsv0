# Observability Playbook

This playbook connects the Global Governance Council contract to the monitoring
stack used by the AGI Jobs Network Operations Center.

## Data Sources

| Source | Description | Sink |
| --- | --- | --- |
| Hardhat Event Stream | Streams `MandateVote`, `NationRegistered`, etc. | Redis → Worker Fleet |
| On-chain State Snapshots | Periodic `eth_call` invocations exported as JSON | PostgreSQL |
| Runbook Actions | shell session transcripts | Object Storage |

## Pipeline Steps

1. Start the event forwarder:
   ```bash
   node demo/cosmic-omni-sovereign-symphony/scripts/stream-events.mjs
   ```
2. Configure Grafana data source pointing to the PostgreSQL replica described in
   `.env`.
3. Import `dashboards/global-governance.json` into Grafana.
4. Enable alerting by creating rules on `global_governance_support_weight`.
5. Mirror the event stream into the AGI Jobs knowledge graph by invoking:
   ```bash
   pnpm tsx demo/cosmic-omni-sovereign-symphony/scripts/publish-knowledge-graph.ts
   ```

## Incident Signals

- **Support weight drops suddenly** → potential pausing or mass abstention.
- **Quorum achieved without expected sign-off** → escalate to security.
- **Event stream latency > 5s** → failover to archival RPC provider.

Document all anomalies in `logs/incidents/` and update the runbook following the
post-incident review template.
