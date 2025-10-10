# AGI Jobs v2 — Mainnet Etherscan Deployment & Owner Control Runbook

> **Audience:** Non-technical product owners or programme managers who must deploy and operate
> AGI Jobs v2 on Ethereum mainnet without bespoke scripting.
>
> **Goal:** Provide a single, production-safe checklist that walks through (i) repository
> readiness, (ii) green CI v2 gating, (iii) deterministic deployment using the guided Truffle
> wizard, and (iv) day-two owner operations executed entirely from Etherscan.
>
> This runbook complements existing deep-dive manuals (for example
> [`docs/production/nontechnical-mainnet-deployment.md`](nontechnical-mainnet-deployment.md) and
> [`docs/v2-ci-operations.md`](../v2-ci-operations.md)) by stitching them into a single
> “follow-the-prompts” story. Every command below is safe to paste and produces human-readable
> guidance before broadcasting transactions.

---

## 1. Decision tree at a glance

```mermaid
flowchart TD
    A[Confirm repo hygiene\n`git status --short`] --> B{Any diffs?}
    B -- Yes --> B1[Commit/stash before production\n(avoids stale artifacts)] --> A
    B -- No --> C[Run CI locally\n`npm ci && npm run lint && npm test`]
    C --> D{All green?}
    D -- No --> D1[Fix failures until local CI passes\nCI v2 must be green]
    D -- Yes --> E[Deployment checklist\n`env DOTENV_PATH=.env npm run deploy:checklist`]
    E --> F{Checklist ✅?}
    F -- No --> F1[Resolve RPC / config / ENS issues\nthen rerun]
    F -- Yes --> G[Guided mainnet deploy\n`npm run migrate:wizard -- --network mainnet --execute`]
    G --> H[Archive emitted addresses\n`deployment-reports/mainnet-*`]
    H --> I[Owner health report\n`npm run owner:health`]
    I --> J[Owner control plan\n`npm run owner:plan`]
    J --> K[Etherscan verification & controls\nuse ABI + owner setters]
    K --> L[Ongoing monitoring\n`npm run owner:pulse` / `npm run owner:dashboard`]
```

Keep this graph open during the process. Each node maps to a concrete command or Etherscan
interaction covered below.

---

## 2. Pre-flight hardening (once per workstation)

| Item | Why it matters | Command / Link |
| --- | --- | --- |
| Node.js 20.18.1 | Matches CI toolchain to avoid compiler drift | `nvm use` |
| Clean git tree | Guarantees deterministic artifacts & ABIs | `git status --short` |
| Dependencies | Installs locked tool versions | `npm ci --no-audit --progress=false` |
| Green local CI | Mirrors the GitHub Actions matrix | `npm run lint && npm test` |
| AGIALPHA config | Rebuilds Solidity constants after edits | `npm run compile` |
| Secrets vault | Protects deploy key & RPC URL | `.env` copied from `.env.example`, stored encrypted |

> ✅ **CI v2 parity:** The public workflow [`ci.yml`](../../.github/workflows/ci.yml) enforces the
> same steps (lint → tests → Foundry → coverage → summary). Local parity ensures the GitHub badge
> is green before mainnet operations.

---

## 3. Deployment checklists (no transactions yet)

1. Populate `deployment-config/mainnet.json` with governance, ENS namehashes, and economics.
   - Use `node scripts/compute-namehash.js deployment-config/mainnet.json` after editing names.
   - Ensure the `$AGIALPHA` token address matches [`config/agialpha.mainnet.json`](../../config/agialpha.mainnet.json).
2. Copy `.env.example` to `.env` and fill in `MAINNET_RPC_URL`, `MAINNET_PRIVATE_KEY`,
   and `ETHERSCAN_API_KEY`. Keep the file encrypted at rest.
3. Run the automated readiness scan:

   ```bash
   env DOTENV_PATH=.env npm run deploy:checklist
   ```

   The script validates RPC reachability, ENS hashes, governance configuration,
   and Truffle migration availability. Resolve any ❌ row before continuing.

4. Optional: preview the full deployment without broadcasting transactions:

   ```bash
   npm run migrate:wizard -- --network mainnet
   ```

   The wizard performs a dry run, rendering each step and collecting constructor parameters so you
   can review them with stakeholders.

---

## 4. Execute the guided mainnet deployment

1. Export your governance multisig or timelock address so migrations wire every module correctly:

   ```bash
   export GOVERNANCE_ADDRESS=0xYourGovernanceSafe
   ```

2. Launch the guided deployer. The `--execute` flag is the only difference from the dry run.

   ```bash
   npm run migrate:wizard -- --network mainnet --execute
   ```

   Under the hood this will:

   - regenerate Solidity constants (`scripts/generate-constants.ts`)
   - compile with optimizer/viaIR (`hardhat compile`)
   - execute Truffle migrations 1–5 (StakeManager, JobRegistry, FeePool, IdentityRegistry,
     Validation/Dispute modules, CertificateNFT, etc.)
   - run post-deployment wiring checks (`npm run wire:verify`)
   - auto-verify sources on Etherscan when `ETHERSCAN_API_KEY` is present

3. Capture the emitted contract addresses. The wizard writes
   `deployment-reports/mainnet-<timestamp>.json` with a module inventory you can share with your
   reviewer.

4. Re-run the verification step if the automatic upload was skipped:

   ```bash
   npx truffle run verify Deployer StakeManager JobRegistry --network mainnet
   ```

   Append additional modules (e.g., `FeePool`, `IdentityRegistry`) as needed until every
   contract shows “Verified” on Etherscan.

---

## 5. Owner control surface (Etherscan + CLI pairing)

Immediately after deployment, confirm governance authority and generate an explicit change plan:

```bash
npm run owner:health        # Tabular owner snapshot with ENS + module wiring
npm run owner:plan          # CSV of callable setters grouped by domain
npm run owner:plan:safe     # Safe Transaction Builder bundle (JSON)
npm run owner:dashboard     # Markdown dashboard for non-technical review
```

Store the outputs in your secure vault. The Safe bundle can be uploaded directly to
<https://app.safe.global/transactions/builder> for multi-sig execution without manual calldata.

---

## 6. Manual owner actions via Etherscan

Once the contracts are verified, every privileged adjustment can be executed from the
**“Write Contract”** tab using the governance wallet. The table below lists the highest-leverage
setters and where they live in the codebase (so auditors can cross-check NatSpec tooltips):

| Module | Key setter | Purpose | Reference |
| --- | --- | --- | --- |
| `StakeManager` | `setMinStake(uint256)` | Adjusts the global minimum stake requirement | [`contracts/v2/StakeManager.sol#L736-L744`](../../contracts/v2/StakeManager.sol#L736-L744) |
| | `setRoleMinimums(uint256,uint256,uint256)` | Custom stake floors per role | [`contracts/v2/StakeManager.sol#L720-L734`](../../contracts/v2/StakeManager.sol#L720-L734) |
| | `setFeePct(uint256)` / `setBurnPct(uint256)` | Tunes platform fee split and burn percentage | [`contracts/v2/StakeManager.sol#L1334-L1360`](../../contracts/v2/StakeManager.sol#L1334-L1360) |
| | `setTreasury(address)` & `setTreasuryAllowlist(address,bool)` | Routes slashed funds to an approved treasury | [`contracts/v2/StakeManager.sol#L1205-L1221`](../../contracts/v2/StakeManager.sol#L1205-L1221) |
| | `setModules(address,address)` | Hot-swaps JobRegistry & DisputeModule wiring | [`contracts/v2/StakeManager.sol#L1290-L1294`](../../contracts/v2/StakeManager.sol#L1290-L1294) |
| `JobRegistry` | `setFeePct(uint256)` / `setJobStake(uint96)` | Controls employer fees & escrow stake | [`contracts/v2/JobRegistry.sol#L1218-L1233`](../../contracts/v2/JobRegistry.sol#L1218-L1233) |
| | `setIdentityRegistry(address)` | Updates ENS verification source | [`contracts/v2/JobRegistry.sol#L1118-L1123`](../../contracts/v2/JobRegistry.sol#L1118-L1123) |
| | `setAgentRootNode(bytes32)` / `setValidatorRootNode(bytes32)` | Rotates ENS roots without redeploying | [`contracts/v2/JobRegistry.sol#L1158-L1187`](../../contracts/v2/JobRegistry.sol#L1158-L1187) |
| | `setTaxPolicy(address)` | Points at a new tax policy contract | [`contracts/v2/JobRegistry.sol#L1261-L1265`](../../contracts/v2/JobRegistry.sol#L1261-L1265) |
| | `pause()` / `unpause()` | Emergency stop for job lifecycle flows | [`contracts/v2/JobRegistry.sol#L1266-L1271`](../../contracts/v2/JobRegistry.sol#L1266-L1271) |
| `FeePool` | `setBurnPct(uint256)` | Adjusts burn share for collected fees | [`contracts/v2/FeePool.sol#L422-L426`](../../contracts/v2/FeePool.sol#L422-L426) |
| | `setTreasury(address)` & `setTreasuryAllowlist(address,bool)` | Controls where fee dust and distributions land | [`contracts/v2/FeePool.sol#L428-L436`](../../contracts/v2/FeePool.sol#L428-L436) |
| | `setRewarder(address,bool)` | Delegates reward distribution rights | [`contracts/v2/FeePool.sol#L159-L166`](../../contracts/v2/FeePool.sol#L159-L166) |
| | `setStakeManager(address)` | Repoints the upstream stake accounting contract | [`contracts/v2/FeePool.sol#L410-L415`](../../contracts/v2/FeePool.sol#L410-L415) |
| `IdentityRegistry` | `configureMainnet()` | Hard-wires ENS Registry + NameWrapper | [`contracts/v2/IdentityRegistry.sol`](../../contracts/v2/IdentityRegistry.sol) |
| | `setAgentRootNode(bytes32)` / `setValidatorRootNode(bytes32)` | Rotates ENS zones after governance approval | [`contracts/v2/IdentityRegistry.sol`](../../contracts/v2/IdentityRegistry.sol) |
| `RewardEngineMB` | `setRoleShare(uint8 role, uint256 share)` | Rebalances reward weights | [`contracts/v2/RewardEngineMB.sol#L112-L122`](../../contracts/v2/RewardEngineMB.sol#L112-L122) |
| | `setTreasury(address)` | Updates reward treasury recipient | [`contracts/v2/RewardEngineMB.sol#L184-L188`](../../contracts/v2/RewardEngineMB.sol#L184-L188) |
| | `setThermostat(address)` / `setTemperature(int256)` | Tunes thermodynamic incentives live | [`contracts/v2/RewardEngineMB.sol#L198-L206`](../../contracts/v2/RewardEngineMB.sol#L198-L206) |
| `Thermostat` | `setPID(int256,int256,int256)` | Refits PID controller constants | [`contracts/v2/Thermostat.sol#L52-L63`](../../contracts/v2/Thermostat.sol#L52-L63) |
| | `setSystemTemperature(int256)` | Global reward temperature override | [`contracts/v2/Thermostat.sol#L75-L82`](../../contracts/v2/Thermostat.sol#L75-L82) |
| `SystemPause` | `pauseAll()` / `unpauseAll()` | Atomically pauses the entire protocol | [`contracts/v2/SystemPause.sol#L198-L210`](../../contracts/v2/SystemPause.sol#L198-L210) |

> ℹ️ **Owner wallet tips:**
> - Connect the governance multisig to Etherscan via WalletConnect or the Safe browser extension.
> - Use the `Read Contract` tab to confirm current parameter values before and after any change.
> - Etherscan automatically displays NatSpec comments because the contracts are verified.

---

## 7. Post-deployment operational loop

1. **Weekly** – run `npm run owner:pulse` to generate a status digest (pauser roster, fee pool
   balances, pending disputes). Share with ops stakeholders.
2. **Monthly** – export a fresh owner change ticket:

   ```bash
   npm run owner:change-ticket > owner-change-ticket.md
   ```

   Review pending parameter updates, treasury rotations, and ENS maintenance windows.
3. **Emergency** – keep the governance wallet bookmarked on the `SystemPause` `pauseAll()` write
   tab. The `owner:emergency` script renders an annotated call sheet for tabletop exercises.
4. **Audit trail** – append every executed transaction hash to the deployment report JSON. The
   wizard stores these in `deployment-reports/` for long-term reference.

---

## 8. Troubleshooting reference

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| `deploy:checklist` fails ENS hash validation | Missing namehash in config | Re-run `node scripts/compute-namehash.js deployment-config/mainnet.json` |
| Wizard aborts during migrations | RPC timeout or insufficient gas | Increase gas price in `.env`, verify account balance, rerun wizard |
| Etherscan verification fails | Incorrect compiler settings | Ensure `npm run compile:mainnet` was executed; rerun `truffle run verify` |
| Governance calls revert on Etherscan | Wrong signer | Use the governance multisig or timelock owner; confirm with `owner:health` |
| FeePool distributions emit `TokenNotBurnable` | Token lacks `burn(uint256)` | Configure a non-zero `BURN_ADDRESS` or deploy ERC20Burnable token |

Keep this table handy for quick triage. For deeper investigation, the
[`docs/sre-runbooks.md`](../sre-runbooks.md) catalogue offers module-specific deep dives.

---

## 9. Checklist for institutional launch sign-off

- [ ] CI badge (`ci (v2)`) is green on the target commit.
- [ ] `deployment-reports/mainnet-*.json` stored in the secure vault with reviewer sign-off.
- [ ] Safe bundle (`owner-safe-bundle.json`) uploaded to the organisation’s Safe workspace.
- [ ] Etherscan `Read Contract` values match the intended economics (fees, stakes, ENS nodes).
- [ ] `owner:health` and `owner:pulse` outputs archived for auditors.
- [ ] Emergency contacts acknowledge the `SystemPause.pauseAll()` procedure.

When every box is ticked, the platform is production-ready for institutional usage with a
non-technical owner at the helm.
