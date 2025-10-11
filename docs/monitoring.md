# Observability & SLO Guide

The Sprint 3 observability stack is centered on Prometheus, Grafana, and Alertmanager. Helm installs provision scrape
configs, SLO recording rules, and dashboards so that a non-technical operator can open Grafana and immediately view the
health of the AGI stack without manual wiring.

## Prometheus

`monitoring/prometheus/prometheus.yml` configures service discovery for every charted workload (orchestrator, bundler,
paymaster supervisor, attester, IPFS, and the graph-node). Metrics are scraped every 30 seconds from the `http` or
`metrics` ports that the Helm charts expose. Recording rules in `monitoring/prometheus/rules.yaml` derive the SLO
signals used throughout this sprint:

- `service:tto_seconds:rate5m` — p95 onboarding latency sourced from the orchestrator histogram.
- `service:cpvo_usd:rate5m` — cost per verified operation, aggregated from paymaster metrics.
- `service:bundler_success_rate:ratio5m` — successfully sponsored operations divided by all attempts.
- `service:sponsored_ops_total:rate5m` and `service:sponsored_ops_rejections:rate5m` — throughput and policy guardrail
  visibility for the paymaster supervisor.
- `service:ipfs_pin_latency_seconds:p95` — 95th percentile pin completion time, backing the IPFS backlog runbook.
- `service:subgraph_lag_blocks` — graph-node head delay measured in blocks for alerting on indexing lag.

Prometheus watches the rule file automatically; no manual reloads are needed during Helm bootstrap.

## Grafana

`monitoring/grafana/dashboard-agi-ops.json` ships a single-pane dashboard titled **AGI Stack SLOs**. Each panel visualises
one of the recording rules above, and the dashboard links directly to the runbook collection so operators can pivot from
metrics to procedures in one click. Import the JSON into Grafana or use it as a ConfigMap in your Helm release.

## Alerting

`monitoring/prometheus/rules.yaml` also defines alerting rules for gas depletion, sponsorship rejection spikes, and bundler
revert spikes. Every alert carries both a `runbook` label and an annotation so that Alertmanager templates can embed the
link in PagerDuty and Slack notifications. `monitoring/alertmanager/alerts.yaml` demonstrates how those annotations are
surfaced for on-call responders.

## Runbook Integration

The alert runbooks referenced in the rules align with the SRE runbooks under `docs/sre-runbooks.md`. Grafana dashboards,
Prometheus recordings, and Alertmanager notifications all point to the same URL set so operators receive a consistent
response plan regardless of entry point.

## On-chain Sentinels & Incident Hooks

Production deployments also require on-chain situational awareness. Configure Defender Sentinels or Forta bots using the
templates in `monitoring/onchain/` to watch for:

- `Paused(address)` / `Unpaused(address)` events across the protocol.
- Governance updates (`GovernanceUpdated`, `OwnershipTransferred`, `PauserUpdated`, `PauserManagerUpdated`, timelock proposer/executor changes).
- Critical parameter adjustments such as `setFeePct`, `setBurnPct`, and tax policy updates.

The [on-chain monitoring playbook](monitoring-onchain.md) describes how to route these alerts into PagerDuty and the
owner command centre runbooks, and the [Forta calibration log](security/forta-calibration.md) template captures the
behavioural tuning required for anomaly detectors. Pairing real-time sentinels with the Prometheus stack closes the
loop between on-chain incidents and traditional infrastructure alerts.
