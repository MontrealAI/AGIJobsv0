# RUNBOOK — 🎖️ Solving α-AGI Governance 👁️✨ — α-field v14 HyperSovereign

This runbook lets a non-technical owner execute the entire HyperSovereign drill on a laptop. Every action is copy-pasteable, assumes Ethereum mainnet-grade infrastructure, and preserves full owner supremacy.

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
   Confirms Node 20.19.0, Hardhat, Foundry, and auxiliary utilities match locked versions.
3. **Owner signer ready** — control the Safe or hardware wallet referenced in [`config/mission@v14.json`](config/mission@v14.json).

---

## 1. Generate the HyperSovereign governance dossier

```bash
npm run demo:agi-governance:alpha-v14
```

Outputs (`demo/agi-governance/alpha-v14/reports/`):

- `governance-demo-report-v14.md`
- `governance-demo-summary-v14.json`
- `governance-demo-dashboard-v14.html`

The dossier includes thermodynamic energy accounting, Gibbs vs Landauer reconciliation, Hamiltonian divergence tolerances, five-method equilibrium confirmation, antifragility curvature, Stackelberg advantage assurance, risk residuals, owner capability matrix, CI enforcement audit, and quantum coherence lattice charts.

Open the dashboard for a cinematic experience:

```bash
open demo/agi-governance/alpha-v14/reports/governance-demo-dashboard-v14.html   # macOS
# or
xdg-open demo/agi-governance/alpha-v14/reports/governance-demo-dashboard-v14.html # Linux
```

---

## 2. Independent recomputation (validation)

```bash
npm run demo:agi-governance:alpha-v14:validate
```

Generates `reports/governance-demo-validation-v14.json` and `.md`, confirming thermodynamics, statistical physics, incentives, antifragility, risk, CI shield, and owner coverage all match the generated summary within tolerance. Any deviation is highlighted with ⚠️ markers.

---

## 3. CI (v2) enforcement audit

```bash
npm run demo:agi-governance:alpha-v14:ci
```

Audits `.github/workflows/ci.yml` to ensure:

- Jobs `lint`, `tests`, `foundry`, `coverage`, `summary` exist with the correct display names.
- Push, PR, and manual triggers are active.
- Concurrency guard `ci-${{ github.workflow }}-${{ github.ref }}` is enforced with cancel-in-progress.
- `COVERAGE_MIN` ≥ 92 and coverage thresholds remain ≥ 92%.

Outputs `reports/ci-verification-v14.json` for evidence packs.

---

## 4. Owner diagnostics bundle

```bash
npm run demo:agi-governance:alpha-v14:owner-diagnostics
```

Runs:

- `owner:audit-hamiltonian -- --quantum`
- `reward-engine:report`
- `owner:upgrade-status`
- `owner:compliance-report`

Outputs `reports/owner-diagnostics-v14.{json,md}` summarising readiness, warnings, and remediation notes. Designed to work even when Hardhat artifacts or on-chain endpoints are absent (skips become warnings).

---

## 5. Full automation (optional)

```bash
npm run demo:agi-governance:alpha-v14:full
```

Executes dossier generation, validation, CI verification, and owner diagnostics sequentially. Outputs `reports/governance-demo-full-run-v14.{json,md}` with timeline, antifragility metrics, CI status, owner readiness, quantum assurance, and aggregated artefact paths. Any warning/error is surfaced with icons and colour-coded mermaid timelines.

---

## 6. Execute owner supremacy commands (live drill)

Each command can be executed via CLI, Safe transaction builder, or Etherscan. Replace placeholder addresses with deployment addresses.

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
   npm run owner:command-center -- --network mainnet --set-lambda 0.962 --set-inertia 1.26
   npm run owner:audit-hamiltonian -- --network mainnet --quantum
   ```
4. **Mint/burn recalibration**
   ```bash
   npm run reward-engine:update -- --network mainnet --burn-bps 610 --treasury-bps 240
   npm run reward-engine:report -- --network mainnet
   ```
5. **Sentinel rotation**
   ```bash
   npm run owner:rotate -- --network mainnet --role Sentinel --count 5
   npm run monitoring:sentinels
   ```
6. **Upgrade hyperbundle queue**
   ```bash
   npm run owner:upgrade -- --network mainnet --proposal governance_bundle_v14.json
   npm run owner:upgrade-status -- --network mainnet
   ```
7. **Compliance + quantum beacon**
   ```bash
   npm run owner:update-all -- --network mainnet --module GlobalDisclosure --acknowledgement "α-field v14 hypersovereign live."
   npm run owner:audit-hamiltonian -- --network mainnet --quantum
   ```
8. **Resume normal operations**
   ```bash
   npm run owner:system-pause -- --network mainnet --pause false
   npm run owner:verify-control -- --network mainnet
   ```

Document transaction hashes in the dossier’s “Owner Execution Log” section for permanent provenance.

---

## 7. Archive evidence

Collect the Markdown/JSON artefacts and store them with board packets, regulator submissions, or your Safe vault. The set of files is sufficient to prove:

- Thermodynamic compliance (Gibbs, Landauer, Jarzynski).
- Multi-angle equilibrium convergence.
- Antifragility curvature and Stackelberg advantage.
- Quantum coherence within tolerance.
- CI shield and owner control coverage.

With these steps complete, the owner has irrefutable, physics-backed assurance that AGI Jobs v0 (v2) is the unstoppable α-field governance engine described by the research programme.
