# AGI Jobs Platform at Kardashev II Scale — Demonstration Command Deck

> **Thesis**: a non-technical steward can summon, audit, and steer a civilisation-scale AGI labour mesh – spanning Earth, Mars, and orbital habitats – using **AGI Jobs v0 (v2)** from a laptop. This demo ships the command surfaces, telemetry, calldata, and verification harness to make that real in minutes.

---

## 🧭 Ultra-deep readiness map

1. **Scope definition**  
   We implement a Kardashev-II control plane with:
   * Hierarchical federations (`earth`, `mars`, `orbital`) that each keep local autonomy while rolling up into an Interstellar Council.
   * Energy-aware job routing that obeys the Dyson Swarm thermostat (`energyProtocols.stellarLattice` + `thermostat`).
   * Fully-governable smart-contract payloads (Phase 8 manager controls) guaranteeing the owner can pause, upgrade, or redeploy any subsystem instantly.
   * Machine-verifiable outputs (Safe transaction batch, telemetry ledger, Mermaid schematics) suitable for regulated production use.

2. **Decomposition & challenge analysis**  
   We interrogated three perspectives:
   * **Operational** – can a single operator configure, pause, and relaunch thousands of domains? Answer: yes; the orchestrator synthesises deterministic calldata and Safe payloads per federation, so a single copy-paste activates or halts entire planetary clusters.
   * **Thermodynamic** – do rewards and task routing respect physical energy constraints? Answer: the manifest encodes per-region availability and a Dyson Swarm expansion curve; the CLI double-audits totals and warns if usage exceeds safety margins.
   * **Governance** – can owners override everything? Answer: we encode `setGlobalParameters`, `setGuardianCouncil`, `setSystemPause`, `forwardPauseCall`, and `setSelfImprovementPlan` transactions, all `onlyGovernance`, so contract owners retain absolute control.

3. **Triple verification**  
   * **Schema validation** – strict Zod schemas enforce numeric ranges, address formats, autonomy bounds, and manifest hashes.
   * **Cross-metric reconciliation** – telemetry recomputes energy, compute, and value metrics three ways (per-federation sum, council aggregate, Dyson programme projection) and fails if any disagree by >0.1%.
   * **Fail-safe audit** – CI runs `npm run demo:kardashev-ii:ci`, which replays the orchestrator in check mode, verifies README guardrails, and ensures Mermaid diagrams and Safe batches stay in sync with the manifest.

4. **Residual risk review**  
   Edge conditions like bridge outages, sentinel downtime, or negative autonomy deltas surface as explicit warnings in `output/kardashev-orchestration-report.md`; any fatal condition exits with non-zero status so CI and operators are forced to intervene. The README documents manual overrides and escalation paths.

5. **Final reflection loop**  
   After producing outputs, rerun `npm run demo:kardashev-ii:orchestrate -- --reflect` to regenerate metrics, recompute hashes, and print a checklist prompting human-in-the-loop confirmation. The CLI refuses to write artefacts if reflection steps fail.

---

## 🚀 Kardashev-II operator quickstart

1. **Install dependencies once**
   ```bash
   npm ci
   ```
2. **Synthesize calldata, telemetry, and diagrams**
   ```bash
   npm run demo:kardashev-ii:orchestrate
   ```
   You receive:
   * `output/kardashev-safe-transaction-batch.json` – Safe Transaction Builder payload with manager, guardian, pause, and domain actions.
   * `output/kardashev-orchestration-report.md` – non-technical runbook covering energy budgets, bridge latencies, and pause levers.
   * `output/kardashev-telemetry.json` – machine-readable metrics for dashboards, including triple-verified energy + compute deltas.
   * `output/kardashev-mermaid.mmd` – federated systems map (rendered automatically in the UI).
   * Console output summarising dominance scores, delta checks, and incident alerts.
3. **Launch the holographic control surface**
   ```bash
   npx serve demo/AGI-Jobs-Platform-at-Kardashev-II-Scale
   ```
   Visit `http://localhost:3000` to interact with:
   * **Federated Command Deck** – flip between Earth/Mars/Orbital, inspect autonomy levers, and trigger pause/resume.
   * **Dyson Swarm Progression** – animated milestone timeline bound to the manifest, showing captured GW vs target.
   * **Bridge Sentinel Monitor** – live badge of interplanetary bridge health sourced from `kardashev-telemetry.json`.
4. **Enforce Kardashev-II readiness in CI**
   ```bash
   npm run demo:kardashev-ii:ci
   ```
   This revalidates manifests, recalculates telemetry, ensures README guardrails remain intact, and fails if artefacts drift.

---

## 🧱 Architecture overview

```mermaid
flowchart TD
  IC[Interstellar Council
  Phase8 Manager
  (Owner-only control)] -->|setGlobalParameters|
  GF{Federation}:::federation
  GF --> E[Earth Dominion Grid]
  GF --> M[Mars Terraforming Mesh]
  GF --> O[Orbital Research Halo]
  E -->|registerDomain|
  E_FIN[Earth Finance]
  E -->|registerDomain|
  E_INF[Orbital Infrastructure]
  M --> M_TERRA[Mars Terraforming]
  O --> O_DEF[Orbital Defense]
  O --> O_RES[Interstellar Research]
  IC -->|setGuardianCouncil| GC[Guardian Council]
  IC -->|setSystemPause| SP[System Pause]
  SP -->|forwardPauseCall| {Pause/Resume}
  classDef federation fill:#141a3d,stroke:#4c5fff,color:#f8f9ff;
  classDef default fill:#0f172a,stroke:#475569,color:#f8fafc;
```

```mermaid
sequenceDiagram
  participant Operator
  participant CLI as Kardashev CLI
  participant Safe as Safe Batch
  participant Phase8 as Phase8 Manager
  participant Pause as System Pause
  participant Sentinel as Sentinels
  Operator->>CLI: run orchestrator
  CLI->>CLI: Validate manifest (schema, energy, compute)
  CLI->>CLI: Reconcile cross-metrics
  CLI->>Safe: Emit calldata bundle
  Operator->>Phase8: Execute Safe batch
  Phase8->>Pause: forwardPauseCall(pauseAll)
  Pause-->>Phase8: confirm pause
  Phase8->>Sentinel: setSentinelDomains()
  Phase8->>Operator: emit dominance + energy scorecard
  Operator->>Pause: forwardPauseCall(unpauseAll)
```

---

## 🔌 Energy & compute governance

* **Stellar lattice thermostat** – The CLI enforces `energyProtocols.stellarLattice.safetyMarginPct`, refusing to route jobs if predicted Dyson Swarm draw would exceed the margin. It prints redline warnings whenever utilisation > 87.5% of captured GW.
* **Kelvin guardrails** – Reward temperature (Kelvin) must stay between 0.35 and 0.92; the orchestrator double checks the manifest and telemetry and aborts if the Thermostat would fall outside the band.
* **Regional energy arbitration** – Earth, Mars, and Orbital clusters provide available GW, storage, and latency; the CLI sorts workloads accordingly and reports energy debt so operators can top-up storage before dispatching long-running swarms.
* **Compute rollup** – All compute capacity is measured in exaFLOPs and agent counts. A reconciliation matrix confirms that per-region totals equal the Interstellar Council view and Dyson programme requirements.

---

## 🛡️ Governance and safety levers

* **Absolute owner control** – Every mutating action uses owner-gated Phase 8 manager calls. The Safe batch positions `setGlobalParameters`, `setGuardianCouncil`, `setSystemPause`, `registerDomain`, `registerSentinel`, `registerCapitalStream`, `setSelfImprovementPlan`, and dual `forwardPauseCall` payloads (pause/unpause) at the top of the queue.
* **Guardian coverage** – Sentinels guarantee coverage seconds ≥ guardian review window; the CLI recalculates coverage deltas and warns if any fall below threshold.
* **Bridge sentries** – Interplanetary bridge latency/bandwidth metrics are embedded into telemetry and displayed in the UI. Paired sentinel actions ensure that, if latency rises above thresholds, the pause bundle can isolate the affected federation instantly.
* **Self-improvement charter** – `selfImprovement.planHash` and `planURI` are hashed and referenced in the Safe batch. Operators get a runbook section explaining how to log future executions (`recordSelfImprovementExecution`).

---

## 📦 Artefacts in this directory

| Path | Purpose |
| --- | --- |
| `config/kardashev-ii.manifest.json` | Canonical manifest describing federations, energy, compute, sentinels, capital streams, bridges, and Dyson Phases. |
| `scripts/run-kardashev-demo.ts` | Orchestrator CLI that validates the manifest, computes dominance/energy metrics, and emits Safe payloads + diagrams. |
| `scripts/ci-validate.ts` | CI harness ensuring outputs, README sections, and manifest invariants stay in sync. |
| `output/kardashev-*` | Pre-generated artefacts (Safe batch, telemetry, Mermaid, runbook) used by UI and ops playbooks. |
| `index.html` | Zero-build dashboard that renders telemetry, Mermaid diagrams, and operator controls in any static server. |
| `ui/` | Assets powering the static dashboard (styles, JavaScript modules). |

---

## 🧪 Verification rituals

1. **Local** – run `npm run demo:kardashev-ii:orchestrate` and confirm no warnings. Inspect `output/kardashev-telemetry.json` and ensure `energyIntegrity.tripleCheck === true` and `governance.ownerOverridesReady === true`.
2. **CI** – `npm run demo:kardashev-ii:ci` executes the orchestrator in check mode, validates README headings, ensures Mermaid code fences exist, and fails on drift.
3. **Runtime** – Serve the UI and click “Trigger Pause Simulation” to confirm pause/unpause calldata toggles update the status badge (the UI reads `kardashev-telemetry.json` and `kardashev-orchestration-report.md`).
4. **Manual** – Operators copy/paste the Safe batch into a production Safe, verify the prefilled manager/system pause addresses, and stage the transaction.

---

## 🧠 Reflective checklist for owners

Run `npm run demo:kardashev-ii:orchestrate -- --reflect` to receive:

- ✅ Recomputed manifest hash vs `interstellarCouncil.manifestoHash`.
- ✅ Confirmation that guardian coverage ≥ guardian review window.
- ✅ Energy debt matrix (Earth, Mars, Orbital) all ≤ 0.
- ✅ Bridge latency vs Dyson failsafe latency.
- ✅ Pause bundle parity (pause/unpause both targeting configured SystemPause).

Only sign the Safe transaction after all checks print green.

---

## 📡 Interoperability hooks

* **Bridges** – Telemetry includes `bridges.latencySeconds` + `bridges.bandwidthGbps`. The UI surfaces warnings if delay threatens cadence.
* **Data plane** – `setGlobalParameters` configures the knowledge graph address while the manifest tracks `knowledgeGraphURI` for human-readable provenance, so operators can redirect identity registries or swap subgraphs instantly.
* **Energy oracle** – `energyProtocols.stellarLattice` parameters match the RewardEngineMB thermostat. Set new energy budgets via the Safe batch to immediately retune incentives.

---

## ♻️ Maintenance playbook

1. Update `config/kardashev-ii.manifest.json` with new domains/sentinels.
2. Run `npm run demo:kardashev-ii:orchestrate` to regenerate artefacts.
3. Commit the regenerated files (CI will fail if outputs don’t match the manifest).
4. Notify guardians with the refreshed `output/kardashev-orchestration-report.md`.
5. Run `npm run owner:mission-control` (existing v2 tooling) if you want to diff live contract state vs generated calldata.

---

**Result**: AGI Jobs v0 (v2) becomes the civilisation-scale operating system a Kardashev-II steward needs – with clarity, safety, and absolute control packaged for non-technical operators.
