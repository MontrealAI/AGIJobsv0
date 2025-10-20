# α-field v13 Runbook — Non-Technical Launch Guide

This runbook walks a non-technical owner through executing the full Solving α-AGI Governance demonstration using AGI Jobs v0 (v2). Follow it from top to bottom to produce regulator-ready artefacts and confirm every owner control remains at your fingertips.

---

## 0. One-time preparation

1. Install dependencies from the repository root:
   ```bash
   npm install
   ```
2. Ensure you have a terminal connected to an Ethereum mainnet-capable RPC provider. Replace placeholder RPC URLs in the manifest if needed.

---

## 1. Generate the α-field dossier

1. Run the primary generator:
   ```bash
   npm run demo:agi-governance:alpha-v13
   ```
2. Open `demo/agi-governance/alpha-v13/reports/governance-demo-report-v13.md` in any Markdown viewer.
   - The document contains mermaid diagrams for thermodynamic flow, alpha-field mindmaps, antifragility curves, risk matrices, and owner command sequences.
3. Launch the cinematic dashboard (optional but recommended):
   ```bash
   npx serve demo/agi-governance/alpha-v13/reports --single
   ```
   Navigate to `http://localhost:3000/governance-demo-dashboard-v13.html` to explore the interactive UI.

---

## 2. Validate the physics and incentives

1. Execute the independent recomputation:
   ```bash
   npm run demo:agi-governance:alpha-v13:validate
   ```
2. Review `reports/governance-demo-validation-v13.md`. Every tolerance should show ✅. Any ❌ indicates an out-of-band modification that needs investigation.

---

## 3. Confirm CI enforcement

1. Run the CI shield auditor:
   ```bash
   npm run demo:agi-governance:alpha-v13:ci
   ```
2. Inspect `reports/ci-verification-v13.json`. Ensure the root workflow is `ci (v2)` and all required jobs (`lint`, `tests`, `foundry`, `coverage`, `summary`) appear with matching names.

---

## 4. Audit owner controls

1. Aggregate diagnostics:
   ```bash
   npm run demo:agi-governance:alpha-v13:owner-diagnostics
   ```
2. Read `reports/owner-diagnostics-v13.md`.
   - Confirm every required category (`pause`, `resume`, `parameter`, `treasury`, `sentinel`, `upgrade`, `compliance`) shows ✅ coverage.
   - Note any warnings/errors — they typically indicate missing Hardhat artefacts or network credentials.

---

## 5. Run the full unattended drill

1. Trigger the complete pipeline:
   ```bash
   npm run demo:agi-governance:alpha-v13:full
   ```
2. Archive the aggregated outputs:
   - `reports/governance-demo-full-run-v13.json`
   - `reports/governance-demo-full-run-v13.md`
   These files summarise step durations, antifragility curvature, risk residuals, CI guard status, and owner readiness in one place.

---

## 6. Prepare for on-chain execution (optional)

1. Load the owner scripts from the dossier under **Owner Command Matrix**.
2. Use Safe, Etherscan, or Hardhat to execute the recommended commands:
   - `npm run owner:system-pause` / `npm run owner:surface -- --resume`
   - `npm run owner:command-center -- --set-lambda 0.955`
   - `npm run reward-engine:update -- --burn-bps 550 --treasury-bps 260`
   - `npm run owner:rotate -- --role Sentinel --count 3`
   - `npm run owner:upgrade -- --proposal governance_bundle_v13.json`
   - `npm run owner:update-all -- --module TaxPolicy`
3. Each command includes a verification script (`owner:verify-control`, `owner:audit-hamiltonian`, etc.). Run them to capture before/after evidence.

---

## 7. Archive everything

Bundle the following into your board or regulator packet:

- `governance-demo-report-v13.md`
- `governance-demo-dashboard-v13.html`
- `governance-demo-summary-v13.json`
- `governance-demo-validation-v13.md`
- `ci-verification-v13.json`
- `owner-diagnostics-v13.md`
- `governance-demo-full-run-v13.md`

These artefacts prove that AGI Jobs v0 (v2) delivers the thermodynamic, game-theoretic, antifragile, and operational guarantees promised by the α-field governance research — with the owner firmly in control.

---

> **Tip:** Re-run the full pipeline whenever you change mission parameters or upgrade contracts. The scripts will regenerate every artefact with the new settings, keeping your governance dossier evergreen.
