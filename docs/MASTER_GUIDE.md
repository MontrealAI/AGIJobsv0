# MASTER\_GUIDE.md

**AGI Jobs v2 — Mainnet Deployment, Operations & Etherscan How‑To (Single Source)**

> **Audience**: Platform operators, technical stakeholders, and power users who will **deploy, configure, govern, and operate** AGI Jobs on **Ethereum mainnet** using **Etherscan only** (no CLI).
> **Scope**: End‑to‑end: architecture recap → deployment order & constructor inputs → wiring → identity & allowlists (ENS) → fees/burning/policies → governance handoff → day‑to‑day operations by role (Employer/Agent/Validator) → dispute flow → maintenance, safety & troubleshooting.
> **Token**: `$AGIALPHA` (18‑decimals).
> **Design note**: Owner/governance has broad, explicit control (acceptable in this trust model). **True burning** is enforced by calling the token’s `burn(...)` (not “dead address” sends).

---

## Table of Contents

1. [Quick Primer](#quick-primer)
2. [Architecture at a Glance](#architecture-at-a-glance)
3. [Mainnet Prerequisites](#mainnet-prerequisites)
4. [Deployment (Etherscan Only)](#deployment-etherscan-only)

   * 4.1 [Module Order & Constructors](#41-module-order--constructors)
   * 4.2 [Wiring Options](#42-wiring-options)
5. [Identity & Access (ENS + Allowlists)](#identity--access-ens--allowlists)
6. [Economic & Policy Configuration](#economic--policy-configuration)
7. [Governance Handoff (Multisig/Timelock)](#governance-handoff-multisigtimelock)
8. [Operate the Platform (Etherscan Runbooks)](#operate-the-platform-etherscan-runbooks)

   * 8.1 [Employer](#81-employer)
   * 8.2 [Agent](#82-agent)
   * 8.3 [Validator](#83-validator)
   * 8.4 [Finalize & Payouts](#84-finalize--payouts)
   * 8.5 [Disputes](#85-disputes)
9. [Maintenance & Safety](#maintenance--safety)
10. [Troubleshooting](#troubleshooting)
11. [Appendix](#appendix)

* A. [Address Book Template](#a-address-book-template)
* B. [Decimals & Amounts](#b-decimals--amounts)
* C. [Events to Watch](#c-events-to-watch)
* D. [Common Function Map](#d-common-function-map)

---

## Quick Primer

* **What it is**: A modular on‑chain marketplace for AI work. Employers post jobs → Agents do jobs → Validators review via commit/reveal → automatic payouts, reputation updates, NFT certificates, with optional disputes.
* **How you’ll interact**: **Etherscan** “Contract” tab → **Write** functions. Connect wallet → input parameters → sign.
* **Key properties**:

  * **Owner can update parameters** (fees, windows, allowlists, treasuries, burn pct, etc.).
  * **True burning**: `$AGIALPHA` fees can be **burned via `burn()`** (real supply reduction).
  * **ENS identity** (optional): Agents use `*.agent.agi.eth`, Validators use `*.club.agi.eth`.
  * **Subdomains**: Will be **available to purchase separately in `$AGIALPHA` within the `agi.eth` ecosystem** (outside this deployment).
  * **No images/external files required**: This guide is self‑contained.

---

## Architecture at a Glance

* **JobRegistry** — hub for job lifecycle (create/apply/submit/finalize/dispute bridge).
* **StakeManager** — stakes, reward escrow, releases, slashing.
* **ValidationModule** — validator selection + commit‑reveal voting windows.
* **DisputeModule** — escalate/resolve when outcomes are challenged.
* **ReputationEngine** — reputation updates, optional blacklist.
* **CertificateNFT** — NFT certificate upon successful completion.
* **FeePool** — collects fees; can burn `%` of fees and forward remainder to treasury.
* **IdentityRegistry** *(optional)* — ENS/merkle allowlists for Agents/Validators.
* **PlatformRegistry / JobRouter / PlatformIncentives** *(optional)* — multi‑platform routing & incentives.
* **TaxPolicy** *(optional)* — require user acknowledgment of terms/tax policy.

---

## Mainnet Prerequisites

1. **Wallet** with ETH for gas (deployer/owner; ideally hardware wallet or multisig).
2. **`$AGIALPHA` address** (mainnet) and 18‑decimals assumption.
3. **ENS (optional)**:

   * Parent domain `agi.eth` under your control.
   * Subroots: `agent.agi.eth`, `club.agi.eth` (you will use **namehash** values).
   * ENS Registry & NameWrapper addresses (mainnet).
   * Subdomain issuance and resolver setup: see [ens-identity-setup.md](ens-identity-setup.md).
4. **Constructor inputs** ready (see below).
5. **Plan for governance** (immediate or post‑setup transfer to multisig/timelock).

---

## Deployment (Etherscan Only)

> **Tip**: After each deploy, **record the address** (use the Address Book template). Verify contracts on Etherscan to enable **Read/Write** tabs.

### 4.1 Module Order & Constructors

Deploy in this order. For any constructor parameter that expects an address that you haven’t deployed yet, **use `0x0000000000000000000000000000000000000000`** as a temporary placeholder; you will wire later.

1. **StakeManager**

   * `token`: `$AGIALPHA` token address
   * `minStake`: `0` (accept default) or custom min (wei)
   * `employerPct`, `treasuryPct`: slashed stake split in basis points (e.g., `5000` = 50%); often `0,0` to route 100% via treasury logic
   * `treasury`: your treasury address
   * *(placeholders for other modules if present)*

2. **ReputationEngine**

   * `stakeManager`: StakeManager address

3. **IdentityRegistry** *(optional)*

   * `ensRegistry`: mainnet ENS Registry
   * `nameWrapper`: mainnet NameWrapper (if using wrapped subdomains)
   * `reputationEngine`: address from step 2
   * `agentRootNode`: namehash(`agent.agi.eth`) or `0x0` for open access
   * `clubRootNode`: namehash(`club.agi.eth`) or `0x0` for open access

4. **ValidationModule**

   * `jobRegistry`: `0x0` (wire later)
   * `stakeManager`: StakeManager address
   * `commitWindow`: e.g., `86400` (24h)
   * `revealWindow`: e.g., `86400` (24h)
   * `minValidators`: e.g., `1`
   * `maxValidators`: e.g., `3`
   * `validatorPool`: `[]` (open) or addresses

5. **DisputeModule**

   * `jobRegistry`: `0x0` (wire later)
   * `disputeFee`: e.g., `0` (or `1e18` = 1 token)
   * `disputeWindow`: e.g., seconds (24–72h)
   * `moderator`: address (or `0x0` for none)

6. **CertificateNFT**

   * `name`: e.g., `"AGI Jobs Certificate"`
   * `symbol`: e.g., `"AGIJOB"`

7. **FeePool**

   * `token`: `$AGIALPHA`
   * `stakeManager`: StakeManager address
   * `burnPct`: basis points (e.g., `500` = 5%)
   * `treasury`: treasury receiver for remainder/dust

8. **PlatformRegistry** *(optional)*

   * `stakeManager`, `reputationEngine`, `minStakeForPlatform`

9. **JobRouter** *(optional)*

   * `platformRegistry`

10. **PlatformIncentives** *(optional)*

* `stakeManager`, `platformRegistry`, `jobRouter`

11. **TaxPolicy** *(optional)*

* `policyURI` (IPFS/URL or short text)

12. **JobRegistry** *(last)*

* `validationModule`, `stakeManager`, `reputationEngine`, `disputeModule`, `certificateNFT`
* `identityRegistry` *(or `0x0`)*
* `taxPolicy` *(or `0x0`)*
* `feePct` (bps; e.g., `500` = 5%)
* `jobStake` (per‑job extra stake; often `0`)
* `ackModules` (array; usually `[]`)
* *(optional `owner` if constructor includes it; else deployer becomes owner)*

### 4.2 Wiring Options

After deploy, **wire** modules so they know each other.

**Option A — ModuleInstaller (one‑shot, recommended)**

1. Deploy **ModuleInstaller** (helper in repo).
2. On each module (StakeManager, ValidationModule, DisputeModule, ReputationEngine, CertificateNFT, FeePool, and any Platform modules, IdentityRegistry):

   * Call `transferOwnership(installer)` (or `setGovernance(installer)` where applicable).
3. On ModuleInstaller: call `initialize(jobRegistry, stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)` — use `0x0` for any optional module you did not deploy.

   * Installer sets cross‑links and returns ownership back to you.
4. If **IdentityRegistry** is used, also call on:

   * `JobRegistry.setIdentityRegistry(identityRegistry)`
   * `ValidationModule.setIdentityRegistry(identityRegistry)`
5. Sanity‑check in **Read** tabs (addresses match).

**Option B — Manual Wiring (explicit setters)**

* `JobRegistry.setModules(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, feePool, [])`
* `StakeManager.setJobRegistry(jobRegistry)`
* `ValidationModule.setJobRegistry(jobRegistry)`
* `DisputeModule.setJobRegistry(jobRegistry)`
* `CertificateNFT.setJobRegistry(jobRegistry)` and `CertificateNFT.setStakeManager(stakeManager)`
* `StakeManager.setDisputeModule(disputeModule)`
* If **IdentityRegistry**: `JobRegistry.setIdentityRegistry(identityRegistry)`, `ValidationModule.setIdentityRegistry(identityRegistry)`
* If **TaxPolicy**: `JobRegistry.setTaxPolicy(taxPolicy)` and (if present) `DisputeModule.setTaxPolicy(taxPolicy)`
* If **Platform modules**:

  * `PlatformRegistry.setRegistrar(platformIncentives, true)`
  * `JobRouter.setRegistrar(platformIncentives, true)`
* Sanity‑check in **Read** tabs (addresses match).

---

## Identity & Access (ENS + Allowlists)

* **Agents** must own `*.agent.agi.eth`. **Validators** must own `*.club.agi.eth`.
* **Subdomains**: Will be **purchased separately in `$AGIALPHA` within the `agi.eth` ecosystem** (outside this deployment). The operator does **not** mint them here; the ecosystem handles issuance/sales.
  See [ens-identity-setup.md](ens-identity-setup.md) for issuing
  `<name>.agent.agi.eth`/`<name>.club.agi.eth` and configuring resolver records.
* **IdentityRegistry** (if used) enforces:

  * `setAgentRootNode(namehash(agent.agi.eth))`
  * `setClubRootNode(namehash(club.agi.eth))`
  * Optional allowlists via `setAgentMerkleRoot(root)` / `setValidatorMerkleRoot(root)`
  * One‑offs via `addAdditionalAgent(addr)` / `addAdditionalValidator(addr)`
* If you do **not** want identity gating now, deploy IdentityRegistry with zeroed ENS fields (or omit the module). You can enable later and wire it in.

---

## Economic & Policy Configuration

All values are **owner‑settable** and can be updated via Etherscan **Write** tabs.

* **Protocol fee**: `JobRegistry.setFeePct(bps)` (e.g., `500` = 5%).
* **Burn percentage**: `FeePool.setBurnPct(bps)` — burning uses token’s `burn(...)` to reduce supply (**true burn**).
* **Treasury**: `StakeManager.setTreasury(addr)` (slashed funds, fee remainders).
* **Slashing split**: `StakeManager.setSlashingPercentages(employerPct, treasuryPct)` (bps).
* **Minimum/maximum stake**: e.g., `StakeManager.setMinStake(amountWei)`, `setMaxStakePerAddress(amountWei)` (if supported in your version).
* **Validation windows**: `ValidationModule.setCommitWindow(seconds)`, `setRevealWindow(seconds)`.
* **Dispute fee & window**: `DisputeModule.setDisputeFee(amountWei)`, (and any jury/moderator params your version supports).
* **Tax policy** (optional): `TaxPolicy.setPolicyURI(uri)`, bump version, require users to call `acknowledge(...)` before actions.

> **Tip**: Change one knob at a time. Confirm with **events** and **Read** values.

---

## Governance Handoff (Multisig/Timelock)

1. Deploy/prepare your **Gnosis Safe** or **Timelock**.
2. On each module, call `transferOwnership(multisig)` or `setGovernance(multisig)` (where applicable).
3. Verify ownership via **Read** (`owner()` or `governance()`).
4. From now on, parameter changes go through the governance flow.

> **Best practice**: Keep emergency keys to a **Pausable** switch if included (e.g., `pause()`/`unpause()`), or ensure governance can invoke pause quickly.

---

## Operate the Platform (Etherscan Runbooks)

All amounts are `$AGIALPHA` **wei** (18 decimals). **Always** `approve` the relevant contract for token spends first.

### 8.1 Employer

**Goal**: Post a job and fund reward.

1. `$AGIALPHA.approve(spender=StakeManager, amount=reward*(1+fee))`
2. `JobRegistry.createJob(reward, uri)`

   * `reward`: e.g., `100e18` → `100000000000000000000`
   * `uri`: IPFS/URL to job spec (optionally also include a content hash variant if your version supports it).
3. Note `jobId` from `JobCreated` event/log.

### 8.2 Agent

**Goal**: Stake, apply, submit results.

1. **Stake once** (role 0): `$AGIALPHA.approve(StakeManager, amount)` → `StakeManager.depositStake(role=0, amount)`
2. **Apply**: `JobRegistry.applyForJob(jobId, subdomainLabel, proof[])`

   * If identity gating → `subdomainLabel="alice"` for `alice.agent.agi.eth`, plus allowlist `proof[]` if enabled.
   * Shortcut: `JobRegistry.stakeAndApply(jobId, amount)` (if present).
3. **Submit**: `JobRegistry.submit(jobId, resultHash, resultURI, subdomainLabel, proof[])` (names vary slightly by version; include identity params if required).

### 8.3 Validator

**Goal**: Commit→Reveal vote.

1. **Stake once** (role 1): `$AGIALPHA.approve(StakeManager, amount)` → `StakeManager.depositStake(role=1, amount)`
2. **Commit** (during commit window):

   * Compute `commitHash = keccak256(abi.encode(jobId, approveBool, salt))`.
   * `ValidationModule.commitValidation(jobId, commitHash, subdomainLabel, proof[])`
3. **Reveal** (during reveal window):

   * `ValidationModule.revealValidation(jobId, approveBool, salt, subdomain, proof)`

### 8.4 Finalize & Payouts

* After reveal window, **anyone** calls: `ValidationModule.finalize(jobId)`
* Effects (happy path):

  * Agent gets reward minus protocol fee/validator share.
  * Validators get rewards (per config).
  * FeePool collects fee; **burnPct** triggers **`burn(...)`** on `$AGIALPHA`.
  * CertificateNFT mints to the Agent.
  * Reputation updates.

### 8.5 Disputes

* Raise: `JobRegistry.raiseDispute(jobId, evidenceURI)` (escrows dispute fee if set).
* Resolve (moderator/governance as configured): `DisputeModule.resolve(jobId, employerWinsBool[, signatures])`
* Outcome adjusts payouts/slashes accordingly and finalizes job.

---

## Maintenance & Safety

* **Parameter updates**: Use owner setters listed in [Economic & Policy Configuration](#economic--policy-configuration).
* **Swap a module** (e.g., new ValidationModule): deploy new module → `JobRegistry.setValidationModule(newAddr)` → test.
* **Emergency**: If Pausable is present, `pause()` to halt writes; `unpause()` when resolved.
* **Monitoring**: Subscribe to critical events (see Appendix C).
* **Docs hygiene**: Keep your Address Book updated in‑repo.

---

## Troubleshooting

* **`transfer amount exceeds allowance`**: Approve the correct `spender` (usually **StakeManager**) for enough `$AGIALPHA`.
* **`NotOpen` / `InvalidState`**: Ensure job is in the correct state (e.g., don’t apply after another agent claimed).
* **Identity reverts** (`NotAuthorizedAgent/Validator`)

  * ENS subdomain not owned or not set; wrong `subdomainLabel`; allowlist proof incorrect.
  * IdentityRegistry not wired where required.
* **Too early to finalize**: Wait until reveal window ends.
* **Decimals mistake**: All amounts are **18‑decimals**.
* **Ownership**: If you transferred to multisig, your EOA can no longer call owner functions.
* **Module address mismatch**: Re‑check [Wiring](#42-wiring-options) and fix setters.

---

## Appendix

### A. Address Book Template

Create `docs/deployment-addresses.json` (or similar) and keep it updated:

```json
{
  "network": "ethereum-mainnet",
  "token": "0xAGI_ALPHA_TOKEN_ADDRESS",
  "treasury": "0xTREASURY_ADDRESS",
  "stakeManager": "0x...",
  "reputationEngine": "0x...",
  "identityRegistry": "0x...",
  "validationModule": "0x...",
  "disputeModule": "0x...",
  "certificateNFT": "0x...",
  "feePool": "0x...",
  "platformRegistry": "0x...",
  "jobRouter": "0x...",
  "platformIncentives": "0x...",
  "taxPolicy": "0x...",
  "jobRegistry": "0x...",
  "moduleInstaller": "0x..."
}
```

### B. Decimals & Amounts

* `$AGIALPHA` uses **18 decimals**.
* Examples:

  * `1` token → `1000000000000000000`
  * `100` tokens → `100000000000000000000`
* Fees & percentages often in **basis points** (bps):

  * `500` bps = `5.00%`
  * `10000` bps = `100%`

### C. Events to Watch

* **Lifecycle**: `JobCreated`, `JobApplied`, `JobSubmitted`, `ValidatorsSelected`, `JobFinalized`
* **Stake**: `StakeDeposited`, `StakeWithdrawn`, `StakeSlashed`
* **Validation**: `ValidationCommitted`, `ValidationRevealed`
* **Dispute**: `DisputeRaised`, `DisputeResolved`
* **Config**: `ModulesUpdated`, `FeePctUpdated`, `BurnPctUpdated`, `TreasuryUpdated`, `OwnershipTransferred`

### D. Common Function Map

**JobRegistry**

* `createJob(reward, uri)`
* `applyForJob(jobId, subdomainLabel, proof[])`
* `submit(jobId, resultHash, resultURI, subdomainLabel, proof[])` *(name may vary slightly)*
* `raiseDispute(jobId, evidenceURI)`
* Setters: `setModules(...)`, `setFeePct(bps)`, `setIdentityRegistry(addr)`, `setTaxPolicy(addr)`

**StakeManager**

* `depositStake(role, amount)` (`0`=Agent, `1`=Validator)
* `withdrawStake(role, amount)`
* Setters: `setJobRegistry(addr)`, `setDisputeModule(addr)`, `setTreasury(addr)`, `setSlashingPercentages(empBps, treasBps)`

**ValidationModule**

* `commitValidation(jobId, commitHash, subdomainLabel, proof[])`
* `revealValidation(jobId, approve, salt, subdomain, proof)`
* `finalize(jobId)`
* Setters: `setJobRegistry(addr)`, `setCommitWindow(sec)`, `setRevealWindow(sec)`, `setIdentityRegistry(addr)`

**DisputeModule**

* `resolve(jobId, employerWins[, signatures])`
* Setters: `setJobRegistry(addr)`, `setDisputeFee(amount)`, `setTaxPolicy(addr)`, moderator controls

**CertificateNFT**

* Setters: `setJobRegistry(addr)`, `setStakeManager(addr)` (and `setBaseURI(...)` if present)

**FeePool**

* Setters: `setBurnPct(bps)` (burns via token’s `burn(...)`), `setTreasury(addr)`

**IdentityRegistry** *(optional)*

* Setters: `setAgentRootNode(node)`, `setClubRootNode(node)`, `setAgentMerkleRoot(root)`, `setValidatorMerkleRoot(root)`, `addAdditionalAgent(addr)`, `addAdditionalValidator(addr)`

**Platform modules** *(optional)*

* `PlatformRegistry.setRegistrar(addr, true)`
* `JobRouter.setRegistrar(addr, true)`
* `PlatformIncentives` staking/registration helpers

---

> This **Master Guide** merges:
>
> * **AGI Jobs v2 Deployment & Usage** https://chatgpt.com/s/dr_68bb15c88e588191b80af3cb044190f2 (operator‑level),
> * **Mainnet Deployment via Etherscan** https://chatgpt.com/s/dr_68bb10b1fe208191b7539bb6b3d9cdd7 (module‑by‑module, constructor & wiring), and
> * **Using AGIJobs via Etherscan** https://chatgpt.com/s/dr_68bb0179b3348191ae0ef37d21d6d6fa (role‑based runbooks),
>   into a single, production‑grade document for the repository.
