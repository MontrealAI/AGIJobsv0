# 🎖️ Solving α-AGI Governance 👁️✨ — First-Class Demonstration

> **Mission:** prove that AGI Jobs v0 (v2) lets a non-technical owner summon, command, and continuously govern a civilisation-scale α-AGI labour constellation with production-grade assurance.

The **AGI Governance Demonstration** compresses the entire AGI Jobs v0 (v2) stack into a guided, push-button experience. It binds thermodynamic optimisation, Hamiltonian resource choreography, formal safety envelopes, and blockchain-governed incentives into a single operator console that anyone can run. The result is a deterministic showcase that the platform operates as the self-evolving intelligence engine capable of bending global coordination to the contract owner’s directives.

## Why this demo is different

- **Superintelligent leverage, human interface.** Every script emits natural-language mission reports that walk a non-technical owner through free-energy optimisation, stake-weighted policy updates, and antifragile multi-agent equilibria.
- **Thermodynamics + governance in code.** Hamiltonian energy flows, Gibbs free energy margins, and Landauer-aligned burn policies are computed live from scenario manifests so operators see the physics behind the incentives.
- **Owner-first absolutism.** Pausing, upgrading, and parameter steering remain entirely under the owner’s keys. The toolkit exports timelocked command bundles, slashing curves, and sentinel dashboards proving the owner can reconfigure every subsystem instantly.
- **CI-proven production fidelity.** A dedicated workflow (`demo-agi-governance.yml`) enforces the new demo, verifies the v2 CI contract, and publishes auditable reports on every push and pull request.

## Contents

| Path | Purpose |
| --- | --- |
| [`config/mission@v1.json`](config/mission@v1.json) | Canonical governance, physics, and treasury manifest for the demo. |
| [`scripts/executeDemo.ts`](scripts/executeDemo.ts) | Main orchestrator: loads the manifest, performs physics/game-theory calculations, verifies owner supremacy, and emits the governance dossier. |
| [`scripts/verifyCiStatus.ts`](scripts/verifyCiStatus.ts) | Audits `.github/workflows/ci.yml` to prove the v2 CI shield is intact (correct jobs, contexts, concurrency, and thresholds). |
| [`reports/`](reports) | Generated artefacts (`governance-demo-report.md`, `ci-verification.json`, etc.) are written here so they can be archived from CI. |
| [`RUNBOOK.md`](RUNBOOK.md) | Non-technical, step-by-step launch instructions with browser/Etherscan fallbacks. |

## Quick start

```bash
npm run demo:agi-governance
```

The command generates `reports/governance-demo-report.md` with:

1. Thermodynamic energy accounting (Gibbs free energy, Hamiltonian convergence envelope, Landauer burn calibration).
2. Triple-verified game-theory equilibrium analysis (replicator dynamics simulation + closed-form solver + Monte-Carlo stress sampling).
3. Owner control drilldown (pause/unpause, parameter upgrades, treasury manoeuvres, sentinel confirmations).
4. Blockchain deployment checklist targeting Ethereum mainnet-level infrastructure.
5. Assurance diagnostics (Landauer adequacy ratios, symmetrised payoff eigenvalues, and automated owner authority assertions).

Then run the CI verification layer:

```bash
npm run demo:agi-governance:ci
```

This command checks that the repository’s v2 CI workflow still enforces the mandatory green path (`lint`, `tests`, `foundry`, `coverage`, `CI summary` contexts), concurrency guards, and environment seals. Any drift fails loudly.

## Empowering non-technical operators

- **No manual math.** The orchestrator handles every computation—from Hamiltonian stability tests to discount factor tolerances—and explains the results plainly.
- **Copy‑paste governance.** Ready-made command snippets let the owner update modules using `npm run owner:*` scripts, Etherscan transactions, or Safe batch actions.
- **Evidence by default.** Every run produces timestamped artefacts that prove compliance with thermodynamic limits, governance divergence caps, and CI enforcement. Attach the files to board packets or regulator disclosures without extra work.
- **Automatic diagnostics.** The dossier now embeds Landauer adequacy ratios, eigenvalue condition numbers, and owner assertion checks so non-technical operators can certify control without bespoke analysis.

## Extending the mission

1. Edit `config/mission@v1.json` to change stake weights, treasury temperature targets, or replicator strategy mixes.
2. Re-run `npm run demo:agi-governance` to produce a new report. The script automatically recalibrates the energy tensor, Hamiltonian flows, and antifragility metrics.
3. For on-chain execution, follow the `RUNBOOK.md` instructions to deploy AGI Jobs v2 using only mainnet-grade infrastructure and update parameters with the provided owner scripts.

## Deterministic provenance

Every commit that touches this demo is forced through:

- `npm run demo:agi-governance`
- `npm run demo:agi-governance:ci`
- Root `ci (v2)` workflow gates (`Lint & static checks`, `Tests`, `Foundry`, `Coverage thresholds`, `CI summary`).

Together they guarantee the demo stays production-ready, antifragile, and entirely under owner control—exactly the standard expected from civilisation-scale AGI coordination.
