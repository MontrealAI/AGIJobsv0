# Meta-Agentic α-AGI Mission Runbook

This runbook guides a non-technical operator through the end-to-end Meta-Agentic α-AGI demonstration using only commands and dashboards that already ship with AGI Jobs v0 (v2). Follow the sections sequentially; each step produces audit-ready artefacts and reinforces that the contract owner retains absolute control.

## 0. Prerequisites

- **Node.js 20.19.0** (matching the repo `engines.node` requirement).
- **Docker + Docker Compose** (the first-class demo checks both binaries).
- **Wallet** in browser (MetaMask or Rabby) configured for `http://127.0.0.1:8545`.
- Run `npm install` in the repository root if dependencies are missing.

Validate the toolchain:

```bash
node --version
npm --version
docker --version
docker compose version
```

## 1. Launch the meta-agentic mission

Execute the bundled launch script from the repo root:

```bash
demo/meta-agentic-alpha-agi/bin/launch.sh
```

What happens:

1. `npm run demo:agi-os:first-class -- --auto-yes` deploys/refreshes contracts, runs the Astral Omnidominion OS demo, generates the Owner Control Matrix, produces `grand-summary.{md,json,html}`, and writes the first-class manifest under `reports/agi-os/first-class/`.
2. `npm run demo:asi-takeoff:local` replays the ASI take-off harness with `project-plan.meta-alpha.json`, populating mission receipts for the nation + wallet coalition.

Confirm the bundle:

- `reports/agi-os/grand-summary.html` – executive overview with owner authority mapping.
- `reports/agi-os/first-class/owner-control-map.mmd` – Mermaid governance diagram.
- `reports/asi-takeoff/mission-bundle/mission.json` – deterministic execution receipts referencing the nation & wallet actors.

## 2. Start live dashboards (optional but recommended)

Launch the existing dashboards in separate terminals:

```bash
# Terminal A – API, orchestrator, validator dashboard, enterprise portal
docker compose up validator-ui enterprise-portal

# Terminal B – Owner Console UX
npm --prefix apps/console run dev
```

Open the following URLs:

- **Owner Console:** http://localhost:5173
- **Enterprise Portal:** http://localhost:3001
- **Validator Dashboard:** http://localhost:3000

Connect your browser wallet to `http://127.0.0.1:8545` and import the default Hardhat private keys if needed (see `anvil` accounts in logs). Use account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` as the owner/operator.

## 3. Owner control drill

Demonstrate full owner authority using built-in scripts:

```bash
# Pause everything instantly (use the network from your deployment)
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --action pause --yes

# Review wiring integrity
npm run owner:verify-control

# Resume operations
HARDHAT_NETWORK=localhost npm run owner:system-pause -- --action unpause --yes
```

In the Owner Console UI the pause toggles update live. The commands confirm that `SystemPause` owns every pausable module and that the deployer wallet can reconfigure/rotate addresses.

## 4. Post a new mission job (non-technical flow)

1. Visit the **Enterprise Portal** (http://localhost:3001).
2. Click “Create Job”, fill in:
   - **Organisation:** `aurora.nation.agi.eth`
   - **Title:** “Meta-agentic flood barrier prototype”
   - **Reward:** `42000`
   - **Deadline:** `14` days
   - **Description:** Outline cross-border climate resilience deliverable.
3. Sign the transaction with the owner wallet (Anvil account).

The job instantly appears in the validator dashboard queue and in the job table on the portal. This proves non-technical staff can submit work without touching code.

## 5. Validator experience (commit/reveal)

On http://localhost:3000:

1. Connect a second wallet (e.g. Hardhat account `0x70997970c51812dc3a010c7d01b50e0d17dc79c8`).
2. Select the newly created job.
3. Click “Commit vote”, choose Approve or Reject. The dashboard handles hashing & submission.
4. Once the reveal window opens (displayed on-screen), click “Reveal vote”.

For CLI parity you can also run:

```bash
npm run demo:agi-os:first-class -- --skip-deploy --stage commit-reveal
```

This replays the validation helper on the deployed contracts using the same deterministic salts.

## 6. Observe thermodynamic incentives

Review the ASI take-off telemetry produced in step 1:

- `reports/asi-takeoff/thermodynamics.json` – per-role entropy, energy usage, and temperature adjustments.
- `reports/asi-takeoff/summary.md` – high-level narrative for the Global Stewardship mission.

The file highlights how validator rewards adjust when `double-validator-bonus` or `trigger-pause-check` profiles are activated for wallet-led missions.

## 7. Artefact verification & integrity

1. Inspect the first-class manifest:
   ```bash
   jq '.entries[] | {path, sha256}' reports/agi-os/first-class/first-class-manifest.json
   ```
2. Validate hashes for the grand summary:
   ```bash
   shasum -a 256 reports/agi-os/grand-summary.md
   ```
   The digest must match the manifest entry.
3. Package artefacts for auditors (optional):
   ```bash
   tar -czf meta-agentic-bundle.tgz reports/agi-os reports/asi-takeoff
   ```

## 8. CI & branch protection parity

Before opening a PR, run the same commands enforced by the repository’s v2 CI configuration:

```bash
npm run lint:check
npm test
npm run coverage:check
npm run owner:verify-control
npm run ci:verify-branch-protection
```

All commands must succeed (exit code 0). The branch protection verifier checks that CI workflows (`lint`, `test`, `coverage`, `foundry`, `ci-summary`) are enforced on `main`.

## 9. Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `demo:agi-os:first-class` fails during preflight | Ensure Docker Desktop is running and re-run the script. Logs stored under `reports/agi-os/first-class/logs/`. |
| UI shows zero addresses | Verify `deployment-config/oneclick.env` contains the latest contract addresses (regenerated by the demo). Restart dashboards after the demo finishes. |
| Wallet cannot call owner actions | Confirm you are using the deployer account. If running against Sepolia/Mainnet ensure the multisig signer is connected. |
| Manifest mismatch | Delete `reports/agi-os/` and re-run the launch script to rebuild artefacts on a clean workspace. |

The entire runbook is deterministic—repeat the launch script at any time to regenerate artefacts, reset the local chain, and refresh dashboards.
