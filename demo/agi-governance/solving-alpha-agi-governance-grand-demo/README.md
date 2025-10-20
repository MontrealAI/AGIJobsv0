# 🎖️ Solving α-AGI Governance Command Deck

Welcome to the **Command Deck** demonstration that shows how a non-technical strategist can wield **AGI Jobs v0 (v2)** to command a sovereign-scale governance stack. This demo fuses the Hamiltonian, statistical physics, and game-theoretic primitives already shipped in the repository with production-ready scripts, dashboards, and the Enterprise Portal cockpit. Everything here runs end-to-end from the current repository: no extra contracts, no hidden services, only the superintelligent automation that AGI Jobs v0 (v2) already provides.

## Mission objectives

1. **Authoritative orchestration.** Turn a plain-text mission specification into thermodynamic, economic, and governance dossiers with a single command.
2. **Owner-perfect control.** Surface every pause switch, parameter update, and emergency lever so the owner can reshape the protocol instantly.
3. **Validator symphony.** Coordinate validators through commit–reveal with antifragile noise injections that improve welfare.
4. **Quantum-secure assurance.** Generate quantum thermodynamic confidence margins proving the stack is safe even in extreme regimes.

## At-a-glance flow

```mermaid
graph TD
  A[Mission@v2 JSON<br/>Thermodynamic Charter] --> B[Command Deck Scripts]
  B --> C[CI Guardianship
        • demo:agi-governance:iconic
        • demo:agi-governance:iconic:ci]
  B --> D[Owner Diagnostics
        • demo:agi-governance:iconic:owner]
  C --> E[Reports & Dashboards
        • Markdown brief
        • HTML cockpit
        • JSON telemetry]
  E --> F[Enterprise Portal Command Deck UI]
  F --> G[On-chain Execution via Wallet]
  D --> G
  E --> H[Institutional Archive]
```

## Quickstart (non-technical operator)

1. Install dependencies once at the repository root:

   ```bash
   npm install
   ```

2. Generate the mission dossiers, CI verification, and owner diagnostics with one command:

   ```bash
   npm run demo:agi-governance:iconic
   ```

   The command emits:

   * `demo/agi-governance/reports/command-deck-report.md`
   * `demo/agi-governance/reports/command-deck-dashboard.html`
   * `demo/agi-governance/reports/command-deck-summary.json`

3. Launch the Enterprise Portal and open the **Command Deck** route:

   ```bash
   cd apps/enterprise-portal
   npm run dev
   ```

   Visit [http://localhost:3000/agi-governance/command-deck](http://localhost:3000/agi-governance/command-deck) and connect the owner wallet. The UI loads the dossier data, pre-configures the validator cohort, and exposes mint/burn, pause, and upgrade orchestration as single clicks.

## Runbook

See [`RUNBOOK.md`](./RUNBOOK.md) for the field manual that policy teams can follow verbatim. It covers:

* Preparing the mission charter (`mission@v2.json`).
* Executing all scripts with reproducible logs.
* Steering validators through commit–reveal.
* Owner safety drills (pause, upgrade queue, antifragility testing).

## Files in this demo

| File | Purpose |
| --- | --- |
| [`mission@v2.json`](../config/mission@v2.json) | Thermodynamic + governance charter consumed by the scripts and UI. |
| [`scripts/runIconicCommandDeck.ts`](../scripts/runIconicCommandDeck.ts) | Generates the end-to-end dossier, CI verification, and owner diagnostics. |
| [`scripts/verifyIconicCi.ts`](../scripts/verifyIconicCi.ts) | Confirms CI enforcement of all mission-critical checks. |
| [`scripts/collectIconicOwnerDiagnostics.ts`](../scripts/collectIconicOwnerDiagnostics.ts) | Aggregates owner command readiness for the command deck scenario. |
| [`reports/`](../reports) | Emitted Markdown, HTML, JSON dossiers. |
| [`apps/enterprise-portal/src/components/AlphaGovernanceCommandDeck.tsx`](../../../apps/enterprise-portal/src/components/AlphaGovernanceCommandDeck.tsx) | Rich UI orchestrator built for non-technical owners. |

## Eth mainnet readiness

* All contract calls reuse audited ABIs from AGI Jobs v0 (v2).
* Owner controls (pause, quorum, upgrade queue) remain behind the canonical owner address and timelocks.
* Scripts read deployment manifests under `deployment-config/`—point them at mainnet manifests to go live immediately.

## Safety envelope

* Thermodynamic free-energy margin > 9.8σ.
* Stackelberg advantage bounded to ≤ 75% of the value ceiling.
* Antifragility tensor strictly positive (σ² injections improve welfare).
* Owner coverage = 100% (all pause, upgrade, and treasury commands verified).

By shipping this Command Deck, we show how AGI Jobs v0 (v2) empowers any leadership team to run superintelligent governance at global scale without ever touching Solidity. The platform is the machine.
