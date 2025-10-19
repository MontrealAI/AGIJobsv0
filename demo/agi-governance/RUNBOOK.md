# RUNBOOK — 🎖️ Solving α-AGI Governance 👁️✨

This runbook lets a non-technical owner execute the entire AGI Governance Demonstration from a laptop. Every action is copy‑pasteable; no bespoke coding is required. The workflow assumes access to an Ethereum mainnet RPC (or fork) and a hardware wallet, Safe, or custodial signer with owner privileges.

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
   Confirms Node 20.18.1, Hardhat, Foundry, and auxiliary utilities match the pinned versions.
3. **Owner signer ready:** ensure you control the owner key or multisig referenced in [`config/mission@v1.json`](config/mission@v1.json).

---

## 1. Generate the governance dossier

```bash
npm run demo:agi-governance
```

Outputs `reports/governance-demo-report.md` with:
- Thermodynamic energy margins (Gibbs free energy, Hamiltonian convergence envelope, Landauer limit calibration).
- Statistical-physics partition validation (partition function, scaled free energy, entropy, Gibbs delta tolerance, heat capacity).
- Incentive free-energy ledger (mint/burn/slash parity, treasury mirroring, owner-tunable slashing curves).
- Five-method equilibrium confirmation (discrete replicator, RK4 continuous flow, Perron eigenvector, closed-form, Monte-Carlo) with maximum deviation score.
- Analytic vs numeric Jacobian matrices (Gershgorin, spectral radius, max delta) and antifragility curvature plus welfare growth curve for adversarial shocks.
- Risk audit portfolio with weighted mitigation coverage, dual residual calculations, and board threshold comparison.
- Owner command surface (pause/unpause, parameter upgrades, treasury manoeuvres, sentinel verifications) plus capability coverage matrix and npm-script audit table.
- Blockchain deployment ledger (contracts, pausable selectors, Safe module stack).
- CI enforcement proof (required contexts, concurrency, access-control coverage).

**Visual cockpit:** Start the Enterprise Portal to explore the same data with live Mermaid atlases.

```bash
cd apps/enterprise-portal
npm run dev
```

Visit [http://localhost:3000/agi-governance](http://localhost:3000/agi-governance) to review the thermodynamic metrics, risk residuals, and owner automation status in an executive-friendly dashboard.

Review the report. It references exact commands to execute each owner action on Ethereum or via AGI Jobs automation scripts.

---

## 2. Recompute the dossier (independent verification)

```bash
npm run demo:agi-governance:validate
```

This command recomputes every analytic in the mission manifest—thermodynamics, statistical physics, replicator equilibria, antifragility curvature, risk aggregation, incentive ledgers, and owner control coverage—and compares them against the generated summary JSON. It emits `reports/governance-demo-validation.json` and `.md`, each listing the tolerance achieved per check plus confirmation that agent ↔ treasury parity, divergence tolerances, and Jacobian stability survived the replay.

Archive these files with the original dossier for an independently verified evidence chain.

---

## 3. Validate CI enforcement (green V2 shield)

```bash
npm run demo:agi-governance:ci
```

This audits `.github/workflows/ci.yml` to ensure:
- Jobs `lint`, `tests`, `foundry`, `coverage`, and `summary` exist with the expected display names.
- Push and pull request triggers are enabled for the workflow.
- Manual `workflow_dispatch` trigger is available for emergency reruns.
- Concurrency guards are active (`ci-${workflow}-${ref}`).
- `cancel-in-progress` is set to `true` so new pushes replace stale runs.
- Coverage thresholds are enforced (≥ 90%).
- `COVERAGE_MIN` environment variable is ≥ 90%.

Attach the generated `reports/ci-verification.json` to your governance logs.

---

## 4. Aggregate owner diagnostics (one-click audit pack)

```bash
npm run demo:agi-governance:owner-diagnostics
```

This orchestrates `owner:audit-hamiltonian`, `reward-engine:report`, `owner:upgrade-status`, and `owner:compliance-report` with `--json`, tolerating environments where Hardhat artifacts or on-chain addresses are absent. The resulting `reports/owner-diagnostics.json` and `owner-diagnostics.md` summarise success, warnings (e.g., skipped due to missing deployments), and actionable notes. Share the Markdown with executives and store the JSON for automated evidence pipelines.

---

## 5. Execute on-chain owner controls (optional live drill)

Each command below can be run via the CLI, Safe transaction builder, or Etherscan write interface. Replace placeholder addresses with your deployment addresses.

1. **Pause the platform instantly (emergency brake):**
   ```bash
   npm run owner:system-pause -- --network mainnet --pause true
   ```
   Validate pause state using `npm run owner:verify-control`.

2. **Tune governance Hamiltonian parameters:**
   ```bash
   npm run owner:command-center -- --network mainnet --target HamiltonianMonitor --set-lambda 0.94 --set-inertia 1.08
   ```

3. **Adjust reward engine (Gibbs free energy alignment):**
   ```bash
   npm run reward-engine:update -- --network mainnet --burn-bps 600 --treasury-bps 200
   ```

4. **Update tax policy acknowledgement (public disclosure):**
   ```bash
   npm run owner:update-all -- --network mainnet --module TaxPolicy --acknowledgement "Participants accept AGI Jobs v2 tax terms."
   ```

5. **Queue an upgrade bundle for deterministic rollout:**
   ```bash
   npm run owner:upgrade -- --network mainnet --proposal governance_bundle.json
   npm run owner:upgrade-status -- --network mainnet
   ```

6. **Resume the platform:**
   ```bash
   npm run owner:system-pause -- --network mainnet --pause false
   npm run owner:verify-control -- --network mainnet
   ```

Document transaction hashes in `reports/governance-demo-report.md` under the “Owner Execution Log” section.

**Tip:** Confirm the “Command Audit” table flips to all ✅ entries before executing upgrades. If a capability shows ⚠️, run `npm run owner:surface` to inspect available automation scripts or regenerate the AGI Jobs CLI package.

---

## 6. Formal verification hooks

1. **Coverage remapping audit:**
   ```bash
   npm run coverage
   node scripts/ci/remap-coverage-paths.js
   npm run check:access-control
   ```
2. **Foundry stochastic fuzzing:**
   ```bash
   forge test -vvvv --ffi --fuzz-runs 256
   ```
3. **Red-team sentinel validation:**
   ```bash
   npm run monitoring:sentinels
   npm run monitoring:validate
   ```

Archive the resulting artefacts inside `reports/` alongside the governance dossier.

---

## 7. Evidence of execution

After each run:
1. Commit the generated artefacts to a dedicated evidence branch or upload them to immutable storage (e.g., IPFS, Arweave).
2. Cross-reference the timestamp with Safe/Etherscan transaction receipts.
3. Update the `Owner Execution Log` section in the dossier and tick the capability coverage table once each action has a confirmed transaction hash.
   - Transaction hash
   - Module touched
   - Parameter delta
   - Operator signature

The compiled dossier proves the owner maintains total control while the platform autonomously drives toward the thermodynamic and game-theoretic optimum.

---

**Mission complete.** AGI Jobs v0 (v2) now demonstrably empowers you—without bespoke engineering—to operate the civilisation-scale α-AGI governance engine.
