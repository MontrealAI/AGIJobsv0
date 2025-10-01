# AGIJobs v2 — Mainnet-Ready Sprint & Etherscan Guides

> **Scope (single file, upload-ready):**
>
> 1. Targeted coding sprint (ENS enforcement, $AGIALPHA-only, events, staking/slashing).
> 2. Step‑by‑step mainnet deployment via **Etherscan** for platform operators.
> 3. Plain‑language usage guide for **non‑technical** users interacting via **Etherscan**.
> 4. Final documentation/style recommendations for a production‑grade, self‑contained repo.

---

## 0) Ground Truth (Repo Snapshot & Strong Requirements)

- **Identity policy:** The repo’s README states that agents **must** control `<name>.agent.agi.eth` and validators **must** control `<name>.club.agi.eth`. All workflows perform **on‑chain** verification; bypass allowlists exist only for emergencies. :contentReference[oaicite:0]{index=0}
- **$AGIALPHA only:** The README declares v2 assumes the **18‑decimal** `$AGIALPHA` token for **payments, stakes and dispute deposits**, with the token address fixed via repo configuration. The “Deployed Addresses” section shows `$AGIALPHA = 0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`. :contentReference[oaicite:1]{index=1}
- **Etherscan‑first deployment:** The README links to browser‑based deployment docs and lists owner‑only setters and wiring calls (e.g., `JobRegistry.setModules`, `StakeManager.setJobRegistry`, `IdentityRegistry.setENS/*RootNode`). :contentReference[oaicite:2]{index=2}
- **ENS mainnet references** (for runtime checks):
  - ENS **Registry**: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`. :contentReference[oaicite:3]{index=3}
  - ENS **NameWrapper** (widely used address): `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`. :contentReference[oaicite:4]{index=4}
- **$AGIALPHA address corroboration (external):** token address matches third‑party explorers. :contentReference[oaicite:5]{index=5}
- **Burnability preflight:** run `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/check-burnable.ts` to ensure the configured token exposes `burn(uint256)` before mainnet deployment; the script exits with an error if the call reverts or returns no data.

> **Trust model:** Centralized owner control is acceptable here (multisig/timelock recommended). The repo exposes owner‑only setters across modules and documents them for Etherscan use. :contentReference[oaicite:6]{index=6}

---

## 1) Targeted Coding Sprint (2–3 weeks)

> Goal: ship a **production‑grade** v2 that (i) enforces ENS identities at **runtime**, (ii) is **$AGIALPHA‑only** for all value paths, (iii) emits **analytics‑grade events**, (iv) finalizes **staking/slashing**, and (v) is **Etherscan‑usable** end‑to‑end.

### EPIC A — ENS Identity: strict, on‑chain, cached

**A1. IdentityRegistry mainnet binding**

- Hard‑wire the official **ENS Registry** and **NameWrapper** via `configureMainnet()` or owner setters (`setENS`, `setNameWrapper`). Default to mainnet addresses above. Acceptance: getters return correct addresses; event(s) emitted on update. :contentReference[oaicite:7]{index=7}

**A2. Root nodes & pattern checks**

- Set `agentRootNode = namehash("agent.agi.eth")`, `clubRootNode = namehash("club.agi.eth")`. Add `require` guards on all role‑gated paths (apply/commit/reveal) to block if caller’s subdomain does **not** resolve to `msg.sender`. Acceptance: reverts on mismatch; success path emits `IdentityVerified(account, node, role)`. :contentReference[oaicite:8]{index=8}

**A3. ENS fallback & attestations**

- (If present) leave `AttestationRegistry` integration on: verified attestations skip repeated ENS lookups to **lower gas**. Add cache expiry + version bumping for config changes. Acceptance: gas snapshot shows reduced cost on second call; tests cover cache invalidation. :contentReference[oaicite:9]{index=9}

**A4. Emergency allowlists, clearly exceptional**

- Keep `addAdditionalAgent/Validator` + merkle roots as **owner‑only emergency** escape hatches. Emit `AllowlistUsed` with job/role context for auditability. Acceptance: events emitted; docs warn it’s emergency‑only. :contentReference[oaicite:10]{index=10}

---

### EPIC B — $AGIALPHA‑only economics (hardcoded)

**B1. Single‑token invariant**

- Generate `Constants.sol` from `config/agialpha.json` and statically link **token address & decimals** throughout v2. Remove legacy multi‑token code paths; add `require(msg.value==0)` in all non‑payable flows. Acceptance: all transfers use `$AGIALPHA`; ETH attempts revert; CI guard fails if constants mismatch. :contentReference[oaicite:11]{index=11}

**B2. Defensive ERC‑20 handling**

- Use `SafeERC20` for `transfer/transferFrom`; support non‑standard returns. Enforce allowance checks in StakeManager and JobRegistry funding. Acceptance: fuzz tests for token transfer semantics pass.

**B3. FeePool & burns**

- Ensure FeePool uses `burn()` (ERC20Burnable) for burn pct; otherwise, document zero‑address send fallback (not preferred). Emit `FeesBurned(amount)` and `FeesDistributed(total)` every cycle. Acceptance: events visible in Etherscan logs on local fork. :contentReference[oaicite:12]{index=12}

---

### EPIC C — Events: full traceability & Etherscan UX

**C1. Event schema & indexing**

- Normalize names & indexed fields across:
  - **Jobs:** `JobCreated(id, employer, reward)`, `ApplicationSubmitted(id, agent)`, `AgentAssigned(id, agent)`, `ResultSubmitted(id, agent)`, `JobFinalized(id, success)`.
   - **Stakes:** `StakeDeposited(user, role, amount)`, `StakeWithdrawn(user, role, amount)`, `StakeSlashed(user, role, employer, treasury, employerShare, treasuryShare, operatorShare, validatorShare, burnShare)`.
  - **Fees:** `FeeAccrued(jobId, amount)`, `FeesBurned(amount)`, `FeesDistributed(total, perToken)`.
  - **Identity:** `IdentityVerified(user, node, role)`; `AllowlistUsed(user, role, reason)`.
- Add NatSpec on all events so Etherscan shows helpful tooltips. Acceptance: Events appear consistently, with `indexed` on addresses and IDs; ABI verified. :contentReference[oaicite:13]{index=13}

**C2. Docs: “How to filter on Etherscan”**

- Add cookbook snippets (filter by event topics, parse amounts) in `/docs/observability.md`. Acceptance: examples match deployed ABIs.

---

### EPIC D — Staking & Slashing finalization

**D1. Minimums, locks, cooldowns**

- Set sane defaults: `minStake` per role; `lockStake(jobId, role)` during execution; `cooldown` on withdrawals. Owner‑setters documented for governance tuning. Acceptance: withdraw attempts during lock revert; tests cover edges.

**D2. Slashing policy**

- Keep percentages (employer/treasury) summing to 100; remainder auto‑burn. Add safe‑math for rounding dust into burn. Emit detailed `StakeSlashed` with breakdown. Acceptance: distribution invariants hold in tests. (Per README’s owner‑only setters table.) :contentReference[oaicite:14]{index=14}

**D3. Validator incentives**

- Pay validator reward pct on success, slash on misbehavior (no reveal, collusion), both evented. Acceptance: scenario tests (success, fail, dispute) pass.

---

### EPIC E — Etherscan usability & docs

**E1. Etherscan‑friendly signatures**

- Keep simple types (no nested structs). Ensure constructors list explicit params; add human‑readable names. Acceptance: verified contracts show clean inputs. :contentReference[oaicite:15]{index=15}

**E2. README + operator & user guides**

- Merge step‑by‑step **operator** deployment and **non‑technical** usage (below) into `/docs/agi-jobs-v2-mainnet.md`, self‑contained (no off‑repo images). Acceptance: lint passes; links resolve. :contentReference[oaicite:16]{index=16}

**E3. Governance hand‑off**

- Document multisig/timelock ownership transfer (`setGovernance`, `transferOwnership`) and provide a “day‑2 ops” checklist. Acceptance: guide aligns to owner‑only setters list in README. :contentReference[oaicite:17]{index=17}

---

### Deliverables (by PR)

- `contracts/v2` diffs (ENS, events, staking/slashing), `Constants.sol` generator check, gas snapshots.
- Tests: identity positive/negative, staking locks, slashing paths, fee burns.
- New docs: `agi-jobs-v2-mainnet.md`, `observability.md`, updated README sections. :contentReference[oaicite:18]{index=18}

---

## 2) Mainnet Deployment (Operator, **Etherscan‑only**)

> You need: an EOA with ETH for gas, a governance **multisig/timelock** address, and the real `$AGIALPHA` address **0xA61a…a1fA**. Keep a text file of deployed addresses as you go. :contentReference[oaicite:19]{index=19}

### 2.1 Order of deployments (suggested)

1. **StakeManager**

   - Params: `token=$AGIALPHA`, `minStake`, `employerPct`, `treasuryPct`, `treasury`.
   - Purpose: holds escrow & stakes; executes payouts/slashes; forwards protocol fees. :contentReference[oaicite:20]{index=20}

2. **ReputationEngine**

   - Param: `stakeManager`. Tracks scores/blacklist. :contentReference[oaicite:21]{index=21}

3. **IdentityRegistry** (for ENS)

   - Params: `_ensAddress` (mainnet registry), `_nameWrapper`, `_reputationEngine`, `_agentRootNode`, `_clubRootNode`.
   - Can call `configureMainnet()` post‑deploy to set official ENS + roots. :contentReference[oaicite:22]{index=22}

4. **ValidationModule**

   - Params: `_jobRegistry(0)`, `_stakeManager`, `commitWindow`, `revealWindow`, `minValidators`, `maxValidators`, `validatorPool[]`. :contentReference[oaicite:23]{index=23}

5. **DisputeModule**

   - Params: `_jobRegistry(0)`, `disputeFee (in AGIALPHA wei)`, `disputeWindow`, `moderator`. :contentReference[oaicite:24]{index=24}

6. **CertificateNFT**

   - Params: `name`, `symbol`. Issues completion certificates. :contentReference[oaicite:25]{index=25}

7. **FeePool**

   - Params: `_token=$AGIALPHA`, `_stakeManager`, `_burnPct`, `_treasury`. Burns a % of fees and accrues rewards for platform stakers. :contentReference[oaicite:26]{index=26}

8. _(Optional)_ **PlatformRegistry / JobRouter / PlatformIncentives / TaxPolicy / SystemPause** as your model requires. :contentReference[oaicite:27]{index=27}

9. **JobRegistry** (last)
   - Params: `validationModule`, `stakeManager`, `reputationEngine`, `disputeModule`, `certificateNFT`, `identityRegistry`, `taxPolicy`, `feePctBps`, `jobStake`, `ackModules[]`.
   - Core coordinator; needs most addresses. :contentReference[oaicite:28]{index=28}

> **Verify** each contract on Etherscan after deployment so the Read/Write tabs display. :contentReference[oaicite:29]{index=29}

### 2.2 Wire the modules (Write tabs)

- On **JobRegistry**:  
  `setModules(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, feePool, new address)`  
  `setIdentityRegistry(identityRegistry)`; `setTaxPolicy(taxPolicy)` (if used). :contentReference[oaicite:31]{index=31}

- On **StakeManager**:  
  `setJobRegistry(jobRegistry)`; `setDisputeModule(disputeModule)`; if needed `setTreasury(treasury)`. :contentReference[oaicite:32]{index=32}

- On **ValidationModule**:  
  `setJobRegistry(jobRegistry)`; `setIdentityRegistry(identityRegistry)`; set windows/bounds if different. :contentReference[oaicite:33]{index=33}

- On **DisputeModule**:  
  `setJobRegistry(jobRegistry)`; `setTaxPolicy(taxPolicy)`; optionally `setFeePool(feePool)`. :contentReference[oaicite:34]{index=34}

- On **CertificateNFT**:  
  `setJobRegistry(jobRegistry)`; `setStakeManager(stakeManager)`. :contentReference[oaicite:35]{index=35}

- On **IdentityRegistry** (ENS):  
  If not done at deploy, `setENS(registry)`, `setNameWrapper(wrapper)`, `setAgentRootNode(namehash("agent.agi.eth"))`, `setClubRootNode(namehash("club.agi.eth"))`, and set merkle roots only if you plan an allowlist. :contentReference[oaicite:36]{index=36}

> (Optional) Use the repo’s **ModuleInstaller** helper to do most wiring in one call; then return ownership to you. :contentReference[oaicite:37]{index=37}

### 2.3 Governance hand‑off

- Transfer control from deployer EOA to a **multisig/timelock**:
  - On **StakeManager/JobRegistry**: `setGovernance(multisig)`
  - On others: `transferOwnership(multisig)`
- Keep a ledger of each transfer tx. Later rotations use same functions. :contentReference[oaicite:38]{index=38}

### 2.4 ENS namespace activation

- Ensure AGI controls `agi.eth` and has created subdomains `agent.agi.eth` and `club.agi.eth`.
- In **IdentityRegistry** load `agentRootNode` and `clubRootNode`.
- Publish your operator process for issuing subdomains to users (or link a dApp). **Transactions will revert** if the caller doesn’t own the supplied subdomain. :contentReference[oaicite:39]{index=39}

### 2.5 Initial parameters (owner)

- `StakeManager.setMinStake(...)`, `setSlashingPercentages(employerPct, treasuryPct)`, `setMaxStakePerAddress(...)`
- `JobRegistry.setFeePct(bps)`
- `FeePool.setBurnPct(percent)` and verify `burn()` is callable by FeePool. :contentReference[oaicite:40]{index=40}

### 2.6 Sanity flow (real mainnet, small amounts)

- **Approve & stake:** `$AGIALPHA.approve(StakeManager, 1e18)` → `StakeManager.depositStake(role, 1e18)`
- **Post a job:** `JobRegistry.createJob(1e18, "ipfs://Qm...")`
- **Apply (agent):** `applyForJob(jobId, "alice", [])` (uses `alice.agent.agi.eth`)
- **Validate:** validators `commitValidation` then `revealValidation`
- **Finalize:** `ValidationModule.finalize(jobId)` → payouts, fee burn, events. :contentReference[oaicite:41]{index=41}

---

## 3) Etherscan Usage (Non‑technical users)

> No coding tools required. You only need MetaMask (or similar), **$AGIALPHA** tokens, and (if required) your **ENS subdomain**.

### 3.1 Prepare

- Get the official **contract addresses** from the operator (especially `JobRegistry`, `StakeManager`).
- If identity is enforced, secure your ENS:
  - **Agent:** own `yourname.agent.agi.eth`; set resolver → your wallet address.
  - **Validator:** own `yourname.club.agi.eth`.
  - If you don’t have one, ask the operator—transactions will otherwise **revert**. :contentReference[oaicite:42]{index=42}

### 3.2 Stake tokens

1. Open the **$AGIALPHA token** on Etherscan → “Write as Proxy” → `approve(StakeManager, amount)`
2. Open **StakeManager** → “Write” → `depositStake(role, amount)`
   - Role: Agent=0, Validator=1, Platform=2.
   - Amount units: wei (1 AGIALPHA = `1_000000000000000000`).
   - Success emits `StakeDeposited`. :contentReference[oaicite:43]{index=43}

### 3.3 Create a job (employer)

- Approve StakeManager for the **reward**, then call `JobRegistry.createJob(reward, "ipfs://job-spec")`.
- On success, note the **jobId** from the `JobCreated` event. :contentReference[oaicite:44]{index=44}

### 3.4 Apply (agent)

- Call `JobRegistry.applyForJob(jobId, "subdomainLabel", proof[])`.
  - Example: `"alice"` for `alice.agent.agi.eth`. If allowlists are used, paste your merkle `proof[]`; otherwise leave empty.
  - The contract checks you **own** the subdomain; if not, it reverts. :contentReference[oaicite:45]{index=45}

### 3.5 Submit work (agent)

- Call `submitWork(jobId, resultURIOrHash)` (check the contract for the exact function—names are human‑readable on Etherscan). Event: `ResultSubmitted`. :contentReference[oaicite:46]{index=46}

### 3.6 Validate (validators)

- **Commit phase:** `commitValidation(jobId, commitHash, "subdomainLabel", proof[])`
- **Reveal phase:** `revealValidation(jobId, approve, salt)` (must match the commit hash).
- The module tallies results; event: `JobCompleted(jobId, success)`. :contentReference[oaicite:47]{index=47}

### 3.7 Finalize & get paid

- Call `ValidationModule.finalize(jobId)` (anyone can).
- The system pays the agent, rewards validators, sends a fee to FeePool and **burns** the configured percentage of fees—all in **$AGIALPHA**. Events: `RewardPaid`, `FeesBurned`. :contentReference[oaicite:48]{index=48}

### 3.8 Disputes (optional)

- If there’s a problem, call `JobRegistry.raiseDispute(jobId, "ipfs://evidence")` before the window closes. A moderator (or process defined by the operator) resolves the dispute on‑chain; slashing may occur. Watch `StakeSlashed`/`DisputeResolved` events. :contentReference[oaicite:49]{index=49}

---

## 4) Documentation & Style (production polish)

> Goal: **self‑contained**, consistent, and explorer‑friendly docs—no external dependencies or images required.

### 4.1 Repo content plan (all Markdown, no external images)

- **`/README.md`** (keep concise): intro, identity policy, token config, links to mainnet guide. :contentReference[oaicite:50]{index=50}
- **`/docs/agi-jobs-v2-mainnet.md`** (this file’s content): sprint, operator & user guides, checklists.
- **`/docs/observability.md`**: how to read events on Etherscan (topics, indexed params).
- **`/docs/ens-identity-setup.md`**: operator steps to issue subdomains, user steps to set resolver; include ENS addresses above. :contentReference[oaicite:51]{index=51}
- **`/docs/security-and-governance.md`**: multisig/timelock patterns, owner‑only setters table (mirrors README), change logs. :contentReference[oaicite:52]{index=52}

### 4.2 Formatting & clarity

- Use a consistent heading hierarchy, sentence case, fenced code blocks for CLI/API calls, and tables for **owner‑only setters**, **default params**, **module addresses**. (README already lists module setters—keep in sync.) :contentReference[oaicite:53]{index=53}
- Keep **mermaid** diagrams optional; if used, include source in the repo.
- Add **examples** (happy‑path job) as a numbered list with the exact Write‑tab functions and inputs.

### 4.3 Verification checklist (CI)

- Lint Markdown (remark), spell‑check, verify internal links.
- Block merges if `config/agialpha.json` and generated `Constants.sol` are out of sync. :contentReference[oaicite:54]{index=54}

---

## 5) Production‑Readiness: what to verify before the “go” button

- **True on‑chain burning:** FeePool (and any slashing burn path) must call token `burn()` (not just transfer to a dead address); emit `FeesBurned/TokensBurned`. Dry‑run on fork to confirm totalSupply decreases on token contract. :contentReference[oaicite:55]{index=55}
- **Single‑token invariant:** all value transfers are `$AGIALPHA` (address above). ETH transfers rejected. Repo constants reflect mainnet token. :contentReference[oaicite:56]{index=56}
- **Owner updatability:** verify all owner functions are accessible by **multisig/timelock** only after hand‑off. Exercise one parameter change via multisig before launch. (Owner‑only setters listed in README.) :contentReference[oaicite:57]{index=57}
- **ENS enforcement:** IdentityRegistry bound to **ENS Registry** + **NameWrapper**; agent/validator roots set; transactions without ownership **revert**. :contentReference[oaicite:58]{index=58}
- **Etherscan usability:** All contracts **verified**; constructors & Write calls are plain types; NatSpec present for function/param tooltips. :contentReference[oaicite:59]{index=59}

---

## 6) Appendices

### A) Safe defaults (owner may tune later)

- `commitWindow = 86400` (24h), `revealWindow = 86400`
- `minValidators = 1`, `maxValidators = 3`
- `JobRegistry.feePctBps = 500` (5%)
- `FeePool.burnPct = 5` (start small; can increase)
- `StakeManager.minStake = 1e18` (1 $AGIALPHA) per role  
  (Adjust to your economics; document changes in governance log.) :contentReference[oaicite:60]{index=60}

### B) Operator quick sheet (Etherscan)

1. Deploy StakeManager → ReputationEngine → IdentityRegistry → ValidationModule → DisputeModule → CertificateNFT → FeePool → JobRegistry.
2. Wire modules via setters (or ModuleInstaller).
3. Configure ENS roots; set windows/validators; set fee & burn pct.
4. Transfer ownerships to multisig/timelock.
5. Dry‑run: stake, post job, apply (ENS), validate, finalize, observe events. :contentReference[oaicite:61]{index=61}

---

## 7) Change Log Template (for your PRs)

- **feat(ens):** bind mainnet registry+wrapper; add IdentityVerified event; cache & version.
- **feat(token):** enforce $AGIALPHA‑only; remove ETH paths; CI check for constants.
- **feat(events):** normalize event schema; NatSpec; add observability docs.
- **feat(staking):** enforce locks/cooldowns; finalize slashing math & events.
- **docs(mainnet):** add operator & non‑technical Etherscan guides; governance hand‑off; ENS setup.
- **chore(ci):** docs lint; constants drift guard; gas snapshots.

---

### References

- **AGIJobsv0 README** (identity policy, token config, owner‑only setters, Etherscan steps, deployed address table, wiring): :contentReference[oaicite:62]{index=62}
- **ENS official addresses (mainnet)**: Registry and NameWrapper references. :contentReference[oaicite:63]{index=63}
- **$AGIALPHA token address (external view)**: Explorer page. :contentReference[oaicite:64]{index=64}
