# RUNBOOK — 🎖️ Solving α-AGI Governance 👁️✨ — α-field v15 OmegaSovereign

This runbook guides a non-technical owner through the OmegaSovereign drill end-to-end. Every action is copy/paste-ready,
assumes Ethereum mainnet-grade infrastructure, and keeps the contract owner in absolute control.

---

## 0. Prerequisites

1. **Clone & install**
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   npm ci
   ```
2. **Toolchain integrity**
   ```bash
   npm run ci:verify-toolchain
   ```
   Confirms Node 20.19.0, Hardhat, Foundry, and auxiliary utilities match the locked versions.
3. **Owner signer ready** — control the Safe or hardware wallet referenced in [`config/mission@v15.json`](config/mission@v15.json).

---

## 1. Generate the OmegaSovereign governance dossier

```bash
npm run demo:agi-governance:alpha-v15
```

Outputs (`demo/agi-governance/alpha-v15/reports/`):

- `governance-demo-report-v15.md`
- `governance-demo-summary-v15.json`
- `governance-demo-dashboard-v15.html`

The dossier includes thermodynamic energy accounting, Gibbs vs Landauer reconciliation, Hamiltonian divergence tolerances,
multi-method equilibrium confirmation, antifragility curvature, Stackelberg advantage assurance, risk residuals, owner
capability matrix, CI enforcement audit, and quantum coherence lattice charts.

Open the dashboard for the cinematic console:

```bash
open demo/agi-governance/alpha-v15/reports/governance-demo-dashboard-v15.html   # macOS
# or
xdg-open demo/agi-governance/alpha-v15/reports/governance-demo-dashboard-v15.html # Linux
```

---

## 2. Independent recomputation (validation)

```bash
npm run demo:agi-governance:alpha-v15:validate
```

Produces `reports/governance-demo-validation-v15.{json,md}` confirming that thermodynamics, statistical physics, incentives,
antifragility, risk, CI shield, quantum lattice, and owner coverage all match the summary within tolerance. Any deviation is
flagged with ⚠️ markers.

---

## 3. CI (v2) enforcement audit

```bash
npm run demo:agi-governance:alpha-v15:ci
```

Audits `.github/workflows/ci.yml` to ensure:

- Jobs `lint`, `tests`, `foundry`, `coverage`, `summary` exist with the correct display names.
- Push, PR, and manual triggers are active.
- Concurrency guard `ci-${{ github.workflow }}-${{ github.ref }}` is enforced with cancel-in-progress.
- Coverage threshold ≥ 92% is enforced.

Outputs `reports/ci-verification-v15.json` for evidence packs.

---

## 4. Owner diagnostics bundle

```bash
npm run demo:agi-governance:alpha-v15:owner-diagnostics
```

Runs:

- `owner:audit-hamiltonian -- --quantum`
- `reward-engine:report`
- `owner:upgrade-status`
- `owner:compliance-report`

Outputs `reports/owner-diagnostics-v15.{json,md}` summarising readiness, warnings, and remediation notes. Designed to work even
when Hardhat artifacts or on-chain endpoints are absent (skips become warnings).

---

## 5. Full automation (optional)

```bash
npm run demo:agi-governance:alpha-v15:full
```

Executes dossier generation, validation, CI verification, and owner diagnostics sequentially. Outputs
`reports/governance-demo-full-run-v15.{json,md}` with timeline, antifragility metrics, CI status, owner readiness, quantum
assurance, and aggregated artefact paths. Any warning/error is surfaced with icons and colour-coded mermaid timelines.

---

## 6. Execute owner supremacy commands (live drill)

Each command can be executed via CLI, Safe transaction builder, or Etherscan. Replace placeholder addresses with deployment
addresses.

1. **Emergency pause**
   ```bash
   npm run owner:system-pause -- --network mainnet --pause true
   npm run owner:verify-control -- --network mainnet
   ```
2. **Spectral resume after review**
   ```bash
   npm run owner:surface -- --network mainnet --resume
   npm run owner:verify-control -- --network mainnet
   ```
3. **Hamiltonian retune**
   ```bash
   npm run owner:command-center -- --network mainnet --set-lambda 1.004 --set-inertia 1.18
   npm run owner:audit-hamiltonian -- --network mainnet --quantum
   ```
4. **Mint/burn recalibration**
   ```bash
   npm run reward-engine:update -- --network mainnet --burn-bps 680 --treasury-bps 260
   npm run reward-engine:report -- --network mainnet
   ```
5. **Sentinel rotation**
   ```bash
   npm run owner:rotate -- --network mainnet --role Sentinel --count 7
   npm run monitoring:sentinels
   ```
6. **Expansion sweep activation**
   ```bash
   npm run owner:mission-control -- --network mainnet --mode expansion
   npm run owner:atlas -- --network mainnet --mode expansion
   ```
7. **Resilience drill**
   ```bash
   npm run owner:emergency -- --network mainnet --scenario antifragile-drill
   npm run owner:pulse -- --network mainnet
   ```
8. **Upgrade Omega bundle**
   ```bash
   npm run owner:upgrade -- --network mainnet --proposal governance_bundle_v15.json
   npm run owner:upgrade-status -- --network mainnet
   ```
9. **Compliance + quantum beacon**
   ```bash
   npm run owner:update-all -- --network mainnet --module GlobalDisclosure --acknowledgement "α-field v15 omegasovereign live."
   npm run owner:audit-hamiltonian -- --network mainnet --quantum
   ```
10. **Resume normal operations**
    ```bash
    npm run owner:system-pause -- --network mainnet --pause false
    npm run owner:verify-control -- --network mainnet
    ```

Document transaction hashes in the dossier’s “Owner Execution Log” section for permanent provenance.

---

## 7. Archive evidence

Collect the Markdown/JSON artefacts and store them with board packets, regulator submissions, or your Safe vault. The set of
files is sufficient to prove:

- Thermodynamic compliance (Gibbs, Landauer, Jarzynski).
- Multi-angle equilibrium convergence.
- Antifragility curvature and Stackelberg advantage.
- Quantum coherence within tolerance.
- CI shield and owner control coverage.

With these steps complete, the owner has irrefutable, physics-backed assurance that AGI Jobs v0 (v2) is the unstoppable
OmegaSovereign α-field governance engine described by the research programme.
