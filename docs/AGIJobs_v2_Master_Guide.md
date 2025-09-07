# AGIJobs v2 — Mainnet Coding Sprint & Etherscan Operating Guide

> **Purpose.** Save this file as `docs/master-guide.md` in the repository.  
> It combines:  
> 1) a **coding sprint** (ENS enforcement + **$AGIALPHA‑only** economics + production hardening),  
> 2) a **step‑by‑step Etherscan deployment guide** for platform operators,  
> 3) a **plain‑language usage guide** for non‑technical users, and  
> 4) a **docs/style checklist** and **production‑readiness** audit.  
>
> **Strong requirements covered**:  
> • Agents must own `<label>.agent.agi.eth`; Validators must own `<label>.club.agi.eth` (on‑chain ENS verification at runtime).  
> • **Only** `$AGIALPHA` at `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA` is accepted for staking, payments, rewards, fees, disputes, and burns.  
> • Owner updatability is intentionally powerful and acceptable within this trust model.

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
  1) derive node for `<label>.agent.agi.eth` / `<label>.club.agi.eth`;  
  2) check NameWrapper owner OR Registry + Resolver `addr(node)` equals `addr`;  
  3) ensure not blacklisted in `ReputationEngine`.
- **Bypasses (M):**  
  Owner‑only `addAdditionalAgent/Validator(address)`; **emit** `AdditionalAgentUsed/AdditionalValidatorUsed(addr,label,jobId)` on use; add `clearAdditional...`.
- **Cache/attestation (M):**  
  Short‑lived `(addr,role) → expiry`; optional AttestationRegistry hook (pre‑auth). Bust cache on root changes.
- **Events (L):** `IdentityVerified(user, role, node, label)`, `IdentityFailed(user, role, label, reason)`.

#### A.2.2 `StakeManager`
- **$AGIALPHA‑only (L):** `immutable TOKEN = IERC20(AGIALPHA);` guards on all transfers.
- **Role minimums (M):** `minStake[Role]` (Agent/Validator/Platform); `setMinStake`; `MinStakeUpdated`.
- **Locking & withdrawals (M):** lock on assignment (`lockStake(user,role,amount,jobId)`), unlock on finalize/abort; `requestWithdraw` → `executeWithdraw` after `cooldown`.
- **Slashing (H):** `_slash(user, role, amount, jobId)`  
  → `{employerPct, treasuryPct}` (sum 100)  
  → **burn remainder via `TOKEN.burn()`**  
  → `StakeSlashed(user, role, amount, employerShare, treasuryShare, burnShare, jobId)`.
- **Fee remittance (M):** `finalizeJobFunds(jobId, reward, feeBps)` → net to agent, validator rewards, fee to `FeePool`.
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
event IdentityFailed(address indexed user, uint8 indexed role, string label, string reason);
event AdditionalAgentUsed(address indexed user, string label, uint256 indexed jobId);
event AdditionalValidatorUsed(address indexed user, string label, uint256 indexed jobId);

event StakeDeposited(address indexed user, uint8 indexed role, uint256 amount);
event StakeWithdrawalRequested(address indexed user, uint8 indexed role, uint256 amount, uint64 eta);
event StakeWithdrawn(address indexed user, uint8 indexed role, uint256 amount);
event StakeTimeLocked(address indexed user, uint8 indexed role, uint256 amount, uint256 indexed jobId);
event StakeUnlocked(address indexed user, uint8 indexed role, uint256 amount, uint256 indexed jobId);
event StakeSlashed(address indexed user, uint8 indexed role, uint256 amount, uint256 employerShare, uint256 treasuryShare, uint256 burnShare, uint256 indexed jobId);

event JobCreated(uint256 indexed jobId, address indexed employer, uint256 reward, string uri);
event JobApplied(uint256 indexed jobId, address indexed agent, string agentLabel);
event JobSubmitted(uint256 indexed jobId, address indexed agent, bytes32 resultHash);
event JobCompleted(uint256 indexed jobId, bool success);
event JobFinalized(uint256 indexed jobId, address agent, uint256 netPaid, uint256 fee);
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

### B.1 Deploy order (Contracts → *Write* → **Deploy**)

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

8. *(Optional)* **PlatformRegistry**, **JobRouter**, **PlatformIncentives**

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

### B.2 Wire modules (Contracts → *Write*)

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
- *(Bootstrap allowlists if needed)*  
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

1) Open **$AGIALPHA** token → **Write** → `approve(StakeManager, AMOUNT_WEI)`  
2) Open **StakeManager** → **Write** → `depositStake(role, amountWei)`  
   - role = `0` (Agent), `1` (Validator), `2` (Platform staker)  
3) Wait for `StakeDeposited` event.

### C.2 Post a job (employer/buyer)

1) **JobRegistry** → `createJob(rewardWei, uri)` (approve StakeManager for `rewardWei` first)  
2) Note `jobId` in `JobCreated`.

### C.3 Apply to a job (agent)

1) Ensure you own the correct `*.agent.agi.eth` subdomain.  
2) **JobRegistry** → `applyForJob(jobId, "yourLabel", [])`  
3) On success: `JobApplied` and you become the assignee.

### C.4 Submit work (agent)

- **JobRegistry** → `submitWork(jobId, resultHashOrURI)` → `JobSubmitted`.

### C.5 Validate work (validator)

1) **ValidationModule** → `commitValidation(jobId, commitHash, "yourLabel", [])`  
2) After commit window: `revealValidation(jobId, approveBool, salt)`  
3) Watch `ValidatorCommitted/ValidatorRevealed`, then `JobCompleted`.

### C.6 Finalize (payouts & burns)

- **ValidationModule** → `finalize(jobId)` (after reveal window, no dispute)  
- Agent receives net reward (`RewardPaid`); protocol fee to **FeePool**; a % is **burned** (`FeesBurned`) and the rest is claimable by platform stakers.

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
    address constant NAME_WRAPPER = 0x253553366Da8546fC250F225fe3d25d0C782303b;
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
    address res = IResolver(IENS(ENS_REGISTRY).resolver(node)).addr(node);
    if (res == user) return true;
    try INameWrapper(NAME_WRAPPER).ownerOf(uint256(node)) returns (address o) { return o == user; } catch {}
    return false;
}
```

---

## Appendix B — Operator run‑sheet (one page)

- **Deploy:** StakeManager → ReputationEngine → IdentityRegistry → ValidationModule → DisputeModule → CertificateNFT → FeePool → *(optional Platform*) → JobRegistry.  
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
