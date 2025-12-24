# AGI Jobs v0 (v2) — Demo → AGI Jobs Platform at Kardashev II Scale

> AGI Jobs v0 (v2) is the sovereign intelligence engine that compounds value faster than any legacy institution; this demo tunes that superintelligent machine for Kardashev-II scale economic expansion while preserving human-aligned guardrails.

This dossier is the living operator manual for `demo/AGI-Jobs-Platform-at-Kardashev-II-Scale`. It keeps non-technical mission owners fully briefed on how to launch, supervise, and continuously verify the Kardashev-II experience with the repo’s fully green CI lattice.

## 🧭 Ultra-deep readiness map
- **Location**: `demo/AGI-Jobs-Platform-at-Kardashev-II-Scale/`
- **Operating manifest**: `config/kardashev-ii.manifest.json` (council, logistics, verification, and drill cadence).
- **Energy & compute telemetry**: `output/kardashev-energy-feeds.json`, `output/kardashev-telemetry.json`.
- **Decision ledger**: `output/kardashev-orchestration-report.md` summarises the last orchestrator pass.
- **CI gate**: `npm run demo:kardashev-ii:ci` (enforced on PRs touching this directory).

## 🚀 Kardashev-II operator quickstart
1. Install dependencies from the repo root: `npm install`.
2. Run `npm run demo:kardashev-ii:ci` to validate artefacts, README integrity, and orchestrator invariants.
3. Launch a deterministic dry-run with `npm run demo:kardashev-ii:orchestrate -- --check` to produce ledgers without writing new outputs.
4. Generate full artefacts with `npm run demo:kardashev` (writes to `output/` and refreshes dashboards in `ui/`).
5. Serve the dashboard locally with `npm run demo:kardashev-ii:serve` and open the provided `http://localhost` URL.
6. Escalate anomalies using the guardian contacts embedded in [`OperatorRunbook.md`](../../OperatorRunbook.md) and `config/kardashev-ii.manifest.json`.

## 🧱 Architecture overview
```mermaid
flowchart TD
    Council[Interstellar Council Manifest] --> MissionHub[Kardashev-II Mission Hub]
    MissionHub --> Ledgers[Energy • Settlement • Consistency Ledgers]
    MissionHub --> Dashboards[UI Dashboards]
    MissionHub --> CI[npm run demo:kardashev-ii:ci]
    Ledgers --> Governance[Guardian & Owner Review]
    CI --> Governance
    Dashboards --> Operators((Mission Owners))
```
- `scripts/run-kardashev-demo.ts` ingests the manifest and fabric definitions to regenerate ledgers under `output/`.
- Dashboards in `index.html` + `ui/dashboard.js` ingest these ledgers to project readiness metrics for mission owners.
- CI validation (`scripts/ci-validate.ts`) replays orchestrator checks and enforces documentation parity.

## 🪪 Identity lattice & trust fabric
- Defined inside `config/kardashev-ii.manifest.json.identityProtocols` for global and federation-specific anchors.
- Anchor rotations, attestation latency, and coverage floors export to `output/kardashev-owner-proof.json`.
- Integrate guardian approvals with `.github/signers/` to align repo governance with the manifest’s quorum requirements.

## 🛰️ Compute fabric hierarchy
```mermaid
flowchart LR
    Earth[Solara Earth Core] --> Mars[Solara Mars Relay]
    Mars --> Orbital[Orbital Research Array]
    Orbital --> DeepSpace[Deep Space Forge]
    DeepSpace --> MissionHub
```
- Details live under `config/kardashev-ii.manifest.json.computeFabrics`.
- Availability, failover partner, and energy draw metrics synchronise into `output/kardashev-telemetry.json`.
- `output/kardashev-mermaid.mmd` auto-renders the hierarchy for downstream dashboards and is loaded by `ui/dashboard.js`.

## 🔌 Energy & compute governance
- Energy parameters sourced from `config/energy-feeds.json` and `config/kardashev-ii.manifest.json.energyProtocols`.
- Governance playbook stored in `output/governance-playbook.md` with explicit guardian cadence.
- Thermostat ranges propagate to `services/thermostat/` (external service) via the orchestrator’s generated payloads.

## ⚡ Live energy feed reconciliation
- `output/kardashev-energy-feeds.json` captures regional supply; `output/kardashev-energy-schedule.json` cross-verifies dispatch windows.
- `scripts/run-kardashev-demo.ts` performs kahan- and pairwise-sum comparisons to eliminate reconciliation drift.
- Variance above ±0.1% is flagged in `output/kardashev-orchestration-report.md` for immediate guardian review.

## 🔋 Energy window scheduler & coverage ledger
- Scheduler logic resides in `scripts/run-kardashev-demo.ts` (`buildEnergyWindows` helper) and writes to `output/kardashev-energy-schedule.json`.
- Coverage buffers appear inside `output/kardashev-fabric-ledger.json` under `coverageSeconds` for each domain.
- Adjustments require a signed change note appended to `output/kardashev-owner-proof.json`.

## 🚚 Interstellar logistics lattice
- Logistics corridors declared in `config/kardashev-ii.manifest.json.logisticsCorridors`.
- Runtime health published to `output/kardashev-logistics-ledger.json` with capacity, jitter, and buffer-day metrics.
- Logistics visualisations refresh in `index.html` via the `renderLogistics` handler inside `ui/dashboard.js`.

## 🕸️ Sharded job fabric & routing ledger
- Federation shards and job registries defined in `config/fabric.json`.
- Routing results captured in `output/kardashev-task-ledger.json`, mapping tasks to shards and guardians.
- The manifest’s `logisticsCorridors` and `computeFabrics` remain cross-linked to guarantee unstoppable routing consensus.

## 🎛️ Mission directives & verification dashboards
- Owner directives under `config/kardashev-ii.manifest.json.missionDirectives` map to Safe transaction bundles.
- Verification dashboards consume `output/kardashev-orchestration-report.md` and `output/kardashev-report.md`.
- UI entry point: `index.html` with components rendered by `ui/dashboard.js`.

## 🌐 Settlement lattice & forex fabric
- Settlement exposures and forex references export to `output/kardashev-settlement-ledger.json`.
- Treasury data originates from `config/kardashev-ii.manifest.json.interstellarCouncil` addresses.
- Cross-check conversions against `output/kardashev-report.md` before releasing interplanetary payments.

## ♾️ Consistency ledger & multi-angle verification
- `output/kardashev-consistency-ledger.json` holds hashed proofs, manifest fingerprints, and guardian signatures.
- CI runs recompute keccak256 digests using `scripts/run-kardashev-demo.ts` to ensure unstoppable consensus.
- Diff noise is surfaced in `kardashev-orchestration-report.md` under the “Consistency” section.

## 🔭 Scenario stress sweep
- Stress vectors embedded within `config/kardashev-ii.manifest.json.verificationProtocols` (energy models, latency tolerances).
- Full sweep results land in `output/kardashev-scenario-sweep.json` and summarised in `output/kardashev-report.md`.
- Schedule a sweep post-change with `npm run demo:kardashev-ii:orchestrate -- --reflect` to attach introspection notes.

## 🪐 Mission lattice & task hierarchy
- Hierarchical missions live in `config/task-lattice.json` and include timelines, autonomy rates, and fallback plans.
- `output/kardashev-task-hierarchy.mmd` renders the mission tree for rapid situational awareness.
- Guardians cross-link tasks to sentinel coverage inside `output/kardashev-task-ledger.json`.

## 🧬 Stability ledger & unstoppable consensus
- System resilience metrics recorded in `output/kardashev-stability-ledger.json`.
- Thermostat guardrails and pause levers surfaced in `output/kardashev-owner-proof.json` for council audits.
- CI enforces unstoppable consensus by replaying pause-call hashes through `scripts/run-kardashev-demo.ts`.

## 🛡️ Governance and safety levers
- Pause, upgrade, and deployment levers defined in `config/kardashev-ii.manifest.json.missionDirectives.ownerPowers`.
- Guardian drill cadence (hours/minutes) ensures levers remain primed; see `missionDirectives.drills` in the manifest.
- Align with repo-level emergency playbooks under `demo/agi-governance/` for multi-mission escalations.

## 🗝️ Owner override proof deck
- Owner override batches committed to `output/kardashev-owner-proof.json` with hashed transactions and witness metadata.
- Latest approvals summarised in `output/kardashev-orchestration-report.md` → “Owner Proof Deck”.
- File copies mirror into `reports/audit/` during scheduled compliance exports.

## 📦 Artefacts in this directory
- `config/` — manifest, fabric topology, energy feeds, and mission lattice JSON.
- `scripts/` — TypeScript automation for orchestration and CI enforcement.
- `output/` — generated ledgers, dashboards-in-waiting, and mermaid sources.
- `ui/` — static dashboards consuming the latest artefacts.
- `k2-stellar-demo/`, `stellar-civilization-lattice/` — specialised sub-demos with their own manifests and CI rituals.
- `run-demo.cjs`, `index.html` — launchers for the operator experience.

## 🧪 Verification rituals
- **Per-change**: `npm run demo:kardashev-ii:ci` (required; fails if documentation or ledgers drift).
- **Pre-launch**: `npm run demo:kardashev-ii:orchestrate -- --check` to dry-run invariants against new manifests.
- **Full publish**: `npm run demo:kardashev` to write refreshed artefacts and dashboards.
- **Cross-demo**: `npm run demo:kardashev-ii-stellar:ci` to ensure subordinate lattice states remain aligned.

## 🧠 Reflective checklist for owners
- [ ] Have guardian signatures in `output/kardashev-consistency-ledger.json` been refreshed within the last run?
- [ ] Are energy windows (`output/kardashev-energy-schedule.json`) covering ≥ 1.1× projected demand?
- [ ] Do logistics buffers in `output/kardashev-logistics-ledger.json` exceed the minimums in the manifest?
- [ ] Has `npm run demo:kardashev-ii:ci` produced a ✔ result after your changes?
- [ ] Are mission directives in `config/kardashev-ii.manifest.json` mirrored in the directive cards rendered by `ui/dashboard.js`?
- [ ] Is the owner proof deck (`output/kardashev-owner-proof.json`) signed off by the current guardian council?

---

**Continuous alignment**: rerun `npm run demo:kardashev-ii:ci` after every change in this tree. The orchestrator guarantees unstoppable consensus only when the manifest, ledgers, and documentation stay synchronised.
