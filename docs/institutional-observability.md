# Institutional Observability

AGI Jobs v0 treats observability as a first-class platform requirement so institutional operators can audit, monitor, and scale the network with confidence. This document expands on the sprint plan deliverables by mapping each observability pillar to the contracts, services, and automation that now ship in the repository. Use it alongside the [`Production Readiness Index`](production/deployment-readiness-index.md) when certifying releases.

## Observability artefact map

| Capability | Source of truth | Verification command/artefact |
| --- | --- | --- |
| Job & dispute lifecycle logging | Solidity events in `JobRegistry`, `ValidationModule`, `SystemPause`, and dispute modules | Stream events via an indexer or replay them with `npx hardhat events --contract JobRegistry --network <network>` (or your preferred block explorer) |
| Structured service logs | `shared/structuredLogger.ts`, `shared/auditLogger.ts`, and the storage append-only log | `node scripts/v2/ownerControlAtlas.ts --format json` (bundles the latest audit anchors) |
| Metrics ingestion | Prometheus scrape config under `monitoring/prometheus/prometheus.yml` | `npm run observability:smoke` (ensures scrape jobs, rules, and alerts are wired) |
| Alert routing | Alertmanager receiver map in `monitoring/alertmanager/alerts.yaml` | `npm run observability:smoke` (reports missing receivers) |
| Dashboards | Grafana definition at `monitoring/grafana/dashboard-agi-ops.json` | Import dashboard JSON or curl Grafana `/api/dashboards/uid/agi-slos` |
| Readiness enforcement | `docs/production/deployment-readiness-index.md` → “External observability” row | Follow the checklist and archive the smoke-check output in `reports/` |

## On-chain lifecycle audit trail

The `JobRegistry` contract emits events for every significant transition—funding, creation, assignment, submission, payout, escalation, cancellation, expiration, and dispute outcomes—forming an immutable audit log that downstream indexers can stitch into human-readable histories.【F:contracts/v2/JobRegistry.sol†L909-L1008】 Complementary modules (such as `ValidationModule` and `SystemPause`) emit committee selection, vote tally, slashing, and pause/resume events so governance can prove the state of critical safety switches at any time.【F:contracts/v2/ValidationModule.sol†L85-L123】【F:contracts/v2/SystemPause.sol†L152-L217】

## Structured and anchored service logs

Off-chain services emit privacy-preserving JSON Lines logs via `buildStructuredLogRecord`, which hashes sensitive payloads, records per-field digests, and tags each event with a deterministic integrity envelope.【F:shared/structuredLogger.ts†L1-L152】 The audit logger appends these structured entries to `storage/audit/events.jsonl`, optionally signs them, and maintains Merkle roots plus anchor receipts for tamper-evident retention that compliance teams can export on demand.【F:shared/auditLogger.ts†L1-L112】【F:shared/auditLogger.ts†L123-L188】

## Metrics, alerts, and dashboards

Prometheus scrapes every critical microservice and dependency (orchestrator, bundler, paymaster supervisor, attester, IPFS, and the subgraph) using the curated scrape configs committed to `monitoring/prometheus/prometheus.yml`. These entries guarantee consistent service discovery across Kubernetes clusters without hand-editing YAML in production.【F:monitoring/prometheus/prometheus.yml†L1-L55】

Alerting and SLO tracking ride on the shared rule file. Recording rules compute p95 onboarding latency, gas cost rates, bundler success ratios, sponsorship health, and subgraph lag, while alert definitions capture gas depletion, sponsorship rejection spikes, and bundler revert storms with embedded runbook links so operators have instant remediation guidance.【F:monitoring/prometheus/rules.yaml†L1-L37】【F:monitoring/prometheus/rules.yaml†L38-L55】

Alertmanager routes severity-tagged incidents to PagerDuty for critical pages and Slack for collaborative triage using the templated configuration stored in `monitoring/alertmanager/alerts.yaml`. The file is fully parameterised so production secrets stay external to the repository while structure and escalation paths remain version-controlled.【F:monitoring/alertmanager/alerts.yaml†L1-L20】

Grafana renders the curated “AGI Stack SLOs” dashboard, giving non-technical reviewers one-click visibility into onboarding latency, cost per verified operation, bundler reliability, sponsorship throughput, rejection trends, and subgraph health. The JSON definition ships with working queries and panel metadata so new deployments can import it directly without manual wiring.【F:monitoring/grafana/dashboard-agi-ops.json†L1-L56】

## Automation and smoke tests

`npm run observability:smoke` executes `scripts/observability-smoke-check.js`, which validates the Prometheus scrape targets, alerting rules, Alertmanager receivers, and Grafana dashboard schema. The helper fails fast with actionable error messages, allowing release managers to confirm telemetry coverage before approving a deployment window.【F:scripts/observability-smoke-check.js†L1-L103】

Archive the console output (or JSON-formatted wrapper) under `reports/<network>/observability-smoke-<date>.txt` and link it in the change ticket referenced by the owner-control playbooks. Treat a failing smoke check as a release blocker until the missing artefact is restored.

## Operational posture checklist

Before calling a release ready, confirm the observability row in the [`Production Readiness Index`](production/deployment-readiness-index.md) is green, the latest audit anchors are stored in the ops vault, and the Grafana dashboard returns HTTP 200 from the target environment. Retain generated logs, hashes, and screenshots so governance (or external auditors) can replay the full evidence trail at any time.

Together, these artefacts make AGI Jobs v0 operate like a flight recorder: every action is logged, the current state is observable at a glance, anomalies raise alarms immediately, and performance data informs proactive scaling.
