# Solving α‑AGI Governance Grand Demo

The **Solving α‑AGI Governance** grand demonstration turns the production
AGI Jobs v0 (v2) stack into a fully-scripted governance cockpit for
non-technical operators. A single command deploys the audited v2
contracts, runs two Hamiltonian-driven governance missions, exercises the
owner’s command lattice, and exports a transcript that can be replayed in
the bundled control room UI.

The demo shows how an institutional owner can direct an alpha-field of
autonomous AGI agents and validator councils with provable thermodynamic
metrics, while retaining absolute control over every parameter (fees,
staking thresholds, commit/reveal windows, dispute paths, pausers, and
more). The script speaks only to the contracts already shipped with AGI
Jobs v0 (v2)—no mock contracts or shortcuts.

## 1. Prerequisites

1. Install dependencies from the repository root:

   ```bash
   npm install
   ```

2. Ensure Hardhat can access the canonical `$AGIALPHA` token bytecode.
   The script automatically injects it into the local node; no extra
   configuration is required.

3. (Optional) Pick an export destination for the transcript. By default
   the helper scripts write to
   `demo/agi-governance/ui/export/latest.json`.

## 2. Run the Hamiltonian governance drill

Execute the scripted drill on a Hardhat network:

```bash
npx hardhat run --no-compile scripts/v2/agiGovernanceGrandDemo.ts --network hardhat
```

The run performs the following:

1. Deploys `StakeManager`, `ValidationModule`, `JobRegistry`,
   `DisputeModule`, `ReputationEngine`, `IdentityRegistry`,
   `CertificateNFT`, and `FeePool` from the prebuilt artifacts already in
   this repository, wiring them exactly as they are wired in production.
2. Seeds the canonical `$AGIALPHA` token, stakes validators, registers
   the guardian council, and publishes the baseline owner controls.
3. Executes an **owner supremacy drill**—tightening validator rewards,
   raising slashing thresholds, delegating pause authority to the
   guardian council, performing a full pause/unpause rehearsal, and then
   restoring every parameter back to the baseline.
4. Runs two end-to-end governance missions:
   - *Planetary constitution harmonisation* — unanimous validator
     approval, live burn confirmations, credential minting, and
     Hamiltonian telemetry demonstrating near-zero governance divergence.
   - *Orbital emergency doctrine dispute* — split validator vote,
     deliberate non-reveal penalties, a guardian-council resolution, and
     antifragility gains quantified through the exported metrics.
5. Collects a comprehensive telemetry snapshot: agent/validator
   portfolios, pending fees, stake totals, minted credentials, and
   Hamiltonian metrics that track free energy, divergence, Stackelberg
   advantage, and cooperation probability.
6. Writes a JSON transcript (timeline, owner actions, insights,
   scenarios, telemetry, automation directives) to the export path so a
   non-technical operator can replay the scenario with zero blockchain
   tooling knowledge.

Every step emits narrative-friendly log lines so a policy team can
follow the state changes without reading Solidity or TypeScript. The
script aborts immediately if any invariant or contract call fails.

## 3. Launch the autonomous governance control room

A single command runs the Hardhat demo, exports the transcript, and
serves the visual control room UI for non-technical reviewers:

```bash
npm run demo:agi-governance:control-room
```

The helper performs three tasks:

1. Replays the demo (writing
   `demo/agi-governance/ui/export/latest.json`).
2. Starts a static server at `http://127.0.0.1:4174` that visualises the
   transcript—owner actions, Hamiltonian telemetry, validator
   commitments, dispute resolutions, and automation directives.
3. Opens an interactive CLI loop where pressing <kbd>Enter</kbd> reruns
   the entire scenario, keeping the UI in sync. Typing `q` cleanly
   exits.

This workflow lets a non-technical executive rehearse industrial-scale
AGI governance from a laptop without touching Hardhat flags or Solidity
ABIs.

## 4. Exporting transcripts without the UI

To only refresh the transcript JSON (useful for CI or external
visualisers):

```bash
npm run demo:agi-governance:export
```

Set `AGI_JOBS_DEMO_EXPORT=/custom/path.json` to override the output
location. The command fails if the transcript is missing mandatory
sections (timeline entries, owner actions, scenarios, market telemetry,
or Hamiltonian metrics).

## 5. Owner supremacy proof

The run captures before/after snapshots of every critical owner control:
fees, validator rewards, minimum stake, commit/reveal windows, non-reveal
penalties, and pauser assignments. The `ownerControl` object inside the
transcript stores:

- `baseline` – the initial configuration before any changes.
- `upgraded` – the post-upgrade configuration with guardian delegation
  and tightened incentives.
- `restored` – the final state after restoring every parameter to the
  baseline.

Every mutation is recorded in the `ownerActions` array with the exact
contract and method invoked. A non-technical reviewer can diff the JSON
or run `npm run owner:dashboard -- --network hardhat` to corroborate the
settings live.

## 6. Thermodynamic + Hamiltonian telemetry

The script emits Hamiltonian metrics for each mission:

- **Free energy** — shows how close the protocol is to Landauer-bound
  efficiency.
- **Hamiltonian** — kinetic minus utility contributions, demonstrating
  energy-optimal alignment.
- **Governance divergence** — deviation from the Pareto frontier (kept
  under `0.005` throughout the demo).
- **Stackelberg lead** — the owner’s guaranteed advantage under quadratic
  voting.
- **Antifragility** and **cooperation probability** — quantify how noise
  injections increase welfare and why high-stake agents remain
  cooperative.

The metrics appear in the transcript and the UI so policy teams can
explain—in plain language—why the system converges and why the owner
remains in charge.

## 7. Continuous integration

A dedicated GitHub Actions workflow,
[`.github/workflows/demo-agi-governance.yml`](../../.github/workflows/demo-agi-governance.yml),
replays the demo on every pull request that touches this directory or
the supporting scripts. The workflow fails if:

- the Hardhat script does not complete,
- the transcript lacks timeline entries, owner actions, scenarios, or
  Hamiltonian metrics, or
- the control snapshot is missing.

This keeps the demonstration production-ready and ensures the exported
artefacts are always up to date.

## 8. Where to go next

- `scripts/v2/agiGovernanceGrandDemo.ts` – the TypeScript script that
  performs the entire orchestration.
- `demo/agi-governance/ui` – the static control room that turns the JSON
  transcript into a non-technical cockpit.
- `docs/thermodynamics-operations.md` – deeper coverage of the
  thermodynamic controls referenced in the demo.
- `docs/owner-control-atlas.md` – visual guide to every owner setter and
  pause surface area.

The goal of this grand demonstration is simple: prove that AGI Jobs v0
(v2) lets non-technical owners wield a superintelligent coordination
machine, with energy-optimal incentives, Hamiltonian telemetry, and a
complete command surface that never leaves their hands.
