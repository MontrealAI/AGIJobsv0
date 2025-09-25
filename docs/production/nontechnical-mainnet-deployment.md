# Non-Technical Mainnet Deployment Runbook (Truffle)

> **Audience:** Operations or business stakeholders who must ship AGIJobs v2 to Ethereum mainnet without deep Solidity expertise.
> **Goal:** Perform a safe, fully verified, institution-grade deployment using the existing Truffle migrations and post-deployment owner tooling.

---

## 1. Safety checklist (print and tick off)

1. ✅ You control a hardware wallet (Ledger, Safe, or similar) funded with >0.5 ETH for gas and protocol bootstrap costs.
2. ✅ A second reviewer is on-call to confirm contract addresses and governance ownership before production traffic is enabled.
3. ✅ You have cloned `https://github.com/MontrealAI/AGIJobsv0` to a secure workstation with Node.js **20.x** installed.
4. ✅ The `.env` file is stored in an encrypted volume and never committed to Git.
5. ✅ All commands below are executed from the repository root (`/workspace/AGIJobsv0`).

If any item is unchecked, pause and resolve it before continuing.

---

## 2. Prepare credentials and configuration

| Item | Why it is needed | How to obtain |
| --- | --- | --- |
| `MAINNET_RPC_URL` | Allows Truffle to broadcast transactions | Create an HTTPS endpoint from Infura, Alchemy, or QuickNode |
| `MAINNET_PRIVATE_KEY` | Signs deployment transactions | Export the key from a dedicated deployer wallet; keep < 1 ETH to limit risk |
| `ETHERSCAN_API_KEY` | Enables automatic source-code verification | Generate a key at [Etherscan.io](https://etherscan.io/myapikey) |
| Governance address | Owns every protocol module | Use your multisig / timelock address (e.g., Safe or OZ Timelock) |
| ENS namehash data | Unlocks agent & club registrations | Update `deployment-config/mainnet.json` with the correct ENS roots and hashes |

1. Copy `.env.example` to `.env` and fill in the blanks. For production, **never** store the seed phrase; only the deployer key.
2. Open `deployment-config/mainnet.json` and set:
   - `governance` → your multisig/timelock address.
   - ENS root hashes (use `npm run namehash:mainnet` to recompute after editing names).
   - Optional economics overrides (`feePct`, `burnPct`, etc.).
3. Ask governance to pre-authorise the deployer wallet if your Safe requires modules/owners to be added.

> ℹ️ ENS hashes must be 32-byte values (starts with `0x` and 64 hex characters). The helper script rewrites them automatically.

---

## 3. Run the automated deployment checklist

The repository ships with a guided validator to catch misconfiguration before any ETH is spent.

```bash
npm install           # install dependencies if you have not already
env DOTENV_PATH=.env npm run deploy:checklist
```

What to expect:

- A console table summarising private key format, RPC reachability, Node.js version, deployment JSON validity, and migration script availability.
- The script exits with `❌` on any fatal issue. Resolve all failures before continuing. Warnings (⚠️) highlight optional items that improve safety (for example, ENS hashes).
- Re-run the checklist until it prints `✅ Deployment checklist passed.`

---

## 4. Execute the Truffle mainnet migration

1. **Lock down your workstation** (enable VPN, disable screen sharing).
2. Export the governance address so the migration scripts can wire ownership:

   ```bash
   export GOVERNANCE_ADDRESS=0xYourMultiSig
   ```

3. Run the deployment. This compiles via Hardhat (with optimizer/viaIR), executes every Truffle migration, and verifies wiring afterwards.

   ```bash
   npm run migrate:mainnet
   ```

   What the script does:

   - `npm run compile:mainnet` – generates constants, compiles Solidity 0.8.25 with optimizer enabled.
   - `truffle migrate --network mainnet --reset` – deploys Deployer + modules and applies migrations 1–5.
   - `npm run wire:verify` – runs the health-check harness ensuring every module is connected and owner privileges are intact.

4. Copy the emitted contract addresses from the console output and share them with the reviewer. Store them in your deployment vault (e.g., 1Password Secure Note).

5. Run the optional Etherscan verification if not handled automatically:

   ```bash
   npx truffle run verify Deployer --network mainnet
   ```

   Repeat for additional contracts as needed (StakeManager, JobRegistry, etc.).

---

## 5. Post-deployment owner validation

The platform owner must be able to adjust fees, stakes, and modules immediately. Use the shipped tooling:

```bash
# Summarise every module owner and privileged setter
npm run owner:health

# Generate a governance change plan (CSV) that can be executed via Safe or OZ timelock
npm run owner:plan > owner-plan.csv

# Export a Safe Transaction Builder bundle for multisig execution
npm run owner:plan:safe

# Optional guided wizard to enact common changes (stake floor, fee %, ENS registrars)
npm run owner:wizard
```

Review the CSV with your governance team and store it in the same vault as the deployment report.

Upload the generated `owner-safe-bundle.json` to the [Safe Transaction Builder](https://app.safe.global/transactions/builder)
interface when your multisig needs to batch the updates without writing calldata manually.

---

## 6. Operational hand-off

1. Update the production runbook with:
   - Contract addresses.
   - `SystemPause` account (acts as central switch for emergencies).
   - Pauser accounts (`StakeManager`, `SystemPause`).
2. Fund the `StakeManager` treasury wallet as required for slashing distribution.
3. Notify platform operators that the system is live.
4. Schedule the first governance meeting to ratify economics (fees, burn %, stake requirements).

---

## 7. Emergency back-out procedure

- If a migration step reverts, **do not** retry immediately. Capture the error, re-run `npm run deploy:checklist`, and fix the cause offline.
- If ownership is incorrect after deployment, use `SystemPause` to freeze the system:

  ```bash
  npx hardhat run scripts/v2/updateSystemPause.ts --network mainnet --pause
  ```

- Coordinate with governance to execute the generated `owner-plan.csv` transactions that re-assign ownership.

---

## 8. Quick reference command palette

| Scenario | Command |
| --- | --- |
| Re-run checklist after editing `.env` | `npm run deploy:checklist` |
| Dry-run deployment on Sepolia | `npm run migrate:sepolia` |
| Verify wiring post-upgrade | `npm run wire:verify` |
| Inspect module ownership | `npm run owner:health` |
| Update economics | `npm run owner:wizard` |
| Produce Safe bundle for multisig | `npm run owner:plan:safe` |
| Pause the system | `npx hardhat run scripts/v2/updateSystemPause.ts --network mainnet --pause` |

Keep this cheat-sheet near the operations console. Every command is safe to run multiple times and produces deterministic output when the environment is configured correctly.

---

## 9. Support

- **Security contact:** see [`SECURITY.md`](../../SECURITY.md) for responsible disclosure.
- **Operational docs:** the `docs/` folder contains module-level guides (`stake-manager-configuration.md`, `owner-control-playbook.md`, etc.).
- **CI health:** GitHub Actions workflow `CI` runs linting, unit tests, Slither, and Echidna smoke tests. Monitor the badge in the repository README to confirm the main branch is green before deploying.

Stay disciplined, keep an audit trail, and treat every mainnet deployment as a regulated change control event.
