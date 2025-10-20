# Alpha-Meta Meta-Agentic Mission Runbook

This runbook enables a non-technical owner to execute the entire Alpha-Meta Sovereign Hypergraph demonstration. Every step uses first-class tooling shipped with AGI Jobs v0 (v2) and produces immutable artefacts for auditors, regulators, and partners.

## 0. Prerequisites

- **Node.js 20.18.1** (matching `package.json#engines`).
- **npm 10.x**.
- **Docker + Docker Compose** (for dashboards).
- **A browser wallet** (MetaMask/Rabby) configured for `http://127.0.0.1:8545` when using the local Anvil chain.
- Run `npm install` in the repository root if dependencies are missing.

Validate toolchain:

```bash
node --version
npm --version
docker --version
docker compose version
```

## 1. Launch the Alpha-Meta mission

```bash
demo/alpha-meta/bin/launch.sh
```

The launcher orchestrates:

1. First-class operating system rehearsal (`demo:agi-os:first-class`).
2. Alpha-Meta dossier computation (`demo:alpha-meta:full`, now auto-runs the triangulation cross-check).
3. ASI take-off replay with `config/project-plan.alpha-meta.json`.

Artifacts appear under `demo/alpha-meta/reports/`, `reports/agi-os/`, and `reports/asi-takeoff/`.

Verify the bundle:

- `demo/alpha-meta/reports/alpha-meta-governance-report.md`
- `demo/alpha-meta/reports/alpha-meta-governance-dashboard.html`
- `demo/alpha-meta/reports/alpha-meta-owner-diagnostics.json`
- `demo/alpha-meta/reports/alpha-meta-owner-matrix.md`
- `demo/alpha-meta/reports/alpha-meta-owner-matrix.json`
- `demo/alpha-meta/reports/alpha-meta-triangulation.json`
- `demo/alpha-meta/reports/alpha-meta-triangulation.md`
- `demo/alpha-meta/reports/alpha-meta-manifest.json`
- `reports/agi-os/grand-summary.html`
- `reports/asi-takeoff/mission-bundle/mission.json`

## 2. Start executive dashboards (optional but recommended)

```bash
# Terminal A – API, validator dashboard, enterprise portal
docker compose up validator-ui enterprise-portal

# Terminal B – Owner Console UX
npm --prefix apps/console run dev
```

Open:

- Owner Console – http://localhost:5173
- Enterprise Portal – http://localhost:3001
- Validator Dashboard – http://localhost:3000

Use the deployer wallet (Anvil account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`) or your multisig signer when targeting Sepolia/Mainnet.

## 3. Owner command drill

Demonstrate total control via CLI:

```bash
# Pause immediately
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --action pause --yes

# Inspect owner wiring
npm run owner:verify-control

# Resume operations
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --action unpause --yes

# Regenerate Alpha-Meta owner diagnostics bundle
npm run demo:alpha-meta:owner
```

The generated diagnostics Markdown lists each automation command, exit code, and JSON payload. Any warning or error is highlighted.

The owner matrix Markdown now embeds an "Owner Supremacy" Mermaid graph that visualises which control categories are fully automated, manual, or require remediation. Treat any orange or red nodes as action items before approving production changes.

## 4. Submit a civilisation-scale mission

From the Enterprise Portal:

1. Click **Create Job**.
2. Organisation: `aurora.meta.agi.eth`
3. Title: “Alpha-Meta orbital climate stabiliser”
4. Reward: `56000`
5. Deadline: `21`
6. Description: Outline the mission deliverable.
7. Sign with the owner wallet.

The job appears instantly in both the portal and the validator dashboard, proving that non-technical staff can dispatch missions through guided forms.

## 5. Validator experience (commit/reveal)

On http://localhost:3000:

1. Connect a secondary wallet (e.g. Hardhat account `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`).
2. Select the new job.
3. Commit a vote; the dashboard handles hashing & submission.
4. After the reveal window opens, click **Reveal**.

For CLI parity, replay the deterministic salts:

```bash
npm run demo:agi-os:first-class -- --skip-deploy --stage commit-reveal
```

## 6. Inspect thermodynamic and quantum telemetry

Review the outputs written by the dossier generator:

- `demo/alpha-meta/reports/alpha-meta-governance-summary.json`
- `demo/alpha-meta/reports/alpha-meta-governance-report.md`
- `demo/alpha-meta/reports/alpha-meta-triangulation.md`
- `reports/asi-takeoff/thermodynamics.json`

Focus on:

- **Free-energy margin** – confirm `freeEnergyMarginKJ` exceeds the manifest floor.
- **Antifragility curvature** – ensure the quadratic second derivative remains positive.
- **Quantum confidence** – check `quantum.confidence` vs `quantumConfidenceMinimum` and the `thermoQuantumDeltaKJ` bounds.

## 7. Certify the superintelligent machine

Alpha-Meta is designed to behave as an owner-directed superintelligence. Confirm the following signals inside `alpha-meta-governance-summary.json` and `alpha-meta-triangulation.json`:

- `alphaField.superintelligenceIndex` ≥ `alphaField.verification.superintelligenceMinimum`
- `alphaField.ownerSupremacyIndex` ≥ `alphaField.verification.ownerSupremacyMinimum`
- `alphaField.energyMarginKJ` ≥ `alphaField.verification.energyMarginFloorKJ`
- `alphaField.quantumConfidence` ≥ `alphaField.verification.quantumConfidenceMinimum`
- Triangulation checks (`summary-closed-form`, `replicator-independent`, `jarzynski-consistency`) all report `"passed": true`

When all metrics satisfy their thresholds, the owner holds provable command over the civilisation-scale intelligence surface. Any deviation produces explicit failure text in both JSON and Markdown dossiers so the operator can halt, retune, or redeploy immediately.

## 8. Audit trail and manifest hashing

```bash
# Run deterministic manifest audit (hash + coverage)
npm run demo:alpha-meta:manifest

# Inspect Alpha-Meta manifest
jq '.entries[] | {path, sha256}' demo/alpha-meta/reports/alpha-meta-manifest.json

# Cross-check First-Class OS manifest
jq '.entries[] | {path, sha256}' reports/agi-os/first-class/first-class-manifest.json

# Verify a specific artefact digest
shasum -a 256 demo/alpha-meta/reports/alpha-meta-governance-report.md
```

Store the manifest alongside the artefacts or publish to IPFS for external attestations.

## 9. CI and branch protection parity

Before opening a PR, ensure local runs match the enforced CI shield:

```bash
npm run lint:check
npm test
npm run coverage:check
npm run demo:alpha-meta:ci
npm run demo:alpha-meta:triangulate
npm run owner:verify-control
npm run ci:verify-branch-protection
```

All commands must exit with code 0. Any drift (e.g. missing CI jobs or coverage thresholds) is reported immediately.

## 10. Targeting Sepolia/Mainnet

- Export RPC URLs and funded keys (`export HARDHAT_NETWORK=sepolia`).
- Launch with `demo/alpha-meta/bin/launch.sh --network sepolia --auto-yes`.
- Confirm timelocks before executing queued upgrades; the generated owner diagnostics include queue status.

## 11. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `demo:agi-os:first-class` fails preflight | Ensure Docker Desktop is running; review `reports/agi-os/first-class/logs/`. |
| CI verification reports missing job | Confirm `.github/workflows/ci.yml` still defines lint, test, foundry, coverage, and summary jobs. |
| Owner diagnostics show warnings | Inspect the referenced Markdown; re-run the offending script (e.g. `npm run owner:audit-hamiltonian`). |
| Dashboard lacks addresses | Regenerate `deployment-config/oneclick.env` by re-running the launch script or `npm run deploy:env`. |

Repeat the launch script any time to regenerate a clean bundle. Every run is deterministic, tamper-evident, and verifiable.
