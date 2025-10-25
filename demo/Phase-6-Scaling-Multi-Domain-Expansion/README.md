# Phase 6 — Scaling & Multi-Domain Expansion Demo

> **Mission**: prove to a non-technical operator that AGI Jobs v0/v2 can be the command console for civilization-scale autonomy. This demo couples smart-contract level controls, cross-domain agent routing, subgraph telemetry, and Layer-2 deployment plans into a single, copy-paste friendly experience.

---

## 🌐 Why this demo matters

* **Instant global expansion** – governance can register, pause, or rewire entire industry stacks with a single `Phase6ExpansionManager` transaction.
* **Non-technical empowerment** – a single command (`npm run demo:phase6:orchestrate`) emits pre-validated calldata, bridge plans, and AI orchestration summaries.
* **Planetary telemetry** – the subgraph now indexes `Phase6Domain`, `Phase6GlobalConfig`, and the new telemetry events so dashboards stream readiness, resilience, automation, compliance, and settlement posture in real time.
* **Bullet-proof governance** – every parameter is updatable by the contract owner (timelock/multisig) including emergency pause delegates, cross-chain bridges, and per-domain telemetry digests.
* **CI as a guardian** – the `ci (v2) / Phase 6 readiness` job enforces configuration drift detection on every PR and on `main`.
* **Resilience & automation telemetry** – the demo computes average/min/max resilience, automation/compliance BPS, settlement latency, sentinel coverage, and value flow across finance, health, logistics, climate, and the new education lattice.
* **Mesh-level infrastructure clarity** – a new decentralized infra registry renders every Layer-2, storage, identity, oracle, and compute touchpoint for Phase 6 so governance can audit the rails instantly.

---

## 🧭 Quickstart (non-technical operator)

1. **Install dependencies** (once):
   ```bash
   npm ci
   ```
2. **Generate Phase 6 runbook & calldata**:
   ```bash
   npm run demo:phase6:orchestrate
   ```
   Add `-- --json plan.json` to emit a machine-readable blueprint (use `-- --json -` to stream JSON to stdout). This prints:
   * Domain IDs and encoded `registerDomain` / `updateDomain` payloads.
   * Layer-2 bridge plans synthesized from the config and the on-chain ABI.
   * A ready-to-copy mermaid system diagram and runtime routing commentary from the Python orchestrator.
   * Encoded `setSystemPause` / `setEscalationBridge` transactions so governance can pivot or halt instantly.
3. **Simulate IoT + external system signals (hands-off preview)**:
   ```bash
   npm run demo:phase6:iot
   ```
   * Streams a console storyboard showing how the runtime routes finance, health, logistics, climate, and education events.
   * Provides guard-rail summaries (staking floors, circuit breakers, human validation flags) per event.
   * Outputs Layer-2 bridge plans and autopilot cadences; append `-- --json iot-report.json` for machine-readable export.
   * Point to your own feed with `-- --events my-events.json` to dry-run enterprise telemetry without editing the repo.
4. **Produce a governance-ready Markdown runbook** (optional):
   ```bash
   npm run demo:phase6:runbook -- --output phase6-runbook.md
   ```
   The output file bundles the executive summary, emergency calldata, per-domain guard rails, decentralized infra mesh, and the mermaid map for instant stakeholder distribution.
5. **Verify readiness in CI** (runs automatically, can be triggered locally):
   ```bash
   npm run demo:phase6:ci
   ```
   The script validates JSON schema, address hygiene, ABI sync, and UI artifacts before the CI job signs off.
6. **Push the manifest on-chain (dry-run by default)**:
   ```bash
   npx hardhat run --no-compile scripts/phase6/apply-config.ts --network <network> -- --manager <Phase6ExpansionManager>
   ```
   * Prints the governance plan, global diffs, and each domain action.
   * Defaults to a dry-run – add `--apply` to execute transactions once reviewed.
   * Scope updates with `--domain finance,health` or skip globals via `--skip-global`.
   * Append `--export-plan plan.json` to emit a JSON manifest of the actions for multisig or council review.
6. **Open the control surface UI**:
   *Serve locally or open directly in the repo*
   ```bash
   npx serve demo/Phase-6-Scaling-Multi-Domain-Expansion
   ```
   Navigate to `http://localhost:3000` (default). The page renders interactive domain cards, live bridge plans, and a mermaid map.

---

## 🧱 Smart contract authority

`contracts/v2/Phase6ExpansionManager.sol` introduces a governance-only control plane that keeps the owner in absolute command:

* `registerDomain`, `updateDomain`, `configureDomainConnectors`, `setDomainStatus`
* `setGlobalConfig`, `setGlobalGuards`, `setGlobalTelemetry`, `setSystemPause`, `setEscalationBridge`, `forwardPauseCall`, `forwardEscalation`
* `setDomainOperations` locks in per-domain max concurrency, staking floors, revenue share, circuit breakers, and human validation toggles.
* `setDomainTelemetry` publishes resilience/automation/compliance BPS, settlement latency, sentinel oracle, and manifest/metrics digests for every industry vertical.
* Deterministic `domainId` helper & `listDomains()` enumeration for tooling.
* Rejects missing telemetry targets – `subgraphEndpoint` is now mandatory on every domain mutation so dashboards never lose visibility.

Emergency response: governance can forward any encoded call to the shared `SystemPause` contract or to an arbitrary escalation bridge. Pausing, routing, and redeployments remain one-click actions for the owner.

---

## 🧠 Agent runtime extension

`orchestrator/extensions/phase6.py` + the runtime hook inside `StepExecutor` bring Phase 6 awareness to every orchestration step:

```mermaid
flowchart TD
  Intent[User intent / IoT signal] --> Runtime[Phase6Runtime]
  Runtime -->|scores domains, merges global manifest| Domain[Selected domain profile]
  Domain --> Executor[StepExecutor]
  Executor --> BridgePlan[Bridge & oracle plan]
  Executor --> Logs[Annotated run log \n(heartbeat, routers, DID checks)]
```

* Reads the JSON snapshot generated by this demo (`config/domains.phase6.json`) or a subgraph export.
* Scores domains by skill tags, capability weights, and governance priority.
* Annotates every orchestration log with manifest URIs, heartbeat cadences, IoT routers, execution routers, and the guard-rail summary for the selected domain (min stake, capacity, treasury share, circuit breaker, human validation toggle).
* Provides `build_bridge_plan` & `ingest_iot_signal` helpers for Layer-2 routing and IoT-triggered job creation.

---

## 🛰️ Subgraph telemetry upgrades

The Graph mapping indexes the new events so dashboards, analytics, and governance tooling have live insight:

* `Phase6Domain` entity tracks metadata, routing addresses, heartbeat SLAs, pause status **and** telemetry BPS/latency digests from `DomainTelemetryUpdated`.
* `Phase6GlobalConfig` entity exposes the canonical IoT router, L2 cadence, DID registry, manifest URI, emergency bridges, and the telemetry floor signals emitted by `GlobalTelemetryUpdated`.
* Every `EscalationForwarded` event is indexed with payload/response metadata so dashboards can surface the last emergency action and whether it targeted the pause contract or the escalation bridge.
* Each event (`DomainRegistered`, `DomainUpdated`, `DomainStatusChanged`, `GlobalConfigUpdated`, `DomainTelemetryUpdated`, `GlobalTelemetryUpdated`) updates the store instantly.
* New handlers capture `DomainOperationsUpdated` & `GlobalGuardsUpdated` so analysts can graph staking floors, queue depth, treasury share, circuit breaker thresholds, global auto-pause policy, and telemetry floors over time.

These additions power UI cards, CI validation, and off-chain monitoring (e.g., the Resilience Index).

---

## 🕸️ Decentralized infrastructure mesh

* `config/domains.phase6.json` now includes a **global `decentralizedInfra` array** and per-domain `infrastructure` inventories. Each entry captures layer, provider, role, status, and optional endpoint.
* `scripts/run-phase6-demo.ts` surfaces mesh + telemetry data – global integration counts, per-domain touchpoints, resilience/automation/compliance BPS, settlement latencies, and copy-paste friendly summaries for multi-sig review.
* `index.html` renders the infra mesh alongside bridge plans so non-technical operators see exactly which L2s, storage rails, DID registries, and compute meshes come online.
* `scripts/ci-check.mjs` enforces structural integrity: at least three integrations per domain and valid metadata for every mesh element.
* `orchestrator/extensions/phase6.py` consumes the infra map to annotate runtime logs (`infra mesh: Layer-2:Linea(active)`) and to expose integration hints to IoT signal handlers.

---

## 🔁 CI enforcement

A new job in `.github/workflows/ci.yml` named **Phase 6 readiness** runs on every PR/main push:

1. Installs dependencies (cached).
2. Validates the Phase 6 domain manifest via `npm run demo:phase6:ci`.
3. Asserts the mermaid UI, ABI files, and config schema stay in sync.
4. Publishes a short status summary to the GitHub Checks UI.

`EXPECTED_CONTEXTS` in `scripts/ci/verify-branch-protection.ts` is updated so branch protection refuses merges without this signal.

---

## 🖥️ Demo UI snapshot

![Phase 6 control surface](./index.html)

Open `index.html` to explore:

* Dynamic domain cards with L2 cadence, oracle routes, resilience indices, and skill matrices.
* Embedded mermaid system map.
* Copyable calldata panes (auto-updated from the JSON config).
* “One-click ready” states for finance, health, logistics, climate, education, plus global manifest metadata.

---

## 🛠️ Customising your rollout

1. **Edit** `config/domains.phase6.json` – tweak addresses, manifests, skills, or heartbeat cadences.
2. **Regenerate** plans with `npm run demo:phase6:orchestrate` (no build step needed).
3. **Commit** the change. CI will block if a field is missing or malformed.
4. **Dry-run or apply on-chain** with `npx hardhat run --no-compile scripts/phase6/apply-config.ts --network <network> -- --manager <Phase6ExpansionManager> [--apply]`.
   * Hard-validates telemetry digests, decentralized infra coverage, metadata, and infrastructure maps before emitting any calldata.
   * Add `--export-plan plan.json` to store a versioned summary alongside your PR or governance packet.
5. **Ship** – governance can copy the calldata into a multi-sig, or run through the existing owner scripts.

> Tip: pair this demo with `npm run owner:mission-control` to script the actual transaction bundle from the same console.

---

## ✅ Deliverables included

* Smart-contract upgrade: `Phase6ExpansionManager` + tests + mocks (global guard rails, telemetry control, and domain operations control).
* Python runtime extension with domain routing, IoT signal ingestion, guard-rail annotation, and bridge planning.
* Subgraph schema & mapping updates for Phase 6 telemetry including guard/operations snapshots.
* Static UI + JSON config + orchestration scripts for non-technical operators.
* CI guardrail + branch-protection expectation updates.

Welcome to Phase 6.
