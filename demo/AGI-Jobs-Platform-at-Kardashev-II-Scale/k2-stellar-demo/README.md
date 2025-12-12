# AGI Jobs v0 (v2) — Demo → AGI Jobs Platform at Kardashev II Scale → K2 Stellar Demo

> AGI Jobs v0 (v2) is our sovereign intelligence engine; this module extends that superintelligent machine with specialised Kardashev-II stellar capabilities and deterministic guardian guardrails.

## 🧭 Ultra-deep readiness map
- **Location**: `demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/k2-stellar-demo/`
- **Operating manifest**: `config/k2-stellar.manifest.json` (council, logistics, self-improvement cadence).
- **Energy & compute telemetry**: `output/stellar-telemetry.json`, `output/stellar-stability-ledger.json`.
- **Decision ledger**: `output/stellar-orchestration-report.md` summarises the last orchestrator pass.
- **UI entry point**: `index.html` with overlays wired to `ui/` assets.
- **CI gate**: `npm run demo:kardashev-ii-stellar:ci` (enforced for any PR touching this directory).

## 🚀 Stellar Kardashev-II operator quickstart
1. Install dependencies from the repo root: `npm install`.
2. Run `npm run demo:kardashev-ii-stellar:ci` to validate artefacts and README integrity.
3. Launch a deterministic dry-run with `npm run demo:kardashev-ii-stellar:orchestrate -- --check` to recompute ledgers without writing new outputs.
4. Generate full artefacts with `npm run demo:kardashev-ii-stellar:orchestrate -- --reflect` to attach introspection notes, then open `index.html` to inspect dashboards.
5. Escalate anomalies using the guardian contacts embedded in [`OperatorRunbook.md`](../../OperatorRunbook.md) and `config/k2-stellar.manifest.json`.

## 🧱 Architecture overview
```mermaid
flowchart TD
    Manifest[Stellar Manifest \n config/k2-stellar.manifest.json] --> Orchestrator[Stellar Orchestrator scripts/orchestrate.ts]
    Orchestrator --> Ledgers[Ledger outputs under output/]
    Ledgers --> Dashboards[Static dashboards \n index.html + ui/]
    Ledgers --> CI[npm run demo:kardashev-ii-stellar:ci]
    CI --> Governance[Guardian & Owner Review]
    Dashboards --> Operators((Mission Owners))
```
- `scripts/orchestrate.ts` ingests the manifest to regenerate ledgers under `output/`.
- Dashboards in `index.html` + `ui/` ingest these ledgers to project readiness metrics for mission owners.
- CI validation (`scripts/ci-validate.ts`) replays orchestrator checks and enforces documentation parity.

## 🔌 Energy & compute governance
- Energy parameters sourced from `config/k2-stellar.manifest.json.energyProtocols` with telemetry published to `output/stellar-telemetry.json`.
- Compute fabric health and validator coverage propagate into `output/stellar-stability-ledger.json`.
- Variance above ±0.1% is flagged in `output/stellar-orchestration-report.md` for immediate guardian review.

## 🎛️ Mission directives & verification dashboards
- Owner directives under `config/k2-stellar.manifest.json.missionDirectives` map to Safe transaction bundles in `output/stellar-safe-transaction-batch.json`.
- Verification dashboards consume `output/stellar-orchestration-report.md` and `output/stellar-operator-briefing.md`.
- UI entry point: `index.html` with components rendered by `ui/` scripts to visualise domains, sentinels, and capital streams.

## 🧬 Stability ledger & unstoppable consensus
```mermaid
flowchart LR
    EnergyFeeds[Energy & Compute Telemetry] --> Reconciliation[Reconciliation & Drift Checks]
    Reconciliation --> StabilityLedger[output/stellar-stability-ledger.json]
    StabilityLedger --> Guardians[Guardian Council Sign-off]
    Guardians --> ResilienceBacklog[Self-Improvement Queue]
    ResilienceBacklog --> Orchestrator
```
- System resilience metrics recorded in `output/stellar-stability-ledger.json` with drift checks across energy, compute, and logistics corridors.
- Thermostat guardrails and pause levers surface in `output/stellar-safe-transaction-batch.json` for council audits.
- CI replays consensus hashes via `scripts/orchestrate.ts --check` to guarantee unstoppable alignment.

## 🛡️ Governance and safety levers
- Pause, upgrade, and deployment levers defined in `config/k2-stellar.manifest.json.missionDirectives.ownerPowers`.
- Guardian drill cadence keeps levers primed; see `missionDirectives.drills` in the manifest.
- Align with repo-level emergency playbooks under `demo/agi-governance/` for multi-mission escalations.

## 📦 Artefacts in this directory
- `config/` — manifest describing council anchors, corridors, domains, and guardrails.
- `scripts/` — TypeScript automation for orchestration and CI enforcement.
- `output/` — generated ledgers, dashboards-in-waiting, and mermaid sources.
- `ui/` — static dashboards consuming the latest artefacts.
- `index.html` — mission owner entry point wired to the ledger outputs.

## 🧪 Verification rituals
- **Per-change**: `npm run demo:kardashev-ii-stellar:ci` (required; fails if documentation or ledgers drift).
- **Pre-launch**: `npm run demo:kardashev-ii-stellar:orchestrate -- --check` to dry-run invariants against new manifests.
- **Full publish**: `npm run demo:kardashev-ii-stellar:orchestrate -- --reflect` to write refreshed artefacts and dashboards.

## 🧠 Reflective checklist for owners
- [ ] Have guardian signatures in `output/stellar-stability-ledger.json` been refreshed within the last run?
- [ ] Are logistics buffers in `config/k2-stellar.manifest.json.logisticsCorridors` meeting the minimums surfaced in the dashboards?
- [ ] Has `npm run demo:kardashev-ii-stellar:ci` produced a ✔ result after your changes?
- [ ] Are mission directives mirrored in the directive cards rendered by the UI?
- [ ] Is the owner proof deck (`output/stellar-safe-transaction-batch.json`) signed off by the current guardian council?

---

**Continuous alignment**: rerun `npm run demo:kardashev-ii-stellar:ci` after every change in this tree. The orchestrator guarantees unstoppable consensus only when the manifest, ledgers, and documentation stay synchronised.
