# RUNBOOK — 🎖️ Solving α-AGI Governance 👁️✨ — α-field v17 Singularity Dominion

This runbook lets a non-technical owner execute the entire Singularity Dominion drill from a laptop. Every action is copy‑paste; no bespoke coding is required. The workflow assumes access to an Ethereum mainnet RPC (or fork) and a hardware wallet, Safe, or custodial signer with owner privileges.

---

## 0. Prerequisites

1. **Clone** the AGI Jobs v0 (v2) repository and install dependencies:
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   npm ci
   ```
2. **Toolchain locks:**
   ```bash
   npm run ci:verify-toolchain
   ```
   Confirms Node 20.19.0, Hardhat, Foundry, and auxiliary utilities match the pinned versions.
3. **Owner signer ready** — control the Safe or hardware wallet referenced in [`config/mission@v17.json`](config/mission@v17.json).

---

## 1. Generate the Singularity Dominion dossier

```bash
npm run demo:agi-governance:alpha-v17
```

Outputs (`demo/agi-governance/alpha-v17/reports/`):

- `governance-demo-report-v17.md`
- `governance-demo-summary-v17.json`
- `governance-demo-dashboard-v17.html`

Review the Markdown dossier. It narrates thermodynamics, statistical physics, incentives, antifragility, quantum alignment, CI enforcement, and owner supremacy. Every owner command appears with a ready-to-run snippet.

Open the cinematic dashboard to brief stakeholders:

```bash
open demo/agi-governance/alpha-v17/reports/governance-demo-dashboard-v17.html   # macOS
# or
xdg-open demo/agi-governance/alpha-v17/reports/governance-demo-dashboard-v17.html # Linux
```

---

## 2. Recompute the dossier (independent verification)

```bash
npm run demo:agi-governance:alpha-v17:validate
```

Produces `reports/governance-demo-validation-v17.{json,md}` confirming thermodynamics, statistical physics, incentives, equilibria, antifragility curvature, risk residuals, and owner coverage all match the generated summary within tolerance.

---

## 3. Validate CI enforcement (green v2 shield)

```bash
npm run demo:agi-governance:alpha-v17:ci
```

Audits `.github/workflows/ci.yml` and writes `reports/ci-verification-v17.json` showing:

- Jobs `lint`, `tests`, `foundry`, `coverage`, and `summary` exist with the expected display names.
- Push, pull-request, and manual dispatch triggers are enabled.
- Concurrency guard `ci-${workflow}-${ref}` with `cancel-in-progress: true` is present.
- Coverage thresholds ≥ 90% are enforced both in steps and environment variables.

Attach the JSON artifact to governance evidence packs.

---

## 4. Aggregate owner diagnostics (one-click audit pack)

```bash
npm run demo:agi-governance:alpha-v17:owner-diagnostics
```

Outputs `reports/owner-diagnostics-v17.{json,md}` summarising the results of `owner:audit-hamiltonian`, `reward-engine:report`, `owner:upgrade-status`, and `owner:compliance-report`. The Markdown flags warnings (e.g., placeholder addresses) and highlights remediation steps.

---

## 5. Run the full Singularity Dominion pipeline (optional)

```bash
npm run demo:agi-governance:alpha-v17:full
```

Produces `reports/governance-demo-full-run-v17.{json,md}` capturing step durations, antifragility curvature, CI shield verdicts, and owner readiness so a board can review the entire drill from a single artifact.

---

## 6. Execute on-chain owner controls (optional live drill)

Each command can be run via the CLI, Safe transaction builder, or Etherscan write interface. Replace placeholder addresses with deployment addresses.

1. **Pause the platform instantly (Dominion emergency brake):**
   ```bash
   npm run owner:system-pause -- --network mainnet --pause true
   ```
   Validate pause state using `npm run owner:verify-control`.

2. **Tune Hamiltonian parameters:**
   ```bash
   npm run owner:command-center -- --network mainnet --set-lambda 1.024 --set-inertia 1.33
   ```

3. **Adjust reward engine (Gibbs alignment):**
   ```bash
   npm run reward-engine:update -- --network mainnet --burn-bps 720 --treasury-bps 240
   ```

4. **Update disclosure policy:**
   ```bash
   npm run owner:update-all -- --network mainnet --module DominionDisclosure --acknowledgement "Singularity Dominion protocol live."
   ```

5. **Queue the Dominion surge upgrade bundle:**
   ```bash
   npm run owner:upgrade -- --network mainnet --proposal governance_bundle_v17.json
   npm run owner:upgrade-status -- --network mainnet
   ```

6. **Rotate sentinel guardians:**
   ```bash
   npm run owner:rotate -- --network mainnet --role Sentinel --count 12
   npm run monitoring:sentinels
   ```

7. **Trigger resilience drill and resume:**
   ```bash
   npm run owner:emergency -- --network mainnet --scenario antifragile-dominion-drill
   npm run owner:surface -- --network mainnet --resume
   npm run owner:verify-control
   ```

Document transaction hashes in the dossier under the “Owner Execution Log”.

**Tip:** If any command shows ⚠️ in the owner matrix, run `npm run owner:surface` to regenerate automation metadata before redeploying.

---

The Singularity Dominion mission proves that AGI Jobs v0 (v2) is the civilisation-scale intelligence engine a non-technical owner can command with physics-grade assurance and unstoppable blockchain execution.
