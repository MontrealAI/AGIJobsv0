# OMNIGENESIS GLOBAL SOVEREIGN SYMPHONY

> Fully automatable CI drill that exhibits a civilisation-scale coordination engine built entirely from the deterministic tooling already present in AGI Jobs v0 (v2).

---

## Mission Charter

- **Purpose** – Fuse global macroeconomic planning, decentralised governance, and cross-sector labour orchestration into a single end-to-end runbook that can be executed without bespoke code changes.
- **Scope** – Bootstrap an intergovernmental stabilisation pact spanning energy, food security, climate resilience, and economic stimulus initiatives. The drill uses the one-box orchestrator, validator quorums, thermodynamic incentives, and mission reporting surfaces that ship with this repository.
- **Key Outcomes**
  1. Deterministic deployment of the v2 protocol stack and actors defined in `deployment-config` and `demo/asi-takeoff/config`.
  2. Automated execution of the ASI take-off loop with the [Omnigenesis project plan](./project-plan.json) to surface receipts, thermodynamic telemetry, and governance kits under `reports/<network>/omnigenesis-global-symphony`.
  3. Coordinated post-processing that renders owner dashboards, mermaid governance atlases, and thermodynamics dossiers, giving executive control rooms verifiable levers across global corridors.

---

## CI Automation Blueprint

The [`Makefile`](./Makefile) and [`bin/omnigenesis-ci.sh`](./bin/omnigenesis-ci.sh) wrapper wire together existing npm scripts to deliver a single-button CI rehearsal. The pipeline intentionally reuses only first-class commands that already ship in `package.json`.

```mermaid
flowchart LR
  subgraph Bootstrap
    A[npm run compile]
    B[npx hardhat run scripts/v2/deployDefaults.ts]
  end
  subgraph MissionDrill
    C[ASI Take-Off Demo\n(Omnigenesis Plan)]
    D[Governance Kit Renderer]
  end
  subgraph ExecutiveSurfaces
    E[Owner Mission Control]
    F[Owner Atlas]
    G[Thermodynamics Report]
    H[Monitoring Sentinels]
  end
  A --> B --> C --> D
  D --> E
  D --> F
  C --> G
  C --> H
```

---

## Quickstart (Local / CI Identical)

1. Copy environment defaults:
   ```bash
   cp demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY/env.example .env
   ```
2. Execute the CI macro:
   ```bash
   make -C demo/OMNIGENESIS-GLOBAL-SOVEREIGN-SYMPHONY ci
   ```
3. Review generated artefacts:
   - `reports/localhost/omnigenesis-global-symphony/receipts/mission.json`
   - `reports/localhost/omnigenesis-global-symphony/omnigenesis-report.md`
   - `reports/localhost/omnigenesis-global-symphony/governance-kit.md`
   - `reports/localhost/omnigenesis-global-symphony/owner-mission-control.md`
   - `reports/localhost/omnigenesis-global-symphony/thermodynamics-report.md`

The `ci` target is deterministic and friendly to GitHub Actions: every command runs headlessly and terminates with non-zero exit codes on failure, unlocking policy-controlled rollouts.

---

## Omnigenesis Governance Conductor

```mermaid
sequenceDiagram
  participant Planner as Global Coordination Council
  participant Orchestrator as One-Box Orchestrator
  participant Registry as JobRegistry & StakeManager
  participant Validators as Validator Quorum
  participant Treasury as RewardEngineMB
  participant Observers as Reporting & Thermodynamics

  Planner->>Orchestrator: Submit Omnigenesis plan (JSON)
  Orchestrator->>Registry: Register composite jobs & stake terms
  Registry-->>Orchestrator: Mission configuration receipts
  Orchestrator->>Validators: Dispatch validation windows
  Validators->>Registry: Finalise receipts & disputes
  Registry->>Treasury: Trigger budget disbursement per entropy controls
  Orchestrator->>Observers: Emit mission dossier + thermodynamic telemetry
  Observers-->>Planner: Governance kit & owner dashboard bundles
```

---

## Global Economic Harmoniser

```mermaid
graph TB
  subgraph Strategic Layers
    L1[Emergency Energy Grid Stabilisation]
    L2[Food Security & Agri Mesh]
    L3[Climate Resilience Retrofits]
    L4[Universal Economic Stimulus]
  end
  subgraph Protocol
    P1[contracts/v2]
    P2[scripts/v2/asiTakeoffDemo.ts]
    P3[demo/aurora/aurora.demo.ts]
    P4[reports/]
  end
  subgraph Governance Utilities
    G1[npm run owner:mission-control]
    G2[npm run owner:atlas]
    G3[npm run monitoring:validate]
  end
  L1 --> P2
  L2 --> P2
  L3 --> P2
  L4 --> P2
  P2 --> P3 --> P4
  P4 --> G1
  P4 --> G2
  P4 --> G3
```

---

## Multi-Vector Verification Philosophy

- **Thermodynamic Assurance** – `npm run thermodynamics:report` tests entropy thresholds against the Omnigenesis job lattice, ensuring incentives remain bounded even under plan perturbations.
- **Governance Integrity** – `npm run owner:mission-control` and `npm run owner:atlas` verify SystemPause, thermostat, and treasury wiring against the repository's owner-control doctrine.
- **Observability Guardrails** – `npm run monitoring:validate` confirms that sentinels defined under `monitoring/` remain green against the freshly generated receipts, providing continuous compliance signals.
- **CI Traceability** – Every target prints direct file paths and JSON payloads to enable auditors to reproduce results solely from repository artefacts.

---

## Artefact Map

```mermaid
gantt
title Omnigenesis CI Runbook
section Bootstrap
Compile & Deploy Defaults :done, a1, 0, 3m
section Mission Execution
Run ASI Take-Off Demo       :active, a2, 0, 7m
Render Governance Kit       :after a2, 2m
section Executive Briefings
Owner Dashboards            :after a2, 1m
Thermodynamics Report       :after a2, 1m
Monitoring Validation       :after a2, 1m
```

---

## Further Reading

- [`RUNBOOK.md`](./RUNBOOK.md) – the operator drill for mainnet-level rehearsals.
- [`project-plan.json`](./project-plan.json) – deterministic Omnigenesis macroeconomic specification.
- [`bin/omnigenesis-ci.sh`](./bin/omnigenesis-ci.sh) – shell harness that binds the CI pipeline together using only existing npm scripts.
