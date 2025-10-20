# Alpha Meta Sovereign Lattice Runbook

This runbook equips a non-technical steward to operate the Alpha Meta Sovereign Lattice demonstration end to end. Follow the
steps sequentially to reproduce the superintelligent mission, exercise owner control, and publish audit-ready evidence.

---

## 1. Environment preparation

1. Install Node.js **20.18.1** (matching the repository `package.json` engines field).
2. Install dependencies:
   ```bash
   npm install
   ```
3. (Optional) Install Docker if you want to run the Owner Console, Enterprise Portal, or Validator Dashboard containers.
4. Ensure you have at least one Hardhat account funded on your target network (Anvil defaults are fine for local runs).

> **Triple verification:** run `node -v`, `npm -v`, and `docker --version` (if using dashboards) to confirm tooling versions match
> expectations.

---

## 2. Launch the alpha-meta orchestration

1. From the repository root run:
   ```bash
   ./demo/alpha-meta/bin/launch.sh
   ```
2. The launcher:
   - Sets `NODE_ENV=production` if unset and binds `ASI_TAKEOFF_PLAN_PATH=demo/alpha-meta/project-plan.alpha-meta.json`.
   - Runs `npm run demo:alpha-meta` (governance dossier), `npm run demo:alpha-meta:validate`,
     `npm run demo:alpha-meta:owner-diagnostics`, `npm run demo:alpha-meta:ci`,
    `npm run demo:alpha-meta:full`, and finally the plan-aware `npm run demo:asi-takeoff`.
   - Prints absolute paths to every artefact produced under `reports/alpha-meta/` and `reports/asi-takeoff/`.
3. Confirm the script exits with `✅ Alpha Meta sovereign lattice complete`.

> **Self-check:** rerun the launcher; the resulting Markdown/JSON hashes should match the first run. Use `shasum -a 256 reports/alpha-meta/*`.

---

## 3. Explore the dashboards (optional but recommended)

1. Start dashboards in one terminal:
   ```bash
   docker compose up validator-ui enterprise-portal
   ```
2. Start the Owner Console (Vite) in another terminal:
   ```bash
   npm --prefix apps/console run dev
   ```
3. Open the interfaces:
   - Owner Console – http://localhost:5173
   - Enterprise Portal – http://localhost:3001
   - Validator Dashboard – http://localhost:3000
4. Connect your wallet (Anvil default `0xf39f...` holds the owner key). The Owner Console auto-loads addresses from `deployment-config/oneclick.env`.

---

## 4. Execute owner control drills

All commands are copy-paste from the generated report. Run them against a local Hardhat node first:

```bash
# Pause the lattice
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --action pause

# Verify pause status
HARDHAT_NETWORK=localhost npm run owner:verify-control

# Resume operations
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --action unpause

# Update the Hamiltonian lambda
HARDHAT_NETWORK=localhost npm run owner:command-center -- --set-lambda 1.031 --set-inertia 1.29

# Rotate sentinel cohort
HARDHAT_NETWORK=localhost npm run owner:rotate -- --role Sentinel --count 16
```

After each command, consult the Owner Console to confirm state updates. The validation Markdown explains which metrics should
change (e.g., antifragility curvature after sentinel rotation).

---

## 5. Validate CI v2 enforcement

1. Run the exact checks enforced on pull requests:
   ```bash
   npm run lint:check
   npm test
   npm run coverage:check
   npm run demo:alpha-meta:ci
   ```
2. To audit GitHub branch protection (requires a token with `repo` scope):
   ```bash
   npm run ci:verify-branch-protection -- --token <GITHUB_TOKEN>
   ```
3. Ensure all commands exit successfully before opening any pull request. The CI verification JSON under `reports/alpha-meta/`
   records the enforcement evidence.

---

## 6. Archive artefacts for governance

1. Review `reports/alpha-meta/meta-governance-dashboard.html` in a browser for the cinematic overview.
2. Share these files with stakeholders:
   - `meta-governance-report.md`
   - `meta-governance-summary.json`
   - `meta-governance-validation.md`
   - `owner-diagnostics-alpha-meta.md`
   - `ci-verification-alpha-meta.json`
3. Record SHA-256 hashes for audit trails:
   ```bash
   shasum -a 256 reports/alpha-meta/meta-governance-report.md reports/alpha-meta/meta-governance-summary.json
   shasum -a 256 reports/alpha-meta/meta-governance-validation.md reports/alpha-meta/owner-diagnostics-alpha-meta.md
   shasum -a 256 reports/alpha-meta/meta-governance-full-run.json
   ```
4. Optional: upload the mission file (`demo/alpha-meta/config/mission.alpha-meta.json`) and project plan to IPFS for external
   verification.

---

## 7. Rehearse on Sepolia or mainnet-grade infrastructure

1. Fund your deployment wallet on the target network.
2. Export RPC credentials (e.g., `export ALCHEMY_API_KEY=...`).
3. Rerun the launcher with the appropriate network:
   ```bash
   HARDHAT_NETWORK=sepolia ./demo/alpha-meta/bin/launch.sh --network sepolia --compose
   ```
4. Repeat the owner control drills; all scripts respect the supplied network flag.
5. Compare artefacts between local and Sepolia runs to confirm deterministic behaviour.

---

## 8. Incident drills and rollback

1. Trigger the resilience scenario:
   ```bash
   HARDHAT_NETWORK=localhost npm run owner:emergency -- --scenario alpha-meta-drill
   ```
2. Inspect the report’s antifragility section to confirm sigma gain remains positive.
3. If metrics fall outside expected bounds, pause the lattice and execute `npm run owner:update-all -- --module AlphaMetaDisclosure`
   to publish a disclosure, then resume once resolved.

---

By following this runbook, a non-technical owner demonstrates full command of the meta-agentic superintelligence, backed by CI v2
proofs, thermodynamic accounting, and audit-grade artefacts.
