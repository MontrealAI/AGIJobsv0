# 🎖️ Solving α-AGI Governance 👁️✨ — Grand Demonstration

The **α-AGI Governance Command Center** shows how a non-technical leader can wield **AGI Jobs v0 (v2)** to stand up, operate, and continuously harden a civilisation-scale governance stack. Everything here is pure AGI Jobs v0 (v2): audited contracts, owner tooling, validator automations, Hamiltonian telemetry, and UI surfaces that already exist in this repository. We simply orchestrate them into a turnkey experience that feels like commanding a superintelligent machine.

> **Goal.** Empower a single operator to spin up a sovereign α-field, deploy multi-nation policies, steer validator swarms, and modulate economic energy flows in minutes – without writing a line of Solidity or touching raw RPC calls.

## 1. What ships in this demo

| Layer | Asset | Purpose |
| --- | --- | --- |
| User cockpit | `apps/enterprise-portal` → `/agi-governance` | Guided control room that wraps the existing Solving Governance experience with energy analytics, scripts, and safeguards designed for non-technical decision makers. |
| Command scripts | `npm run demo:agi-governance:run` | Boots a full α-governance rehearsal on Hardhat: nations fund policies, validators commit/reveal, owner pauses/unpauses, and Hamiltonian feedback loops calibrate stake thresholds. |
| Analytics | `demo/agi-governance/lib/transcript.ts` | Shared physics + game theory engine that turns raw contract events into Gibbs free energy, Hamiltonian curvature, validator entropy, and antifragility deltas. |
| Evidence export | `demo/agi-governance/export/latest.json` | Machine-readable transcript with every action, owner decision, validator vote, and computed thermodynamic signal. |
| CI guardrail | `.github/workflows/demo-agi-governance.yml` | Runs on every PR touching the demo, guaranteeing the rehearsal remains green and the transcript stays well-formed. |

## 2. Zero-friction operator walk-through

1. **Install dependencies once** (from repo root):
   ```bash
   npm install
   npm run compile
   ```

2. **Launch the α-governance orchestration** on the embedded Hardhat network:
   ```bash
   npm run demo:agi-governance:run
   ```

   This command:
   - Deploys StakeManager, ValidationModule, JobRegistry, CertificateNFT, ReputationEngine, DisputeModule, FeePool, and Hamiltonian monitor against the canonical `$AGIALPHA` address.
   - Onboards three nations (Aurora Coalition, Horizon League, Oceanic Union), a policy drafter, and three validators.
   - Stakes the actors, publishes job specs, pushes burn evidence, orchestrates commit–reveal, finalises settlements, pauses/unpauses, and tightens quorum.
   - Updates Hamiltonian thresholds to keep the antifragile loop bound to the Landauer limit.
   - Emits `demo/agi-governance/export/latest.json`, a transcript with energy analytics ready for the UI.

3. **Open the command center**:
   ```bash
   cd apps/enterprise-portal
   npm run dev
   ```
   Visit [http://localhost:3000/agi-governance](http://localhost:3000/agi-governance) to access the full experience. Everything runs client-side using the contracts you just deployed.

4. **Connect any wallet** that has access to the Hardhat fork (default private keys work). The cockpit automatically detects owner privileges and unlocks pause/unpause, quorum updates, thermodynamic tuning, and treasury steering.

## 3. Transcript anatomy

`demo/agi-governance/export/latest.json` contains:

- `jobs` — on-chain job registry snapshots, including hashes, rewards, validator approvals, and outcome states.
- `validators` — per-validator commitments, reveals, stakes, and antifragility scores.
- `ownerActions` — every privileged call executed (pause, unpause, threshold updates, Hamiltonian calibration) with before/after states.
- `timeline` — chronologically ordered events that a non-technical operator can read as a playbook.
- `energy` — Gibbs free energy, Hamiltonian curvature, Landauer bound, dissipation, validator entropy, and cooperation ratios.
- `platform` — addresses, stake thresholds, emission rates, and contract handles so the operator never searches for ABIs.

The UI imports the file directly, so any subsequent run of the script refreshes the presentation instantly.

## 4. Production readiness & safety

- **Owner supremacy.** The script and UI enforce owner-only controls (`pause`, `unpause`, `setRequiredValidatorApprovals`, `setCommitWindow`, `setRevealWindow`, `StakeManager.setMinStake`, `StakeManager.setSlashingPercentages`, `StakeManager.setHamiltonianFeed`). Everything surfaces confirmations and allows instant rollbacks.
- **Hamiltonian guardrails.** We compute and expose the antifragility tensor, Gibbs free energy proximity to the Landauer bound, and validator entropy so the owner knows when to tighten stake or temperature parameters.
- **CI enforcement.** `.github/workflows/demo-agi-governance.yml` executes the orchestration, verifies transcript integrity, and uploads the artefact for audit. Branch protection must keep this workflow mandatory.
- **Composable tooling.** The transcript format is intentionally generic — existing owner scripts (`owner:dashboard`, `owner:command-center`, `hamiltonian:update`) can ingest it for change tickets or monitoring dashboards.

## 5. Extending the demo

- Point the script at Sepolia or mainnet RPC by exporting `HARDHAT_NETWORK=<network>` and configuring `deployment-config/<network>.json` with live addresses.
- Drop additional nations or validator swarms into `demo/agi-governance/data/scenario.json` — the orchestration automatically scales.
- Pipe the transcript into `scripts/v2/ownerControlAtlas.ts` or the Hamiltonian tracker to blend governance rehearsal data with production telemetry.

This demo is intentionally ambitious. It compresses what used to be weeks of protocol wiring, simulation, and tooling into a single command plus a browser tab. That is the power of AGI Jobs v0 (v2).
