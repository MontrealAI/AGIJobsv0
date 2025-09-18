# AGI Jobs v2 Master Guide

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

   - 4.1 [Module Order & Constructors](#41-module-order--constructors)
   - 4.2 [Wiring Options](#42-wiring-options)

5. [Identity & Access (ENS + Allowlists)](#identity--access-ens--allowlists)
6. [Economic & Policy Configuration](#economic--policy-configuration)
7. [Governance Handoff (Multisig/Timelock)](#governance-handoff-multisigtimelock)
8. [Operate the Platform (Etherscan Runbooks)](#operate-the-platform-etherscan-runbooks)

   - 8.1 [Employer](#81-employer)
   - 8.2 [Agent](#82-agent)
   - 8.3 [Validator](#83-validator)
   - 8.4 [Finalize & Payouts](#84-finalize--payouts)
   - 8.5 [Disputes](#85-disputes)

9. [Maintenance & Safety](#maintenance--safety)
10. [Troubleshooting](#troubleshooting)
11. [Appendix](#appendix)

- A. [Address Book Template](#a-address-book-template)
- B. [Decimals & Amounts](#b-decimals--amounts)
- C. [Events to Watch](#c-events-to-watch)
- D. [Common Function Map](#d-common-function-map)

---

## Quick Primer

- **What it is**: A modular on‑chain marketplace for AI work. Employers post jobs → Agents do jobs → Validators review via commit/reveal → automatic payouts, reputation updates, NFT certificates, with optional disputes.
- **How you’ll interact**: **Etherscan** “Contract” tab → **Write** functions. Connect wallet → input parameters → sign.
- **Key properties**:

  - **Owner can update parameters** (fees, windows, allowlists, treasuries, burn pct, etc.).
  - **True burning**: `$AGIALPHA` fees can be **burned via `burn()`** (real supply reduction).
  - **ENS identity** (optional): Agents use `*.agent.agi.eth`, Validators use `*.club.agi.eth`.
  - **Subdomains**: Will be **available to purchase separately in `$AGIALPHA` within the `agi.eth` ecosystem** (outside this deployment).
  - **No images/external files required**: This guide is self‑contained.

---

## Architecture at a Glance

- **JobRegistry** — hub for job lifecycle (create/apply/submit/finalize/dispute bridge).
- **StakeManager** — stakes, reward escrow, releases, slashing.
- **ValidationModule** — validator selection + commit‑reveal voting windows.
- **DisputeModule** — escalate/resolve when outcomes are challenged.
- **ReputationEngine** — reputation updates, optional blacklist.
- **CertificateNFT** — NFT certificate upon successful completion.
- **FeePool** — collects fees; burns a configured percentage and distributes the remainder to stakers, burning any undistributed amount when no stakers exist.
- **IdentityRegistry** _(optional)_ — ENS/merkle allowlists for Agents/Validators.
- **PlatformRegistry / JobRouter / PlatformIncentives** _(optional)_ — multi‑platform routing & incentives.
- **TaxPolicy** _(optional)_ — require user acknowledgment of terms/tax policy.

---

## Mainnet Prerequisites

1. **Wallet** with ETH for gas (deployer/owner; ideally hardware wallet or multisig).
2. **`$AGIALPHA` address** (mainnet) and 18‑decimals assumption.
3. **ENS (optional)**:

   - Parent domain `agi.eth` under your control.
   - Subroots: `agent.agi.eth`, `club.agi.eth` (you will use **namehash** values).
   - ENS Registry & NameWrapper addresses (mainnet).
   - Subdomain issuance and resolver setup: see [ens-identity-setup.md](ens-identity-setup.md).

4. **Constructor inputs** ready (see below).
5. **Plan for governance** (immediate or post‑setup transfer to multisig/timelock).

---

## Deployment (Etherscan Only)

> **Tip**: After each deploy, **record the address** (use the Address Book template). Verify contracts on Etherscan to enable **Read/Write** tabs.

### 4.1 Module Order & Constructors

Deploy in this order. For any constructor parameter that expects an address that you haven’t deployed yet, **use `0x0000000000000000000000000000000000000000`** as a temporary placeholder; you will wire later.

1. **StakeManager**

   - `token`: `$AGIALPHA` token address
   - `minStake`: `0` (accept default) or custom min (wei)
   - `employerPct`, `treasuryPct`: slashed stake split in basis points (e.g., `5000` = 50%); often `0,0` to route 100% via treasury logic
   - `treasury`: your treasury address
   - _(placeholders for other modules if present)_

2. **ReputationEngine**

   - `stakeManager`: StakeManager address

3. **IdentityRegistry** _(optional)_

   - `ensRegistry`: mainnet ENS Registry
   - `nameWrapper`: mainnet NameWrapper (if using wrapped subdomains)
   - `reputationEngine`: address from step 2
   - `agentRootNode`: namehash(`agent.agi.eth`) or `0x0` for open access
   - `clubRootNode`: namehash(`club.agi.eth`) or `0x0` for open access

4. **ValidationModule**

   - `jobRegistry`: `0x0` (wire later)
   - `stakeManager`: StakeManager address
   - `commitWindow`: e.g., `86400` (24h)
   - `revealWindow`: e.g., `86400` (24h)
   - `minValidators`: e.g., `1`
   - `maxValidators`: e.g., `3`
   - `validatorPool`: `[]` (open) or addresses

5. **DisputeModule**

   - `jobRegistry`: `0x0` (wire later)
   - `disputeFee`: e.g., `0` (or `1e18` = 1 token)
   - `disputeWindow`: e.g., seconds (24–72h)
   - `moderator`: address (or `0x0` for none)

6. **CertificateNFT**

   - `name`: e.g., `"AGI Jobs Certificate"`
   - `symbol`: e.g., `"AGIJOB"`

7. **FeePool**

   - `token`: `$AGIALPHA`
   - `stakeManager`: StakeManager address
   - `burnPct`: basis points (e.g., `500` = 5%)
   - `treasury`: treasury receiver for remainder/dust

8. **PlatformRegistry** _(optional)_

   - `stakeManager`, `reputationEngine`, `minStakeForPlatform`

9. **JobRouter** _(optional)_

   - `platformRegistry`

10. **PlatformIncentives** _(optional)_

- `stakeManager`, `platformRegistry`, `jobRouter`

11. **TaxPolicy** _(optional)_

- `policyURI` (IPFS/URL or short text)

12. **JobRegistry** _(last)_

- `validationModule`, `stakeManager`, `reputationEngine`, `disputeModule`, `certificateNFT`
- `identityRegistry` _(or `0x0`)_
- `taxPolicy` _(or `0x0`)_
- `feePct` (bps; e.g., `500` = 5%)
- `jobStake` (per‑job extra stake; often `0`)
- `ackModules` (array; usually `[]`)
- _(optional `owner` if constructor includes it; else deployer becomes owner)_

### 4.2 Wiring Options

After deploy, **wire** modules so they know each other.

**Option A — ModuleInstaller (one‑shot, recommended)**

1. Deploy **ModuleInstaller** (helper in repo).
2. On each module (StakeManager, ValidationModule, DisputeModule, ReputationEngine, CertificateNFT, FeePool, and any Platform modules, IdentityRegistry):

   - Call `transferOwnership(installer)` (or `setGovernance(installer)` where applicable).

3. On ModuleInstaller: call `initialize(jobRegistry, stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)` — use `0x0` for any optional module you did not deploy.

   - Installer sets cross‑links and returns ownership back to you.

4. If **IdentityRegistry** is used, also call on:

   - `JobRegistry.setIdentityRegistry(identityRegistry)`
   - `ValidationModule.setIdentityRegistry(identityRegistry)`

5. Sanity‑check in **Read** tabs (addresses match).

**Option B — Manual Wiring (explicit setters)**

- `JobRegistry.setModules(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, feePool, [])`
- `StakeManager.setJobRegistry(jobRegistry)`
- `ValidationModule.setJobRegistry(jobRegistry)`
- `DisputeModule.setJobRegistry(jobRegistry)`
- `CertificateNFT.setJobRegistry(jobRegistry)` and `CertificateNFT.setStakeManager(stakeManager)`
- `StakeManager.setDisputeModule(disputeModule)`
- If **IdentityRegistry**: `JobRegistry.setIdentityRegistry(identityRegistry)`, `ValidationModule.setIdentityRegistry(identityRegistry)`
- If **TaxPolicy**: `JobRegistry.setTaxPolicy(taxPolicy)` and (if present) `DisputeModule.setTaxPolicy(taxPolicy)`
- If **Platform modules**:

  - `PlatformRegistry.setRegistrar(platformIncentives, true)`
  - `JobRouter.setRegistrar(platformIncentives, true)`

- Sanity‑check in **Read** tabs (addresses match).

---

## Identity & Access (ENS + Allowlists)

- **Agents** must own `*.agent.agi.eth`. **Validators** must own `*.club.agi.eth`.
- **Subdomains**: Will be **purchased separately in `$AGIALPHA` within the `agi.eth` ecosystem** (outside this deployment). The operator does **not** mint them here; the ecosystem handles issuance/sales.
  See [ens-identity-setup.md](ens-identity-setup.md) for issuing
  `<name>.agent.agi.eth`/`<name>.club.agi.eth` and configuring resolver records.
- **IdentityRegistry** (if used) enforces:

  - `setAgentRootNode(namehash(agent.agi.eth))`
  - `setClubRootNode(namehash(club.agi.eth))`
  - Optional allowlists via `setAgentMerkleRoot(root)` / `setValidatorMerkleRoot(root)`
  - One‑offs via `addAdditionalAgent(addr)` / `addAdditionalValidator(addr)`

- If you do **not** want identity gating now, deploy IdentityRegistry with zeroed ENS fields (or omit the module). You can enable later and wire it in.

---

## Economic & Policy Configuration

All values are **owner‑settable** and can be updated via Etherscan **Write** tabs.

- **Protocol fee**: `JobRegistry.setFeePct(bps)` (e.g., `500` = 5%).
- **Burn percentage**: `FeePool.setBurnPct(bps)` — burning uses token’s `burn(...)` to reduce supply (**true burn**).
- **Treasury**: `StakeManager.setTreasury(addr)` (slashed funds, fee remainders).
- **Slashing split**: `StakeManager.setSlashingPercentages(employerPct, treasuryPct)` (bps).
- **Minimum/maximum stake**: e.g., `StakeManager.setMinStake(amountWei)`, `setMaxStakePerAddress(amountWei)` (if supported in your version).
- **Validation windows**: `ValidationModule.setCommitWindow(seconds)`, `setRevealWindow(seconds)`.
- **Dispute fee & window**: `DisputeModule.setDisputeFee(amountWei)`, (and any jury/moderator params your version supports).
- **Tax policy** (optional): `TaxPolicy.setPolicyURI(uri)`, bump version, require users to call `acknowledge(...)` before actions.

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

   - `reward`: e.g., `100e18` → `100000000000000000000`
   - `uri`: IPFS/URL to job spec (optionally also include a content hash variant if your version supports it).

3. Note `jobId` from `JobCreated` event/log.

### 8.2 Agent

**Goal**: Stake, apply, submit results.

1. **Stake once** (role 0): `$AGIALPHA.approve(StakeManager, amount)` → `StakeManager.depositStake(role=0, amount)`
2. **Apply**: `JobRegistry.applyForJob(jobId, subdomainLabel, proof[])`

   - If identity gating → `subdomainLabel="alice"` for `alice.agent.agi.eth`, plus allowlist `proof[]` if enabled.
   - Shortcut: `JobRegistry.stakeAndApply(jobId, amount)` (if present).

3. **Submit**: `JobRegistry.submit(jobId, resultHash, resultURI, subdomainLabel, proof[])` (names vary slightly by version; include identity params if required).

### 8.3 Validator

**Goal**: Commit→Reveal vote.

1. **Stake once** (role 1): `$AGIALPHA.approve(StakeManager, amount)` → `StakeManager.depositStake(role=1, amount)`
2. **Commit** (during commit window):

   - Compute `commitHash = keccak256(abi.encode(jobId, approveBool, salt))`.
   - `ValidationModule.commitValidation(jobId, commitHash, subdomainLabel, proof[])`

3. **Reveal** (during reveal window):

   - `ValidationModule.revealValidation(jobId, approveBool, salt, subdomain, proof)`

### 8.4 Finalize & Payouts

- After reveal window, **anyone** calls: `ValidationModule.finalize(jobId)`
- The employer then calls `JobRegistry.acknowledgeAndFinalize(jobId)` from their own wallet to release funds and burn the fee share.
- Effects (happy path):

  - Agent gets reward minus protocol fee/validator share.
  - Validators get rewards (per config).
  - FeePool collects fee; **burnPct** triggers **`burn(...)`** on `$AGIALPHA`.
  - CertificateNFT mints to the Agent.
  - Reputation updates.
  - **NFT boosts:** payouts scale by the highest multiplier returned from `StakeManager.getTotalPayoutPct`. Holding multiple NFTs uses only the largest `payoutPct` (e.g., `150%` and `125%` yield `150%`). Extra tokens are taken from fee and burn shares; if those pools lack funds the call reverts with `InsufficientEscrow`.
  - **Snapshot & claim:** multipliers are checked at payout. Stakers who obtain or lose NFTs should call `StakeManager.syncBoostedStake` before claiming from the `FeePool`. `FeePool.claimRewards()` performs this step automatically and pays boosted rewards even when totals exceed `100%`.

### 8.5 Disputes

- Raise: `JobRegistry.raiseDispute(jobId, evidenceURI)` (escrows dispute fee if set).
- Resolve (moderator/governance as configured): `DisputeModule.resolve(jobId, employerWinsBool[, signatures])`
- Outcome adjusts payouts/slashes accordingly and finalizes job.

---

## Maintenance & Safety

- **Parameter updates**: Use owner setters listed in [Economic & Policy Configuration](#economic--policy-configuration).
- **Swap a module** (e.g., new ValidationModule): deploy new module → `JobRegistry.setValidationModule(newAddr)` → test.
- **Emergency**: If Pausable is present, `pause()` to halt writes; `unpause()` when resolved.
- **Monitoring**: Subscribe to critical events (see Appendix C).
- **Docs hygiene**: Keep your Address Book updated in‑repo.

---

## Troubleshooting

- **`transfer amount exceeds allowance`**: Approve the correct `spender` (usually **StakeManager**) for enough `$AGIALPHA`.
- **`NotOpen` / `InvalidState`**: Ensure job is in the correct state (e.g., don’t apply after another agent claimed).
- **Identity reverts** (`NotAuthorizedAgent/Validator`)

  - ENS subdomain not owned or not set; wrong `subdomainLabel`; allowlist proof incorrect.
  - IdentityRegistry not wired where required.

- **Too early to finalize**: Wait until reveal window ends.
- **Decimals mistake**: All amounts are **18‑decimals**.
- **Ownership**: If you transferred to multisig, your EOA can no longer call owner functions.
- **Module address mismatch**: Re‑check [Wiring](#42-wiring-options) and fix setters.

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

- `$AGIALPHA` uses **18 decimals**.
- Examples:

  - `1` token → `1000000000000000000`
  - `100` tokens → `100000000000000000000`

- Fees & percentages often in **basis points** (bps):

  - `500` bps = `5.00%`
  - `10000` bps = `100%`

### C. Events to Watch

- **Lifecycle**: `JobCreated`, `ApplicationSubmitted`, `AgentAssigned`, `ResultSubmitted`, `ValidatorsSelected`, `JobFinalized`
- **Stake**: `StakeDeposited`, `StakeWithdrawn`, `StakeSlashed`
- **Validation**: `ValidationCommitted`, `ValidationRevealed`
- **Dispute**: `DisputeRaised`, `DisputeResolved`
- **Config**: `ModulesUpdated`, `FeePctUpdated`, `BurnPctUpdated`, `TreasuryUpdated`, `OwnershipTransferred`

### D. Common Function Map

**JobRegistry**

- `createJob(reward, uri)`
- `applyForJob(jobId, subdomainLabel, proof[])`
- `submit(jobId, resultHash, resultURI, subdomainLabel, proof[])` _(name may vary slightly)_
- `raiseDispute(jobId, evidenceURI)`
- Setters: `setModules(...)`, `setFeePct(bps)`, `setIdentityRegistry(addr)`, `setTaxPolicy(addr)`

**StakeManager**

- `depositStake(role, amount)` (`0`=Agent, `1`=Validator)
- `withdrawStake(role, amount)`
- Setters: `setJobRegistry(addr)`, `setDisputeModule(addr)`, `setTreasury(addr)`, `setSlashingPercentages(empBps, treasBps)`

**ValidationModule**

- `commitValidation(jobId, commitHash, subdomainLabel, proof[])`
- `revealValidation(jobId, approve, salt, subdomain, proof)`
- `finalize(jobId)`
- Setters: `setJobRegistry(addr)`, `setCommitWindow(sec)`, `setRevealWindow(sec)`, `setIdentityRegistry(addr)`

**DisputeModule**

- `resolve(jobId, employerWins[, signatures])`
- Setters: `setJobRegistry(addr)`, `setDisputeFee(amount)`, `setTaxPolicy(addr)`, moderator controls

**CertificateNFT**

- Setters: `setJobRegistry(addr)`, `setStakeManager(addr)` (and `setBaseURI(...)` if present)

**FeePool**

- Setters: `setBurnPct(bps)` (burns via token’s `burn(...)`), `setTreasury(addr)`

**IdentityRegistry** _(optional)_

- Setters: `setAgentRootNode(node)`, `setClubRootNode(node)`, `setAgentMerkleRoot(root)`, `setValidatorMerkleRoot(root)`, `addAdditionalAgent(addr)`, `addAdditionalValidator(addr)`

**Platform modules** _(optional)_

- `PlatformRegistry.setRegistrar(addr, true)`
- `JobRouter.setRegistrar(addr, true)`
- `PlatformIncentives` staking/registration helpers

---

> This **Master Guide** merges:
>
> - **AGI Jobs v2 Deployment & Usage** https://chatgpt.com/s/dr_68bb15c88e588191b80af3cb044190f2 (operator‑level),
> - **Mainnet Deployment via Etherscan** https://chatgpt.com/s/dr_68bb10b1fe208191b7539bb6b3d9cdd7 (module‑by‑module, constructor & wiring), and
> - **Using AGIJobs via Etherscan** https://chatgpt.com/s/dr_68bb0179b3348191ae0ef37d21d6d6fa (role‑based runbooks),
>   into a single, production‑grade document for the repository.

---

## A) Targeted Coding Sprint (production‑grade, ENS + $AGIALPHA)

### A.0 Goals (Definition of Done)

- **ENS identities enforced at runtime (on‑chain):**  
  Agents **must** own `<label>.agent.agi.eth`; Validators **must** own `<label>.club.agi.eth`. Verification uses mainnet ENS Registry/NameWrapper + Resolver in contract code. Governance‑only bypasses exist for emergencies and are event‑logged.

- **$AGIALPHA‑only economy (hardcoded):**  
  All staking, payments, rewards, protocol fees, dispute fees, and slashes use **only** `$AGIALPHA` at **`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`** (18 decimals). ETH or any other token **reverts**.

- **Traceability:** Indexed, consistent **events** for every token flow and lifecycle transition (stake, lock, unlock, slash, fee deposit, distribution, burn; job create/apply/submit/complete/finalize/dispute; identity verification).

- **Quality at scale:** Finalized **staking & slashing** (role‑based minimums; time‑locks/cooldowns; partial/full slashes routed to employer/treasury/burn), validator economics, dispute outcomes, reputation hooks.

- **Etherscan UX:** ABIs use primitive types; NatSpec on public surfaces; every workflow executable via **Read/Write Contract** with a browser.

---

### A.1 Cross‑cutting upgrades

- **Constants (single source of truth):**

  - `AGIALPHA = 0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`
  - `DECIMALS = 18`, `ONE = 1e18`
  - `BURN_ADDRESS = address(0)` (**use `burn()`**, not “send to dead address”)
  - `ENS_REGISTRY_MAINNET`, `NAME_WRAPPER_MAINNET`
  - `AGENT_ROOT = namehash("agent.agi.eth")`, `CLUB_ROOT = namehash("club.agi.eth")`
  - **CI guard:** fail build if `Constants.sol` diverges from config.

- **Reject ETH/non‑AGIALPHA:**  
  Add reverting `receive()`/`fallback()`; add `require(msg.value==0)` to write paths.

- **Event canon:** consistent names/args across modules (see **A.6**).

- **Docs/NatSpec:** Clear `@notice`/`@dev` on every public function/event; explicit units (wei); clear revert reasons.

---

### A.2 Module tasks (effort & tests)

> Legend: (L) Low, (M) Medium, (H) High. All items include unit/integration tests.

#### A.2.1 `IdentityRegistry` (+ ENS verifier lib)

- **ENS verify at runtime (H):**  
  `verifyAgent(addr,label,proof)` / `verifyValidator(...)` must:
  1. derive node for `<label>.agent.agi.eth` / `<label>.club.agi.eth`;
  2. check NameWrapper owner OR Registry + Resolver `addr(node)` equals `addr`;
  3. ensure not blacklisted in `ReputationEngine`.
- **Bypasses (M):**  
  Owner‑only `addAdditionalAgent/Validator(address)`; **emit** `AdditionalAgentUsed/AdditionalValidatorUsed(addr,label,jobId)` on use; add `clearAdditional...`.
- **Cache/attestation (M):**  
  Short‑lived `(addr,role) → expiry`; optional AttestationRegistry hook (pre‑auth). Bust cache on root changes.
- **Events (L):** `IdentityVerified(user, role, node, label)`.

#### A.2.2 `StakeManager`

- **$AGIALPHA‑only (L):** `immutable TOKEN = IERC20(AGIALPHA);` guards on all transfers.
- **Role minimums (M):** `minStake[Role]` (Agent/Validator/Platform); `setMinStake`; `MinStakeUpdated`.
- **Locking & withdrawals (M):** lock on assignment (`lockStake(user,role,amount,jobId)`), unlock on finalize/abort; `requestWithdraw` → `executeWithdraw` after `cooldown`.
  - **Slashing (H):** `_slash(user, role, amount, jobId)`
    → `{employerPct, treasuryPct}` (sum 100)
    → **burn remainder via `TOKEN.burn()`**
    → `StakeSlashed(user, role, employer, treasury, employerShare, treasuryShare, burnShare)`.
- **Fee remittance (M):** `finalizeJobFunds(jobId, employer, agent, reward, validatorReward, fee, pool, byGovernance)` → net to agent, validator rewards, fee to `FeePool`.
- **Guards (L):** `nonReentrant` + `whenNotPaused` on state mutators.

#### A.2.3 `FeePool`

- **Burn/distribute (M):** `setBurnPct(uint8)`; `distributeFees()` → compute `burnAmt` → `TOKEN.burn(burnAmt)` → `FeesBurned` & `FeesDistributed(net)`.
- **Rewards (M):** cumulative per‑token accounter; `claim()` for platform stakers (if enabled).
- **Setters (L):** `setStakeManager`, `setRewardRole`, `setTreasury`.

#### A.2.4 `JobRegistry`

- **Identity gates (M):** `applyForJob(jobId,label,proof)` **requires** `IdentityRegistry.verifyAgent(...)` before assignment; validator paths enforced in `ValidationModule`.
- **Lifecycle hardening (M):** one‑way transitions; block finalize until reveal & dispute windows pass (unless dispute outcome).
- **Protocol fee (L):** `setFeePct(bps)`; `FeePctUpdated`; route to `StakeManager.finalizeJobFunds`.
- **Events (L):** `JobCreated/Applied/Submitted/Completed/Finalized/Disputed/Resolved`.

#### A.2.5 `ValidationModule`

- **Windows (M):** `commitWindow`, `revealWindow`, forced finalize after grace.
- **Identity enforcement (M):** `commitValidation(jobId,commit,label,proof)` / `revealValidation(jobId,approve,salt)` must enforce ENS/blacklist.
- **Penalties (M):** missed reveal, malicious votes → slash via StakeManager; `ValidatorPenalized(validator, jobId, reason, amount)`.

#### A.2.6 `DisputeModule`

- **Fees (L):** `disputeFee` in $AGIALPHA; lock on `raise`; route on `resolve`.
- **Outcomes (M):** owner/moderator can resolve after window; outcomes move funds and may slash; strong events.

#### A.2.7 `CertificateNFT`

- **Market safety (L):** `nonReentrant`, `SafeERC20` for $AGIALPHA, clear listings on transfer; `CertificateListed/Delisted/Purchased`.

#### A.2.8 `ReputationEngine`

- **Hooks (M):** `onFinalize(jobId, success)` adjust agent/validator; `blacklist/unblacklist`; `ReputationChanged(user, delta, reason)`.

#### A.2.9 `SystemPause` / Governance

- **Owner (L):** move ownership to multisig/Timelock; add global pause for emergencies.

---

### A.3 Security & Gas

- **OpenZeppelin**: `Ownable`, `ReentrancyGuard`, `Pausable`, `SafeERC20`.
- **No external callbacks** between transfer and state updates.
- **Explicit revert reasons**; input caps to prevent unbounded loops.
- **Gas hygiene**: compact events (indexed jobId/user, amounts); cache ENS checks; batch only where safe.

---

### A.4 Test plan (must‑pass)

- **Identity:** valid ENS (wrapped/unwrapped), wrong resolver, cache expiry, allowlist, blacklist.
- **Token:** ETH/other tokens revert; approve→stake; payouts; distribution; burn reduces supply/balances.
- **Lifecycle:** happy path; early finalize blocked; disputes override.
- **Slashing:** agent/validator; routing math; rounding/dust.
- **Events:** one per transition/flow; assert topics & args.

---

### A.5 Sprint deliverables

- Code diffs across modules above ✅
- Updated **NatSpec** and **/docs** ✅
- Foundry/Hardhat tests + gas snapshots ✅
- CI: constants sync & link checks ✅
- CHANGELOG entry & upgrade notes ✅

---

### A.6 Canonical events (reference schema)

```solidity
event IdentityVerified(address indexed user, uint8 indexed role, bytes32 indexed node, string label);
event AdditionalAgentUsed(address indexed user, string label, uint256 indexed jobId);
event AdditionalValidatorUsed(address indexed user, string label, uint256 indexed jobId);

event StakeDeposited(address indexed user, uint8 indexed role, uint256 amount);
event StakeWithdrawalRequested(address indexed user, uint8 indexed role, uint256 amount, uint64 eta);
event StakeWithdrawn(address indexed user, uint8 indexed role, uint256 amount);
event StakeTimeLocked(address indexed user, uint8 indexed role, uint256 amount, uint256 indexed jobId);
event StakeUnlocked(address indexed user, uint8 indexed role, uint256 amount, uint256 indexed jobId);
event StakeSlashed(address indexed user, uint8 indexed role, address indexed employer, address indexed treasury, uint256 employerShare, uint256 treasuryShare, uint256 burnShare);

event JobCreated(uint256 indexed jobId, address indexed employer, uint256 reward, string uri);
event ApplicationSubmitted(uint256 indexed jobId, address indexed applicant, string agentLabel);
event AgentAssigned(uint256 indexed jobId, address indexed agent, string agentLabel);
event ResultSubmitted(uint256 indexed jobId, address indexed agent, bytes32 resultHash);
event JobCompleted(uint256 indexed jobId, bool success);
event JobFinalized(uint256 indexed jobId, address indexed agent, uint256 netPaid, uint256 fee);
event JobDisputed(uint256 indexed jobId, address indexed by, uint256 fee);
event DisputeResolved(uint256 indexed jobId, bool employerWins);

event ValidatorCommitted(uint256 indexed jobId, address indexed validator);
event ValidatorRevealed(uint256 indexed jobId, address indexed validator, bool approve);

event FeeDeposited(uint256 indexed jobId, uint256 amount);
event FeesDistributed(uint256 amount);
event FeesBurned(uint256 amount);
event RewardPaid(address indexed to, uint8 indexed role, uint256 amount);

event TreasuryUpdated(address indexed treasury);
event FeePctUpdated(uint16 feeBps);
event MinStakeUpdated(uint8 indexed role, uint256 amount);
```

---

## B) Etherscan Deployment Guide (operators / technical)

> **Zero‑CLI**: deploy and wire everything from a browser on verified contracts.

### B.0 Pre‑flight

- Wallet funded with ETH on **Ethereum mainnet**
- **$AGIALPHA** live at **`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`**
- Governance address (multisig or Timelock)
- If enforcing ENS: authority for `agent.agi.eth` & `club.agi.eth` subdomains (or start with allowlists and switch to ENS)

### B.1 Deploy order (Contracts → _Write_ → **Deploy**)

Record each address.

1. **StakeManager**

   - `token`: `$AGIALPHA`
   - `minStake`: `0` (use default) or higher
   - `employerPct`,`treasuryPct`: e.g. `0,100` (sum must be 100)
   - `treasury`: treasury/multisig

2. **ReputationEngine**

   - `stakeManager`: (1)

3. **IdentityRegistry** (for ENS)

   - `_ensAddress`: mainnet ENS Registry
   - `_nameWrapperAddress`: mainnet NameWrapper
   - `_reputationEngine`: (2)
   - `_agentRootNode`,`_clubRootNode`: namehashes for `agent.agi.eth`, `club.agi.eth`

4. **ValidationModule**

   - `_jobRegistry`: `0x0` (wire later)
   - `_stakeManager`: (1)
   - `commitWindow`,`revealWindow`: e.g. `86400`,`86400`
   - `minValidators`,`maxValidators`: e.g. `1`,`3`

5. **DisputeModule**

   - `_jobRegistry`: `0x0`
   - `disputeFee`: e.g. `1e18`
   - `disputeWindow`: e.g. `259200` (3 days)
   - `moderator`: address or `0x0`

6. **CertificateNFT**

   - `name`,`symbol`: e.g. `"AGI Jobs Certificate","AGIJOB"`

7. **FeePool**

   - `_token`: `$AGIALPHA`
   - `_stakeManager`: (1)
   - `_burnPct`: e.g. `5` (or `0` initially)
   - `_treasury`: treasury/multisig

8. _(Optional)_ **PlatformRegistry**, **JobRouter**, **PlatformIncentives**

9. **JobRegistry**
   - `validationModule`: (4)
   - `stakeManager`: (1)
   - `reputationEngine`: (2)
   - `disputeModule`: (5)
   - `certificateNFT`: (6)
   - `identityRegistry`: (3) or `0x0`
   - `taxPolicy`: address or `0x0`
   - `feePct`: e.g. `500` (5% in bps)
   - `jobStake`: often `0`
   - `ackModules`: `[]`

> **Verify source** for each contract so Etherscan exposes Read/Write UIs.

### B.2 Wire modules (Contracts → _Write_)

- **JobRegistry** → `setModules(validation, stakeMgr, rep, dispute, certNFT, feePool, new address[](0))`
- **StakeManager** → `setJobRegistry(jobRegistry)`; `setDisputeModule(disputeModule)`
- **ValidationModule** → `setJobRegistry(jobRegistry)`; `setIdentityRegistry(identityRegistry)`
- **DisputeModule** → `setJobRegistry(jobRegistry)`; `setTaxPolicy(taxPolicy)`
- **CertificateNFT** → `setJobRegistry(jobRegistry)`; `setStakeManager(stakeManager)`
- **JobRegistry** → (if needed) `setIdentityRegistry(identityRegistry)`

> Optional one‑shot: deploy **ModuleInstaller**, temporarily `transferOwnership(installer)` for each module, call `initialize(...)`, then ownership is returned.

### B.3 ENS configuration

- **IdentityRegistry** → `setENS`, `setNameWrapper` (mainnet addresses)
- **IdentityRegistry** → `setAgentRootNode(namehash("agent.agi.eth"))`, `setClubRootNode(namehash("club.agi.eth"))`
- _(Bootstrap allowlists if needed)_
  - **JobRegistry** → `setAgentMerkleRoot(root)`
  - **ValidationModule** → `setValidatorMerkleRoot(root)`
  - **IdentityRegistry** → `addAdditionalAgent(addr)` / `addAdditionalValidator(addr)` (remove later)

### B.4 Governance hand‑off

- Move ownership to multisig/Timelock:
  - **StakeManager** → `setGovernance(multisig)`
  - **JobRegistry** → `setGovernance(multisig)`
  - Others → `transferOwnership(multisig)` (ValidationModule, ReputationEngine, IdentityRegistry, CertificateNFT, DisputeModule, FeePool, etc.)
- Execute a test parameter update via multisig to confirm control.

### B.5 Sanity checks

- **Stake:** `AGIALPHA.approve(StakeManager, 1e18)` → `StakeManager.depositStake(0, 1e18)`
- **Post:** `JobRegistry.createJob(1e18, "ipfs://...")`
- **Apply (ENS):** `applyForJob(jobId, "alice", [])` from `alice.agent.agi.eth` owner account
- **Validate:** commit→reveal
- **Finalize:** `ValidationModule.finalize(jobId)` → agent paid, fee to FeePool, **burn** on distribution

---

## C) Non‑technical User Guide (Etherscan only)

> Everything below is doable from a browser on verified contracts.

### C.0 Before you begin

- Hold some **$AGIALPHA** in your wallet.
- If the platform enforces ENS identities:
  - **Agents** need `<label>.agent.agi.eth`; **Validators** need `<label>.club.agi.eth`.
  - Your subdomain must resolve to your wallet (ask the operator to issue it).
  - Without it, those actions will **revert**.

### C.1 Stake tokens (one‑time per role)

1. Open **$AGIALPHA** token → **Write** → `approve(StakeManager, AMOUNT_WEI)`
2. Open **StakeManager** → **Write** → `depositStake(role, amountWei)`
   - role = `0` (Agent), `1` (Validator), `2` (Platform staker)
3. Wait for `StakeDeposited` event.

### C.2 Post a job (employer/buyer)

1. **JobRegistry** → `createJob(rewardWei, uri)` (approve StakeManager for `rewardWei` first)
2. Note `jobId` in `JobCreated`.

### C.3 Apply to a job (agent)

1. Ensure you own the correct `*.agent.agi.eth` subdomain.
2. **JobRegistry** → `applyForJob(jobId, "yourLabel", [])`
3. On success: `ApplicationSubmitted` is emitted, followed by `AgentAssigned` when you become the assignee.

### C.4 Submit work (agent)

- **JobRegistry** → `submitWork(jobId, resultHashOrURI)` → `ResultSubmitted`.

### C.5 Validate work (validator)

1. **ValidationModule** → `commitValidation(jobId, commitHash, "yourLabel", [])`
2. After commit window: `revealValidation(jobId, approveBool, salt)`
3. Watch `ValidatorCommitted/ValidatorRevealed`, then `JobCompleted`.

### C.6 Finalize (payouts & burns)

- **ValidationModule** → `finalize(jobId)` (after reveal window, no dispute)
- Agent receives net reward (`RewardPaid`); protocol fee to **FeePool**; a % is **burned** (`FeesBurned`) and the rest is claimable by platform stakers.
- If the escrow cannot cover burns and fees, `StakeManager` trims the burn first, then fees, ensuring employers never pay beyond `reward + fee`.

### C.7 Dispute (optional)

- **JobRegistry** → `raiseDispute(jobId, evidenceURI)` (may require dispute fee)
- Operator/moderator uses **DisputeModule** → `resolve(jobId, employerWins)`
- `DisputeResolved` finalizes; slashes/compensation may apply.

### C.8 Claim fee rewards (platform stakers, if enabled)

- **FeePool** → **Read** pending → **Write** `claim()`
- Burns and distributions appear via `FeesBurned/FeesDistributed`.

---

## D) Documentation & Style Improvements

- **Self‑contained docs:** no external images; prefer mermaid or ASCII tables.
- **Consistent structure:**
  - H1 title; H2 sections: `Overview`, `How it works`, `Parameters`, `Steps`, `Troubleshooting`.
  - Title‑case headings; consistent bullets; keep lines ≤100 chars where practical.
- **Exact names/addresses:** one table listing modules and **owner‑only setters**.
- **Navigation:** add `docs/_index.md` linking to: Deployment (Etherscan), ENS identity, AGIALPHA config, Operator runbook, Non‑technical guide.
- **NatSpec hygiene:** every public function/event documented with units and revert reasons.
- **CI gates:**
  - constants sync (`config/agialpha.json` → `Constants.sol`),
  - link check for all internal docs,
  - lint (`solhint`, Prettier), spell‑check on Markdown.

---

## E) Production‑Readiness Audit (checklist)

- [ ] **$AGIALPHA‑only** enforced; ETH/other tokens revert in all modules.
- [ ] **True burn** via `burn(uint256)` on $AGIALPHA; never “send to dead address”; burns event‑logged.
- [ ] **ENS identity** enforced in every role‑gated path (apply, commit, reveal, etc.).
- [ ] **Owner updatability** under multisig/Timelock; owner actions are event‑logged.
- [ ] **Pause** control available (global or per‑module).
- [ ] **Disputes** wired; slashing routes (employer/treasury/burn) configured.
- [ ] **Reputation** affects participation (blacklist honored).
- [ ] **Etherscan UX** verified end‑to‑end; source verified for all contracts.
- [ ] **Tests** pass for identity edge‑cases, slashing math, lifecycle guards, and event emissions.

---

## Appendix A — Minimal code patterns (drop‑in)

> These snippets show intent; integrate with the existing v2 code.

### A.1 Constants

```solidity
library Constants {
    address constant AGIALPHA = 0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA;
    uint8   constant AGIALPHA_DECIMALS = 18;
    uint256 constant ONE = 1e18;
    address constant BURN_ADDRESS = address(0);

    // mainnet ENS
    address constant ENS_REGISTRY = 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e;
    address constant NAME_WRAPPER = 0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401;
    bytes32 constant AGENT_ROOT = 0x0; // namehash("agent.agi.eth")
    bytes32 constant CLUB_ROOT  = 0x0; // namehash("club.agi.eth")
}
```

### A.2 $AGIALPHA‑only guard

```solidity
contract UsesToken {
    using SafeERC20 for IERC20;
    IERC20 public immutable TOKEN = IERC20(Constants.AGIALPHA);
    receive() external payable { revert("NO_ETH"); }
    fallback() external payable { revert("NO_ETH"); }
}
```

### A.3 True burn

```solidity
function _burnToken(uint256 amount) internal {
    if (amount == 0) return;
    (bool ok,) = address(TOKEN).call(abi.encodeWithSignature("burn(uint256)", amount));
    require(ok, "BURN_FAILED");
    emit FeesBurned(amount);
}
```

### A.4 ENS verify (shape)

```solidity
function _ownsEns(bytes32 node, address user) internal view returns (bool) {
    address res = IAddrResolver(IENS(ENS_REGISTRY).resolver(node)).addr(node);
    if (res == user) return true;
    try INameWrapper(NAME_WRAPPER).ownerOf(uint256(node)) returns (address o) { return o == user; } catch {}
    return false;
}
```

---

## Appendix B — Operator run‑sheet (one page)

- **Deploy:** StakeManager → ReputationEngine → IdentityRegistry → ValidationModule → DisputeModule → CertificateNFT → FeePool → _(optional Platform_) → JobRegistry.
- **Wire:** `JobRegistry.setModules(...)`; `StakeManager.setJobRegistry`, `setDisputeModule`; `ValidationModule.setJobRegistry`, `setIdentityRegistry`; `DisputeModule.setJobRegistry`; `CertificateNFT.setJobRegistry`, `setStakeManager`; repeat `JobRegistry.setIdentityRegistry` if needed.
- **ENS:** `IdentityRegistry.setENS/Wrapper`; `setAgentRootNode`, `setClubRootNode`; optional `setAgent/ValidatorMerkleRoot`.
- **Governance:** move ownership to multisig/Timelock; test one change.
- **Smoke test:** approve/stake, create job, apply (ENS), submit, commit/reveal, finalize; observe `FeesBurned` & distributions.

---

## Appendix C — Non‑technical quick start

- **Stake:** Token → `approve(StakeManager, AMOUNT)`; StakeManager → `depositStake(role, amountWei)`
- **Post:** JobRegistry → `createJob(rewardWei, "ipfs://...")`
- **Apply (agent):** JobRegistry → `applyForJob(jobId, "label", [])` (ENS required)
- **Validate:** ValidationModule → `commitValidation(...)` then `revealValidation(...)`
- **Finalize:** ValidationModule → `finalize(jobId)` → payout + fee routing + **burn**
- **Dispute:** JobRegistry → `raiseDispute` → DisputeModule `resolve` (by operator/moderator)
- **Claim fees:** FeePool → `claim()` (if platform staking is enabled)
