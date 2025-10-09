# AGIJobs v2 — Non‑Technical Deployment Runbook

> **Audience:** Non‑technical owners and coordinators.  
> **Goal:** Safely deploy and initialize the **AGIJobs v2** smart‑contract suite using a multi‑sig with auditable change‑control.  
> **Token:** `$AGIALPHA` on Ethereum mainnet at **`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`** (canonical address provided by the project).

---

## TL;DR (10 steps)

1. **Create a Safe (Gnosis) multi‑sig** for governance (2‑of‑3 or stronger).  
2. **Name signers** and confirm hardware wallets for all approvers.  
3. **Confirm ENS** identities policy for participants (agents & validators).  
4. **Verify the $AGIALPHA token config** matches on‑chain metadata.  
5. **Dress rehearsal on testnet** (Sepolia/Holesky): deploy v2, run a tiny end‑to‑end job.  
6. **Freeze mainnet parameters** (fees, treasuries, operators) in a reviewed plan.  
7. **Deploy v2 on mainnet** via Defender with the Safe as the sole approver.  
8. **Verify contracts on the explorer** and record addresses.  
9. **Initialize parameters** (fees/burn/treasury/allowlists) via the Safe.  
10. **Run smoke tests** and start routine monitoring.

---

## What you’ll need

- **Governance wallet:** A Safe (Gnosis) multi‑sig with ≥2 hardware‑wallet signers.  
- **Operational console:** OpenZeppelin **Defender** account connected to the Safe.  
- **One technical operator (optional but recommended):** to run the one‑off preflight commands in Appendix A.  
- **Budget:** ETH for gas on testnet (tiny) and mainnet (deployment + initializations).  
- **Explorers:** Etherscan (mainnet + any testnet you use).

---

## Policy assumptions (read once)

- **Version:** Only **v2** under `contracts/v2` is supported; older artifacts are legacy and not audited.  
- **Identity:** Participation expects **ENS subdomains** (agents: `*.agent.agi.eth`, validators: `*.club.agi.eth`).  
- **Token:** All economics are denominated in **`$AGIALPHA` (18 decimals)** with the address baked in at deployment.

> If any of the above is not true for your launch, stop and consult the engineering team before proceeding.

---

## Phase 0 — Prep & safety rails

### 0.1 Create the governance Safe
- Go to Safe (Gnosis) and **create a new Safe** on the target network.  
- Add signers (use hardware wallets) and set a **threshold** (e.g., 2‑of‑3).  
- Record the **Safe address** in your internal notes.

### 0.2 Connect Defender (no code)
- In OpenZeppelin **Defender**, create a **Relayer** on the network you will deploy to.  
- **Link the Relayer to your Safe** so all deployments/changes are proposed and approved within the Safe UI.

### 0.3 Confirm $AGIALPHA
- Treat **`0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`** as canonical.  
- (If you have a technical operator) run the quick verification in **Appendix A** to ensure the local config matches the live token metadata.

### 0.4 Line up identities
- Make sure the **ENS policy** is understood and subdomains are configured for initial participants.

---

## Phase 1 — Dress rehearsal on a testnet (strongly recommended)

> **Objective:** Practice the exact motions you will execute on mainnet.

1. **Use the same Safe pattern** on the chosen testnet (create a testnet Safe with the same signer set).  
2. In Defender, **make a Deploy Proposal** for each module (see order below) and approve with the testnet Safe.  
3. **Deployment order (v2 modules):**
   1) StakeManager  
   2) ReputationEngine  
   3) IdentityRegistry  
   4) ValidationModule  
   5) DisputeModule  
   6) CertificateNFT  
   7) JobRegistry
4. **Initialize parameters** (fees/burn %, optional treasury, allowlists) via Safe‑approved transactions.  
5. **Run a tiny end‑to‑end job** with test tokens to prove escrow, fees, burns, and events.  
6. **Write down what worked** and any tweaks you want for mainnet (fee %, treasuries, operator addresses, pause wiring).

---

## Phase 2 — Mainnet deployment

### 2.1 Freeze the launch parameters
- Decide on:
  - **Fee/burn percentages**  
  - **Treasury address** (optional; must be pre‑approved on your allowlist)  
  - **Operator/oracle/acknowledger** addresses (if applicable)  
  - **Pause/unpause** stance at launch

> Tip: Capture this as a short **Launch Plan** (one page) and attach it to the Safe proposal for posterity.

### 2.2 Deploy the contracts (no code path)
- In Defender, create a **Deploy Proposal** for the v2 suite.  
- **Approve in the Safe** (threshold applies).  
- **Wait until the explorer** shows the contracts and the proxy/implementation links (if proxies are used).

### 2.3 Verify on the explorer
- Verify each contract/proxy on Etherscan so integrators see the correct ABI and implementation linkage.  
- Record the **final addresses** in `DEPLOYED_ADDRESSES.md` (or where your team stores them).

### 2.4 Initialize production parameters
Execute the following **as Safe‑approved transactions**:
- Set **fee/burn %** in `FeePool` / `JobRegistry`.  
- If you use a community **treasury**, **add it to the allowlist first**, then set it where supported.  
- Register any **operators/oracles** required for your configuration.  
- **Unpause** when you’re ready for public participation.

---

## Phase 3 — Go‑live validation (60 minutes)

- **Run smoke tests:** create one low‑value job, complete it, confirm events and balances.  
- **Check dashboards/indexers** (if you use a subgraph) update as expected.  
- **Snapshot governance:** export an owner/roles snapshot (see Appendix A optional commands).  
- **Announce readiness** to stakeholders.

---

## Phase 4 — Routine operations (owner hygiene)

Do these on a regular cadence (weekly/monthly):

- **No direct EOAs for admin:** all changes proposed through Defender and approved by the **Safe**.  
- **Keep a change‑log:** attach the Safe transaction hash and a one‑paragraph rationale for each parameter change.  
- **Run a quick owner health check** (see Appendix A) to ensure the governance wiring hasn’t drifted.  
- **Monitor** fees/treasury flows and consider alerts for abnormal activity.

---

## Emergency procedures (break‑glass)

If you need to react quickly (e.g., suspicious activity):

1. **Pause relevant modules** via a Safe‑approved transaction.  
2. If needed, **activate emergency allowlists** to restore access for trusted actors.  
3. **Announce publicly** what changed and why (even a short note helps).  
4. **Prepare a rollback/forward plan** and route it through the normal, documented Safe process.

> Remove any temporary allowlists and **unpause** once the incident is resolved.

---

## Addresses & artifacts

- **$AGIALPHA (mainnet):** `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`  
- **Deployed v2 addresses:** _fill this in after launch_  
- **Safe (governance) address:** _fill this in_  
- **Relayer ID (Defender):** _fill this in_  

---

## Appendix A — (Optional) one‑time technical preflight

> A single operator can run these locally. They **do not** require writing code and are safe to run.

```bash
# Install deps and compile
npm ci
npm run compile

# Unit tests
npm test

# Governance & wiring sanity checks
npm run owner:health
npm run verify:agialpha -- --skip-onchain
npm run owner:plan

# (When you have an RPC endpoint) live wiring verification
# Example: WIRE_VERIFY_RPC_URL=http://127.0.0.1:8545
# WIRE_VERIFY_RPC_URL=<rpc> npm run wire:verify
```

> These commands validate that the **committed token config** matches `$AGIALPHA`, prove that **privileged setters** are under owner control, and produce a **governance plan** you can attach to a Safe proposal.

### (Optional) generate a Safe‑ready batch for owner updates
```bash
npm run owner:update-all -- --network <network> --json > owner-plan.json

# Or build a Safe bundle during the dry run:
npm run owner:update-all -- --network <network>   --safe reports/<network>-owner-update.json   --safe-name "AGIJobs Owner Update"   --safe-desc "Dry-run bundle generated by owner:update-all"
```

---

## Appendix B — Data checklist for your launch plan

- [ ] Safe address and signer threshold  
- [ ] Fee % and burn %  
- [ ] Treasury address (if any) and confirm it’s on the allowlist  
- [ ] Operator/oracle/acknowledger addresses (if applicable)  
- [ ] Pause/unpause decision for day 1  
- [ ] ENS policy confirmed for agents/validators  
- [ ] Testnet rehearsal completed (date, Safe tx links)  
- [ ] Mainnet deployment approved (Safe tx link)

---

## Appendix C — Terms (plain English)

- **Safe (Gnosis):** a multi‑signature wallet where no single person can act alone.  
- **Defender:** a hosted console that proposes deployments/changes for your Safe to approve.  
- **Proxy verification:** making the explorer show both the upgradeable proxy and its current implementation.

---

## Appendix D — Module deployment order (for reference)

1) StakeManager  
2) ReputationEngine  
3) IdentityRegistry  
4) ValidationModule  
5) DisputeModule  
6) CertificateNFT  
7) JobRegistry

> Each module takes addresses from earlier steps, so keep this order.

---

## Change log

- v1.0 — Initial version of the non‑technical deployment runbook for AGIJobs v2.
