# Institutional Truffle Mainnet Playbook

> **Audience:** Program managers, legal/compliance reviewers, and non-technical operators who must launch the AGIJobs v2 protocol on Ethereum mainnet using Truffle while meeting institutional change-control requirements.
>
> **Outcome:** A verifiable, production-ready deployment that leaves the owner (governance) in full control of every economic, identity, and emergency parameter.

---

## 1. Executive summary

| Stage | Goal | Command palette | Artefacts |
| --- | --- | --- | --- |
| Preflight | Confirm workstation hygiene and configuration parity | `npm run deploy:checklist` | `logs/deploy-checklist-*.json` |
| Compile | Generate Solidity constants and bytecode with optimizer | `npm run compile:mainnet` | `artifacts/` + `contracts/v2/Constants.sol` |
| Deploy | Execute deterministic Truffle migrations (1–5) | `npm run migrate:mainnet` | `docs/deployment-addresses.json`, Truffle receipts |
| Verify | Assert wiring, owners, and token metadata | `npm run wire:verify` & `npm run verify:agialpha -- --skip-onchain` | Verification transcripts |
| Owner health | Prove owner can adjust every parameter | `npm run owner:health` & `npm run owner:plan` | `owner-plan.csv`, Safe bundle |
| Hand-off | Capture runbook, addresses, and pause procedures | Manual entry | Change-control ticket, vault notes |

Every command is idempotent and safe to re-run. Treat warnings as a request to halt and investigate before continuing.

---

## 2. Environment preparation checklist

1. **Hardware security module ready** – Ledger, Safe, or other signer funded with ≥0.5 ETH.
2. **Secondary reviewer on standby** – Governance must co-sign addresses before enabling production traffic.
3. **Node.js & npm** – Run `nvm use` to match `.nvmrc`, then `npm install`.
4. **`.env` hygiene** – Copy `.env.example` to `.env` and fill only the deployment wallet private key.
5. **Backups** – Ensure password manager entry for the deployment includes RPC endpoint, governance address, and ENS roots.
6. **Dry-run target** – Complete the entire flow on Sepolia (`npm run migrate:sepolia`) before touching mainnet.

Document completion of each bullet inside your change-control ticket.

---

## 3. Critical variables

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `MAINNET_RPC_URL` | ✅ | HTTPS RPC endpoint with archival access | `https://mainnet.infura.io/v3/<key>` |
| `MAINNET_PRIVATE_KEY` | ✅ | Deployer wallet key (no commas/spaces) | `0xabc...` |
| `GOVERNANCE_ADDRESS` | ✅ | Multisig or timelock that should own every module | `0x1234...` |
| `ETHERSCAN_API_KEY` | ✅ | Enables automatic source-code verification | `ABCD1234...` |
| `FEE_PCT`, `BURN_PCT` | Optional | Override protocol economics (% integers) | `5` |
| `NO_TAX` | Optional | Set to `1` to skip TaxPolicy | `1` |

Store these values in `.env` and reference them in incident reports.

---

## 4. Deployment configuration files

1. **`config/agialpha.json`** – Canonical AGIALPHA token metadata (address, decimals, symbol). Run `npm run compile` after edits.
2. **`deployment-config/mainnet.json`** – Governance address, ENS roots, Merkle roots, and economic overrides. Supports natural-language durations (`"48h"`) and AGIALPHA-denominated stakes (`"1500"`).
3. **`config/ens.mainnet.json`** – ENS registry and name wrapper addresses plus canonical agent/club roots. Refresh hashes via `npm run namehash:mainnet`.

All three files are consumed by the migrations and owner tooling—keep them in Git for reproducibility.

---

## 5. Migration scripts overview

| Migration | Purpose | Key environment hooks |
| --- | --- | --- |
| `1_initial_migration.js` | Standard Truffle housekeeping; deploys `Migrations` helper | None |
| `2_deploy_protocol.js` | Deploys `Deployer` and validates AGIALPHA config alignment | `config/agialpha.json`, `deployment-config/mainnet.json` |
| `2b_deploy_test_token_if_needed.js` | (Testnets) Deploys mock AGIALPHA token when `DEPLOY_LOCAL_ERC20=1` | `DEPLOY_LOCAL_ERC20` |
| `3_wire_protocol.js` | Invokes `Deployer` to fan out all modules with deterministic addresses, writes `docs/deployment-addresses.json` | `GOVERNANCE_ADDRESS`, `FEE_PCT`, `BURN_PCT`, `NO_TAX`, `deployment-config/mainnet.json` |
| `4_configure_ens.js` | Syncs `IdentityRegistry` ENS + Merkle roots from config | `config/ens.<network>.json` |
| `5_transfer_ownership.js` | Hands ownership to governance, pauser, and multisig accounts | `deployment-config/<network>.json`, `GOVERNANCE_ADDRESS` |

Keep the migrations folder under version control. The workflow `npm run migrate:mainnet` runs them sequentially with verbose logging.

---

## 6. End-to-end mainnet procedure

1. **Preflight** – `env DOTENV_PATH=.env npm run deploy:checklist`
   - Resolve every ❌ before proceeding. The script catches RPC misconfigurations, missing migrations, and inconsistent config files.
2. **Compile** – `npm run compile:mainnet`
   - Re-generates constants and ensures Solidity optimizer/viaIR are applied.
3. **Deploy** – `npm run migrate:mainnet`
   - Wraps `truffle migrate --network mainnet --reset` and reruns wiring verification automatically.
   - Capture `docs/deployment-addresses.json`, transaction hashes, and console output in the change log.
4. **Verify contracts** – `npx truffle run verify ... --network mainnet`
   - Re-run on failure; verification is idempotent.
5. **Owner assertions** –
   - `npm run owner:health` – proves each setter succeeds after ownership hand-off.
   - `npm run owner:plan > owner-plan.csv` – produces a transaction checklist and (optionally) Safe bundle via `npm run owner:plan:safe`.
6. **Documentation** – Update the operational vault with addresses, pauser instructions, and emergency contacts. Link artefacts to the change ticket.

---

## 7. Non-technical guardrails

- **Pause switch** – The `SystemPause` contract owns all pauseable modules. Store its address and the pauser key in a secure vault. Practice `npx hardhat run scripts/v2/updateSystemPause.ts --network mainnet --pause` on a testnet.
- **Parameter adjustments** – Use `npm run owner:wizard` for a guided walkthrough to change fees, stakes, or ENS registrars without writing calldata.
- **Change logging** – Preserve JSON outputs and CLI transcripts. They provide evidence for auditors and simplify incident response.
- **Rollback plan** – If any module is misconfigured, pause the system first, then execute the Safe bundle generated by `owner:plan:safe` to restore the intended configuration.

---

## 8. Operational QA sign-off

Complete the following checklist before closing the deployment ticket:

- [ ] `docs/deployment-addresses.json` stored in the vault and reviewed by governance.
- [ ] `owner-plan.csv` reviewed and uploaded to the Safe Transaction Builder.
- [ ] Etherscan verification status recorded (link to verified contracts).
- [ ] `npm run owner:health` log archived.
- [ ] Emergency pause drill performed on Sepolia within the last 30 days.
- [ ] Runbook updated with contact tree and on-call rotation.

Sign-off requires signatures from the deployment operator, governance representative, and compliance reviewer.

---

## 9. Troubleshooting quick reference

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| `AGIALPHA token address missing` | `config/agialpha.json` lacks address or decimals mismatch | Update config and rerun `npm run compile` |
| `deployment-config ... not found` warning | Missing per-network overrides | Copy `deployment-config/template.json` to `mainnet.json` and customise |
| `GOVERNANCE_ADDRESS must be provided` error | Environment variable unset during migration | Export `GOVERNANCE_ADDRESS` before running `npm run migrate:mainnet` |
| ENS root mismatch | Stale hash in `config/ens.mainnet.json` | Run `npm run namehash:mainnet` and commit the updated file |
| Owner healthcheck revert | Ownership transfer incomplete | Execute `npm run owner:plan` and follow generated transactions |

Escalate unresolved issues to the security contact listed in [`SECURITY.md`](../../SECURITY.md).

---

## 10. Further reading

- [Non-Technical Mainnet Deployment Runbook (Truffle)](./nontechnical-mainnet-deployment.md)
- [Deploying AGIJobs v2 to Ethereum Mainnet (CLI Guide)](../deploying-agijobs-v2-truffle-cli.md)
- [`migrations/` folder](../../migrations) for exact execution logic.
- [`docs/production/deployment-production-guide.md`](./deployment-production-guide.md) for broader operational context.

Maintain this playbook as a living document—update it after every production launch to capture lessons learned and keep the process audit-ready.
