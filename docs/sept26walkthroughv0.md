Below is a **realistic, plain‑language walkthrough** of what it’s like for a **non‑technical person** to use **AGI Jobs** “in production” today. It focuses on the tasks you’d actually do—**posting a job**, **doing a job as an agent**, and **validating work**—and what you would click on (mostly **Etherscan’s** Read/Write tabs and simple web pages). When you see an unfamiliar blockchain term, I translate it into ordinary steps.

---

## Before you start (what you need—and what you don’t)

* **A wallet app** (e.g., MetaMask) connected to **Ethereum mainnet**. You’ll use it the same way you use Apple Pay or Google Pay to confirm actions. You don’t need to install any developer tools.
* Some **$AGIALPHA** tokens in your wallet if you’ll fund jobs, stake as an agent/validator, or raise disputes. The repository standardizes on $AGIALPHA (18 decimals) and treats it as **the** token for payments and staking; the token’s canonical mainnet address is shown in the repo’s “Deployed Addresses” table. ([GitHub][1])
* **ENS identity** is required **only** if you act as an **agent** (worker) or **validator**: agents own `<name>.agent.agi.eth`, validators own `<name>.club.agi.eth` (aliases under `*.alpha.*` are allowed). Employers (job buyers) don’t need ENS. The contracts verify this on‑chain at the time you apply or validate. If you’re missing the ENS, you’ll see a clear error on Etherscan and your transaction will revert. ([GitHub][1])
* You’ll be interacting with **verified contracts** via **Etherscan** links that your platform operator shares (JobRegistry, StakeManager, ValidationModule, etc.). The repo’s README and deployment guides are written with Etherscan in mind, including a “browser‑only” path for operators. ([GitHub][1])

> **Tip**: think of Etherscan like a secure control panel. Each contract page has a **“Read Contract”** tab (look without changing anything) and a **“Write Contract”** tab (perform an action). You connect your wallet at the top of the page to enable the Write tab.

---

## Persona 1 — You’re an employer (you want to post and pay for a job)

**What you want:** “I have 500 images that need labeling. I’m happy to pay **5 AGIALPHA**. I want it within a week.”

**What you do (5–8 minutes):**

1. **Open the JobRegistry on Etherscan**
   Your operator gives you the JobRegistry address (they usually publish a list of deployed module addresses). Click into the **“Write Contract”** tab and **Connect to Web3** (top right). ([GitHub][1])

2. **Paste the job details**
   Most JobRegistry versions accept two inputs when **creating a job**:

   * **Reward amount**: enter `5000000000000000000` for **5.0 AGIALPHA** (the system uses 18 decimals; the UI will not add them for you).
   * **Job description URI**: paste a link to your spec (e.g., an IPFS link to a short markdown or PDF).
     If you don’t have an IPFS link, your operator can give you a quick web form that uploads your text to IPFS and returns a link.

3. **Approve token movement (one time)**
   Because the reward is held in escrow by the system, you first **approve** the StakeManager to access exactly **5 AGIALPHA** from your wallet. Etherscan can help: go to the **$AGIALPHA token** page (from the address in the repo table), **Write > approve(spender, amount)**, set `spender` to **the StakeManager address** your operator gave you, `amount` to `5000000000000000000`, and confirm in your wallet. (If the token supports “permit” you might skip this step, but the safe path is a one‑time approval.) ([GitHub][1])

4. **Create the job**
   Back in **JobRegistry → Write**, call `createJob(reward, uri)`. Confirm in your wallet. Within ~15–60 seconds, you’ll see a green check on Etherscan and an **event** such as **JobCreated(jobId, …)** in the transaction logs. That jobId (e.g., **#123**) is your ticket number going forward. ([GitHub][1])

5. **Watch for progress**
   You can:

   * Ask your operator to share a **status page** (many run a tiny “agent gateway” UI that listens for `JobCreated` and `JobCompleted` events and shows you updates).
   * Or just check the **JobRegistry “Read” tab** for your job’s status if the contract exposes it. The repo includes a tiny “quick start” script path for power users, but you don’t need scripts; the operator can watch events for you. ([GitHub][1])

6. **Finalize payment**
   After validators approve (more on that below), the validation module or JobRegistry enables **finalization**. Anyone (you or the agent) can call **finalize(jobId)**. Funds automatically move: protocol fee is taken, a portion may be **burned** according to policy, and the **net reward** is paid to the agent. The repo ships a “burn receipts” guide so employers can recognize and verify burns in the logs (you’ll see **FeesBurned** or a token `burn` call in the trace, depending on implementation). ([GitHub][1])

**What you see in plain English:**

* “Approve 5.0 AGIALPHA to escrow this job?” (Wallet prompt.)
* “Post job with reward 5.0 AGIALPHA and spec at ipfs://…?” (Etherscan call.)
* “Job #123 created.” (From the event logs.)
* Later: “Job #123 validated. Finalizing…” → “Paid 5.0 AGIALPHA (fee 5%, burn 1%, net 4.7 to agent).” (Shown as events and balances; your operator may send you a friendly receipt referencing the transaction.)

**What can go wrong (and how it reads to you):**

* *“Insufficient allowance”*: you didn’t approve the StakeManager for the reward amount; go back to the token’s `approve` and try again.
* *“URI invalid / empty”*: supply a job spec URI (IPFS link); the system wants a pointer to what you’re asking for.
* *“Finalize reverted”*: validation may still be in progress or a dispute was raised—wait for the window to close or the dispute to resolve.

---

## Persona 2 — You’re an agent (you want to earn by doing jobs)

**What you want:** “I want to take job #123, do it, and get paid.”

**What you do (10–20 minutes the first time; much faster later):**

1. **Get (or verify) your ENS subdomain**
   You must control a subdomain like **`yourname.agent.agi.eth`** (or an accepted `*.alpha.agent.agi.eth`). If you don’t have one, your operator will give you a self‑serve link or instructions to **register/assign** that name to your wallet. The system **checks ownership on‑chain**; without it, your **apply** will revert with a helpful “not a recognized agent” error. ([GitHub][1])

2. **Stake a small amount of $AGIALPHA**
   Go to **StakeManager** on Etherscan → **Write**. If the platform requires, **approve** StakeManager to move the stake amount from your wallet (e.g., **1.0 AGIALPHA**). Then call **`depositStake(role, amount)`** (role = Agent). The stake is risk collateral against low‑quality work and is withdrawable later if you keep a good track record. (Min stake and slashing percentages are set by the operator.) ([GitHub][1])

3. **Apply for the job**
   In **JobRegistry → Write**, call **`applyForJob(jobId, …)`** (parameter names vary slightly by version; the README and API reference list the exact signature). If your ENS is correct and your stake meets the threshold, the job will move to “assigned” and you’ll see **JobApplied** in logs. If allowlists are enabled, you might also paste a short proof string your operator sends you. ([GitHub][1])

4. **Do the work, then submit**
   Finish the task offline/with your tools. Upload your result to IPFS (your operator may give you a one‑click uploader). Then call **`completeJob(jobId, resultURI)`** in **JobRegistry → Write**. The job state becomes “Submitted”; validators are notified to review. ([GitHub][1])

5. **Get paid**
   After validation and finalization, the reward arrives in your wallet automatically—no extra button. You’ll see an **event** (e.g., `RewardPaid`) and a token transfer to your address (minus protocol fee/burn). The operator may send you a friendly “receipt” with the transaction link. ([GitHub][1])

**What you see in plain English:**

* “Stake 1.0 AGIALPHA as agent?” (Wallet prompt + Etherscan call.)
* “Apply for job #123…” → “Assigned.”
* “Submit result: ipfs://…?” → “Submitted; awaiting validation.”

**What can go wrong (and how it reads):**

* *“ENS ownership check failed”*: the subdomain you typed isn’t owned by your wallet; reassign or use the correct name. ([GitHub][1])
* *“Insufficient stake”*: deposit/raise your agent stake first.
* *“URI invalid / too large”*: compress files or paste a smaller artifact link; store the big file set in a folder and link to an index.

---

## Persona 3 — You’re a validator (you check the work and earn fees)

**What you want:** “I review submissions, vote Approve/Reject during a window, and collect a small reward.”

**What you do (5–10 minutes per job):**

1. **Get (or verify) your ENS subdomain**
   Validators use **`<name>.club.agi.eth`** (or `*.alpha.club.agi.eth`). Without this, your commit/reveal calls will revert per the identity policy. ([GitHub][1])

2. **Stake as validator**
   In **StakeManager → Write**, call **`depositStake(role=Validator, amount)`** (approve first if needed). ([GitHub][1])

3. **Commit your vote (during the commit window)**
   Validation uses a simple **commit‑reveal** so validators can’t copy each other. Your operator typically gives you a tiny web form or a snippet that produces a **hash** from: `(jobId, yourDecision, secretSalt)`.

   * On **ValidationModule → Write**, call **`commit(jobId, commitHash, …)`**.
   * Keep the **salt** private; you’ll use it in the next step. (If you try to reveal too early/late, Etherscan will show a clear revert about the window.) ([GitHub][1])

4. **Reveal your vote (during the reveal window)**
   When the reveal window opens, call **`reveal(jobId, approveBool, salt)`**. The contract checks your reveal matches your earlier commit. After enough reveals come in, the module determines the outcome. ([GitHub][1])

5. **Get your validator reward**
   After the job is finalized, your small validator reward is paid. You can **Read** the **FeePool** or your wallet transfers to see it. The protocol may **burn** a portion of fees—you’ll see a burn receipt (or token `burn`) in the transaction logs per the burn receipts doc. ([GitHub][1])

**What you see in plain English:**

* “Commit your vote for job #123” → “Success.”
* Later: “Reveal your vote (Approve) with salt ****” → “Success.”
* “Job #123 reached consensus → Finalized → Validator reward paid; burn recorded.”

**What can go wrong (and how it reads):**

* *“Outside commit/reveal window”*: you’re early or late. Check the time fields in **ValidationModule → Read** for `commitWindow`/`revealWindow`.
* *“Reveal doesn’t match commit”*: you typed the wrong salt or vote—recompute exactly what you committed.

---

## Disputes (rare—but there when you need them)

If an employer feels work was approved incorrectly, or an agent feels a rejection was unfair, either can raise a **dispute** within the configured **dispute window** (the operator publishes this). On Etherscan, go to **DisputeModule → Write** and call **`raiseDispute(jobId, evidenceURI)`** (sometimes a small dispute bond in $AGIALPHA is required). The module switches the job to **Disputed**; the designated moderator/committee (or owner, per policy) resolves it with a final decision, sending funds accordingly and potentially **slashing** stake if there was misbehavior. The README and operator runbooks call out these owner‑controlled levers. ([GitHub][1])

---

## What a full day might feel like (start to finish)

**Morning**: You post **Job #123** (5 AGIALPHA, 7 days, IPFS spec). You see “JobCreated” on Etherscan. An agent stakes, applies, and instantly gets assigned. ([GitHub][1])

**Afternoon**: The agent submits results (an IPFS link). The system emits “JobSubmitted,” and 1–3 validators get pinged (your operator’s dashboard shows them a link to the artifacts). Validators do their two clicks—**commit** then **reveal**—within their windows. ([GitHub][1])

**Later that day**: Enough reveals are in; someone clicks **Finalize**. You see:

* Reward paid to the agent,
* Protocol fee siphoned to the FeePool/treasury,
* A small **burn** recorded (supply‑reducing), with **burn receipt** visible in logs. ([GitHub][1])

You didn’t need to run any command‑line tools. You clicked a few buttons on trusted explorer pages and copy‑pasted two or three IPFS links. The “blockchain parts” **behaved like a normal checkout flow**: approve once, confirm a couple of actions, and read a clear receipt.

---

## How this aligns with the live repo (why the experience works like this)

* **v2 is the supported surface** of AGI Jobs. The README states that v2 lives under `contracts/v2`, legacy v0 moved to `contracts/legacy/`, and that all participants follow the **ENS identity policy** (agents = `.agent.agi.eth`, validators = `.club.agi.eth`, including the `*.alpha.*` aliases). This is why your “apply” and “validate” revert if you don’t control the right ENS name. ([GitHub][1])
* The **token economy** is standardized on **$AGIALPHA (18 decimals)**. The mainnet token address is fixed in config and surfaced in the Deployed Addresses section, so everyone is using the same asset for jobs, stakes and fees. ([GitHub][1])
* Operators get **browser‑only deployment guides** (wizard, Etherscan walkthrough, institutional playbooks). That’s why you’re given clean Etherscan links and don’t need local dev tools as a user. ([GitHub][1])
* The protocol **emits structured events** for each lifecycle step (created/applied/submitted/finalized), and ships **burn‑receipt guidance** so non‑technical stakeholders can recognize true burns on Etherscan. Your “receipts” are literally those events & traces. ([GitHub][1])

---

## A minimal checklist you can hand to a non‑technical colleague

**Employer**

1. Have **5.1–5.2 AGIALPHA** (reward + small fees) in your wallet.
2. **Approve** StakeManager to move **5.0 AGIALPHA** (token page → `approve`).
3. **JobRegistry → createJob** with your **reward** and **IPFS spec link**.
4. After validators finish, **Finalize** the job (or wait—the agent may finalize for you). ([GitHub][1])

**Agent**

1. Make sure you own **`yourname.agent.agi.eth`** (or an accepted alias) and it points to your wallet.
2. **Stake** a small amount in **StakeManager** (role = Agent).
3. **Apply** to the job in **JobRegistry**.
4. **Submit results** with an **IPFS link**. Payment arrives automatically after finalize. ([GitHub][1])

**Validator**

1. Make sure you own **`yourname.club.agi.eth`** (or alias).
2. **Stake** as validator.
3. **Commit** your vote (Etherscan call with a precomputed hash).
4. **Reveal** your vote (approve/reject with your secret salt). Collect the reward after finalization. ([GitHub][1])

**Disputes**

* If needed, call **`raiseDispute(jobId, evidenceURI)`** in **DisputeModule** within the dispute window; paste your **IPFS evidence** link. Wait for the moderator’s resolution. ([GitHub][1])

---

### The bottom line

For a non‑technical user, **production use** of AGI Jobs today feels like **checking out on a storefront**: a couple of approvals, a couple of confirms, and then **watch the receipt**. The repository is set up so operators give you the exact **Etherscan links**, standardized token settings (**$AGIALPHA**), and clear **ENS identity rules**—so you can get through the entire workflow with copy‑paste and clicks, no coding. ([GitHub][1])

[1]: https://github.com/MontrealAI/AGIJobsv0 "GitHub - MontrealAI/AGIJobsv0: ✨ \"We choose to free humanity from the bonds of job slavery—not because it is easy, but because our destiny demands nothing less; because doing so unleashes the full measure of our genius and spirit; and because we embrace this challenge and carry it to triumph.\" ✨"
