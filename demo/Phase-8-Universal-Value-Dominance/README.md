# Phase 8 — Universal Value Dominance Demo

> **Mission**: let a non-technical governor command a superintelligent, DAO-governed economy with a single console. This demo
> packages governance calldata, observability, safety guardrails, and self-improving automation into one copy/paste friendly
> experience powered by **AGI Jobs v0 (v2)**.

---

## 🚀 Quickstart for operators

1. **Install dependencies** (one-time):
   ```bash
   npm ci
   ```
2. **Generate calldata & telemetry**:
   ```bash
   npm run demo:phase8:orchestrate
   ```
   You will receive:
   * Encoded `setGlobalParameters`, `setGuardianCouncil`, `setSystemPause`, `registerDomain`, `registerSentinel`, and
     `registerCapitalStream` calldata.
   * A human-readable network telemetry report with resilience, value flow, sentinel coverage, and self-improvement guards.
   * A copy/paste mermaid system map for status updates and incident briefings.
3. **Launch the control surface UI** (no build step required):
   ```bash
   npx serve demo/Phase-8-Universal-Value-Dominance
   ```
   Navigate to `http://localhost:3000` to view the live dashboard.
4. **Enforce readiness in CI**:
   ```bash
   npm run demo:phase8:ci
   ```
   This validates the manifest schema, README sections, and UI mermaid placeholders. The same check is enforced on every PR
   via the `ci (v2) / Phase 8 readiness` workflow.

---

## 🧭 Why this demo matters

* **Universal authority with hard guardrails** – the new `Phase8UniversalValueManager` contract keeps the owner in absolute
  control of domains, sentinel policies, capital streams, and emergency pause forwarding.
* **Planetary telemetry in one command** – governance can read resilience, autonomy, value flow, and sentinel coverage from the
  CLI and UI without touching Solidity or Hardhat.
* **Self-improving and self-checking** – playbooks and guardrails encoded in the manifest let the operator launch automated
  retraining and adversarial stress-tests while ensuring autonomy stays bounded.
* **Mermaid-first storytelling** – every run emits a rich diagram to explain how trillions in value flow through the
  superintelligent mesh.

---

## 🧱 Smart contract control surface

`contracts/v2/Phase8UniversalValueManager.sol` introduces a governance-only registry for Phase 8:

* **Global parameters** – `setGlobalParameters`, `updateManifesto`, and `updateRiskParameters` let the owner reshape treasury,
  vaults, knowledge graphs, and risk tolerances atomically.
* **Sentinel lattice** – register, update, and toggle sentinels that monitor domains. Each sentinel enforces coverage windows
  and can be routed through the shared `SystemPause` via `forwardPauseCall`. Domain bindings are configured via
  `setSentinelDomains` so every sentinel only monitors approved dominions.
* **Capital streams** – register autonomous treasury programs with annual budgets and expansion curves. Governance can pause,
  re-target, or re-bind the domain list at any time with `setCapitalStreamDomains`.
* **Domain dominion** – configure orchestration endpoints, vault limits, and autonomy bps per domain while guaranteeing slug
  uniqueness and heartbeat invariants. Domains, sentinels, and streams can also be removed entirely (`removeDomain`,
  `removeSentinel`, `removeCapitalStream`) with automatic pruning of bindings.

The contract emits deterministic events so dashboards, subgraphs, and auditors can stream changes. All mutative calls remain
`onlyGovernance`, satisfying the requirement that the owner can reconfigure everything – including pausing – at will.

---

## 🧠 Self-improvement kernel

The manifest encodes a self-improvement plan:

* **Playbooks** trigger weekly hyperparameter evolution and hourly stress-tests, each bound by cryptographic guardrails (checksums,
  zk-proof-of-alignment, multi-agent cross-checks).
* **Autonomy guard** enforces ≤8,000 bps autonomy, a 15-minute human override window, and escalations through guardian council,
  DAO emergency levers, and sentinel lockdown.
* **Validator feedback loops** reward resilient domains (resilience >0.9) with higher capital allocation while surfacing low
  resilience for governance review.

Running `npm run demo:phase8:orchestrate` surfaces these guardrails alongside calldata so operators never miss a safety step.

---

## 🛰️ Demo control surface

Open [`index.html`](./index.html) to explore the fully client-side control room:

* Planetary stats (value flow, budget, resilience, sentinel coverage).
* Domain cards with autonomy bps, resilience, heartbeat, and skill badges.
* Sentinel lattice view with live coverage, sensitivity, and domain bindings (auto-highlighted when a domain loses coverage).
* Capital stream portfolio with annual budgets, vault routing, and linked dominions.
* Self-improvement playbooks and guardrails rendered with owner addresses.
* An auto-generated Mermaid diagram illustrating governance, sentinels, and capital flow.

---

## 🧪 Phase 8 CI enforcement

A new job in `.github/workflows/ci.yml` named **Phase 8 readiness** runs on every PR and on `main`:

1. Installs dependencies via `npm ci`.
2. Executes `npm run demo:phase8:ci` to validate the manifest, README, and UI hooks.
3. Publishes a summary in the GitHub Checks UI so branch protection (`ci (v2) / Phase 8 readiness`) must be green before
   merging.

---

## 🗺️ Mermaid snapshot

```mermaid
graph TD
  Governance[[Guardian Council]] --> Manager(Phase8UniversalValueManager)
  Manager --> Treasury[[Universal Treasury]]
  Manager --> Sentinels{Sentinel lattice}
  Manager --> Streams[[Capital Streams]]
  Streams --> ClimateStream[[Climate Stabilization Endowment]]
  Streams --> ResilienceStream[[Planetary Resilience Fund]]
  Streams --> InnovationStream[[Innovation Thrust Catalyst]]
  Manager --> Finance([Planetary Finance Mesh])
  Manager --> Climate([Climate Harmonizer Array])
  Manager --> Health([Health Sovereign Continuum])
  Manager --> Infrastructure([Infrastructure Synthesis Grid])
  Manager --> Knowledge([Knowledge Lattice Nexus])
```

---

## 📚 Related orchestration hooks

* [`demo/Phase-8-Universal-Value-Dominance/scripts/run-phase8-demo.ts`](./scripts/run-phase8-demo.ts) – generates calldata,
  telemetry, and the mermaid diagram. Outputs include per-sentinel and per-stream domain binding calls plus deterministic
  removal calldata so governors can rehearse reconfigurations.
* [`demo/Phase-8-Universal-Value-Dominance/scripts/validate-phase8-config.ts`](./scripts/validate-phase8-config.ts) – schema
  validation enforced by CI.
* [`orchestrator/extensions/phase8.py`](../../orchestrator/extensions/phase8.py) – runtime adapter so Python orchestrators can
  consume Phase 8 manifests (see below).

---

## 🧠 Orchestrator extension (Python)

The orchestrator gains a `Phase8DominionRuntime` helper that reads the manifest, scores domains, tracks sentinel coverage, and
annotates every step with governance guardrails. This powers non-technical users: they simply point the orchestrator at the JSON
snapshot and receive autonomous routing with human-readable rationales.

---

## ✅ Ready for Universal Value Dominance

* Governance owns every parameter, stream, sentinel, and pause lever.
* Telemetry, calldata, UI, and guardrails are generated via two npm commands.
* CI blocks merges without a validated manifest and UI surface.
* Non-technical operators can command the Phase 8 economy using only this directory.
