# AGI Jobs “One‑Box” UX Sprint

**A ChatGPT‑style single input box that does everything—backed by Meta‑Agentic orchestration and invisible blockchain**

> **Scope**: Deliver a production‑ready, single‑textbox interface (“One‑Box”) that interprets natural language, plans actions via the AGI‑Alpha meta‑orchestrator, and executes on‑chain workflows (jobs, staking, validation, disputes) with **gasless** UX, **ENS enforcement**, and **$AGIALPHA‑only** economics. All modules remain hot‑swappable; owners retain full control via safe admin panels and Etherscan fallbacks.
> **Code targets**: This sprint targets the supported **v2** modules in `contracts/v2` (the repo states v2 is the only supported line and v0 is legacy) and reuses the repo’s identity, token, fees and wiring docs as the source of truth. ([GitHub][1])

---

## 0) What exists now (ground truth) and why it matters to the sprint

* **v2 only; v0 is legacy**: The README clarifies v2 is the supported line; legacy artifacts live under `contracts/legacy/`. Our One‑Box UX rides on v2 modules and keeps legacy tooling segregated for reference only. ([GitHub][1])
* **Hard $AGIALPHA config**: Token parameters are centralized in `config/agialpha.json`; `npm run compile` regenerates `contracts/v2/Constants.sol` and enforces consistency (decimals, address, symbol). The sprint will set the canonical **mainnet** token and wire checks into CI to prevent drift. ([GitHub][1])
* **ENS identity enforced**: Agents must own `<name>.agent.agi.eth`; validators must own `<name>.club.agi.eth`. The repo ships policy docs and owner tools (allowlists only for emergencies). The One‑Box UX must surface this as friendly guidance and capture ENS errors gracefully. ([GitHub][1])
* **FeePool and burns**: Protocol fees flow to `FeePool`, with a configurable `burnPct` and treasury controls. The One‑Box UX must show user‑friendly fee/burn summaries and ownership handoffs. ([GitHub][1])
* **Etherscan‑only operation is supported**: The repo includes an Etherscan job lifecycle guide (Create → Apply → Validate → Finalize → Dispute), which we will retain as a visible fallback in the One‑Box. ([GitHub][1])
* **Existing web dApp (reference UX)**: The GitHub Pages “AGI Job NFT Marketplace” shows a form‑based UX (connect wallet, IPFS hash, payout, duration). The One‑Box replaces these forms with a single conversational input, while keeping that page as an advanced view. ([Montréal.AI][2])
* **Meta‑Agentic orchestrator**: AGI‑Alpha‑Agent‑v0 exposes an HTTP API and quickstart that we can consume as the “planner/executor brain” behind the chat. ([GitHub][3])
* **ENS subdomain registrar (optional)**: A ForeverSubdomainRegistrar at `0xD75459a31c389f3EBa9ad9bA778e9Ea574A7a777` can be linked for self‑serve issuance of `.ALPHA.CLUB.AGI.eth` / `.AGENT.AGI.eth` if operators choose. We’ll add a UX “Get my agent/club name” flow that forwards to this registrar. ([Ethereum (ETH) Blockchain Explorer][4])

---

## 1) Deliverables (two‑week sprint; production‑grade)

### D1. **One‑Box Web App** (Next.js + Edge Functions)

* **Path**: `apps/onebox`
* **Features**

  * A **single text input** that interprets free‑form goals: “post a job”, “earn as validator”, “dispute #123”, “show my reputation”, etc.
  * **Conversational planner**: calls the Meta‑Agent Orchestrator (AGI‑Alpha) to transform intent → plan → tool calls. ([GitHub][3])
  * **Gasless UX**: integrated 4337 account‑abstraction or relayer (sponsored gas); tokens and approvals handled automatically with secure prompts.
  * **ENS helper**: inline checks + “Get my agent/club name” linking to the registrar contract; clear recovery when ENS isn’t configured. ([Ethereum (ETH) Blockchain Explorer][4])
  * **Owner Console** (role‑gated): human‑readable sliders/inputs for fees, burn %, minimum stake, windows, treasuries, allowlists, etc.—mirrors on‑chain setters. (Still Etherscan‑friendly.)
  * **Accessibility & i18n**: WCAG AA, keyboard‑only, screen‑reader roles; i18n stubs for top languages.

### D2. **Meta‑Agent Tooling & Chain Adapter**

* **Path**:

  * `packages/orchestrator` (TS ICS planner; tool router; generated ABIs + typed wrappers for JobRegistry/StakeManager/etc.)
  * `services/chain-adapter` (Node/TypeScript HTTP microservice that executes on‑chain calls, simulates with `callStatic`, and submits via sponsor/4337)
  * `services/alpha-bridge` (Python façade talking to AGI‑Alpha‑Agent‑v0; rate‑limited, stateless JWT auth) ([GitHub][3])
* **Behavior**

  * **ICS** (Intent/Context/Steps) schema from One‑Box → AGI‑Alpha; **Back‑Plan** schema from AGI‑Alpha → Chain Adapter (deterministic, auditable steps).
  * All contract calls **idempotent**, **simulated**, and **explained** to the user in plain language before execution.

### D3. **End‑to‑End Job Lifecycle (1–3 validators)**

* **Flows** implemented through chat:

  * Employer: “Create job …” → escrow reward in **$AGIALPHA** → JobCreated → track → finalize.
  * Agent: “I want to work” → stake check → apply → submit results → payout.
  * Validator: “Let me validate” → commit/reveal → finalize → validator reward.
  * Disputes: “Dispute job #…” → bond → moderator resolution → slashing/payout.
  * **All events** surfaced in the chat transcript; Etherscan links included for transparency. Repo’s Etherscan lifecycle is mirrored. ([GitHub][1])

### D4. **Owner Handover & Governance**

* **Make owner control obvious**: safe‑mode wizards to change fees, burns, windows, allowlists; display impact and require typed confirmation.
* **Wiring verifier**: leverages repo’s existing owner and wiring health checks; surfaced in UI. ([GitHub][1])

### D5. **CI + QA + Security**

* **GitHub Actions**: lint/test/build for app & services; Foundry/Hardhat unit tests; Playwright E2E (mock chain + live RPC gates).
* **Config guards**: fail CI if `config/agialpha.json` and live token metadata diverge (the repo already provides a verifier; we call it in CI). ([GitHub][1])
* **Secrets scanning**, **actionlint**, **OWASP ASVS checklists**, **sourcemap uploads**, **bundle size budgets**.

---

## 2) Architecture (at a glance)

```mermaid
sequenceDiagram
  actor U as User (One‑Box)
  participant BOX as apps/onebox (Next.js)
  participant ORCH as services/alpha-bridge (AGI‑Alpha meta‑agent)
  participant CHAIN as services/chain-adapter (ethers/4337)
  participant ETH as Ethereum (AGIJobs v2)
  U->>BOX: "I want to hire someone to label 500 images"
  BOX->>ORCH: Intent {goal, context}
  ORCH-->>BOX: Plan [{step: createJob, args:{reward, uri}}, ...]
  BOX->>CHAIN: Exec(createJob) [simulate → present summary → execute]
  CHAIN->>ETH: JobRegistry.createJob(...)
  ETH-->>CHAIN: JobCreated(jobId)
  CHAIN-->>BOX: Success + event payload
  BOX-->>U: "Job #123 created; escrowed 50 $AGIALPHA; I’ll monitor validators"
```

**Notes**

* Contract wrappers and config come from the repo’s v2 modules and `config/agialpha.json` → `contracts/v2/Constants.sol`. ([GitHub][1])
* Identity checks exactly follow the repo’s ENS policy and emergency allowlists. ([GitHub][1])
* The public “Etherscan lifecycle” remains the documented fallback and is always one click away in the UI. ([GitHub][1])

---

## 3) Implementation Plan (tasks, owners, acceptance criteria)

### Sprint Day 1–2 — **Repo plumbing & scaffolding**

* **Create app & services**

  * `apps/onebox` (Next.js 14 / App Router) scaffold with CSR chat pane, system messages, file uploads.
  * `services/chain-adapter` (Node 20.19.0 runtime, Fastify) with routes: `/simulate`, `/execute`, `/estimate`, `/events/subscribe`.
  * `services/alpha-bridge` (Python 3.11, FastAPI) proxy to AGI‑Alpha‑Agent‑v0 `/:plan`, `/:tools` endpoints; add JWT guard. ([GitHub][3])
* **Orchestrator package**

  * `packages/orchestrator`: extend ICS planner + tool routing with generated ABIs, contract factories, and config loaders from `docs/deployment-addresses.json`, falling back to per‑network `.env`.
* **Acceptance**

  * CI builds all 3 packages; orchestrator exports `JobRegistry`, `StakeManager`, `ValidationModule`, `DisputeModule` tool adapters.

### Day 3–4 — **ICS/Plan protocols & simulations**

* Define `Intent` → `PlanStep[]` JSON schemas.
* Implement **dry‑run** (`callStatic`) for every write; return human summary.
* UX: plan preview with “Confirm/Cancel”, then execute.
* Acceptance: **10 happy‑path simulations** (create/apply/commit/reveal/finalize/dispute) green against Holesky/Anvil.

### Day 5–6 — **Gasless transactions & key mgmt**

* Integrate **4337** (bundler + paymaster) or a sponsor relayer fallback.
* Implement **session keys**, daily spend caps, and **allowlist of contract methods**; only One‑Box‑sanctioned calls are permitted.
* Acceptance: end‑to‑end **without ETH** in user wallet; transaction receipts show correct sender (smart account) and contract events.

### Day 7 — **ENS experience**

* Inline ENS ownership checks; show **exact revert reason** if caller lacks `<label>.agent.agi.eth` or `<label>.club.agi.eth`. ([GitHub][1])
* Add “Get my ENS name” CTA pointing to **ForeverSubdomainRegistrar** (with cost and safety tips). ([Ethereum (ETH) Blockchain Explorer][4])
* Acceptance: screen capture of a **non‑owner ENS revert** (required by drill).

### Day 8 — **Owner Console**

* Panels for: **feePct (bps)**, **burnPct (%)**, **minStake**, **commit/reveal windows**, **treasuries**, **allowlists/merkle roots**.
* Wire to on‑chain setters (`StakeManager`, `JobRegistry`, `FeePool`, etc.) and surface the repo’s **owner wizard/plan** concepts. ([GitHub][1])
* Acceptance: modify params in a test env and read them back from `Read Contract` and SDK.

### Day 9 — **Etherscan parity & links**

* Ensure every action also shows “Do it on Etherscan” instructions, reflecting repo’s lifecycle guide. ([GitHub][1])
* Acceptance: each chat action has a **help panel** with the corresponding Etherscan method name and inputs.

### Day 10 — **E2E drill (micro‑job) & governance handoff**

* **Micro‑job**: reward `1e15` wei of `$AGIALPHA`; 1–3 validators; burnPct > 0.
* Capture:

  1. **ENS revert** screen;
  2. **Lifecycle events** (JobCreated → Applied → Submitted → Commit/Reveal → Finalized);
  3. **`totalSupply()` before/after** finalization (burn evidence).
* Transfer ownership to **multisig/timelock**; publish **address table + Etherscan links** in README (Deployed Addresses).
* Acceptance: all artefacts present in `docs/drill/`.

---

## 4) One‑Box UX spec (what the user actually sees)

**Single input**. Example:

> “Hire someone to label 500 images of cats vs dogs with 50 AGIALPHA by next Friday.”

The chat replies with:

1. **Clarify** missing fields (deadline, accuracy, dataset location).
2. **Plan summary** (auto‑approval, chosen validator count, fee/burn snapshot).
3. **Confirm** (human‑readable: “You’ll escrow 50 AGIALPHA, fee 5%, burn 1%, validators x2”).
4. **Execute** (gasless).
5. **Live updates** with **Etherscan links** (from the repo’s lifecycle). ([GitHub][1])

**Role examples**:

* “I want to earn as a validator.” → Stake flow, commit/reveal prompts, reminders, rewards.
* “Dispute job #321: validator missed edge cases.” → Dispute bond, evidence upload, resolution ETA.
* “Change burn to 5% and set min stake = 10 AGIALPHA.” (Owner) → Simulation + typed confirmation + transaction bundle.

---

## 5) Developer‑facing APIs (concise)

### 5.1 `services/alpha-bridge` (Python/FastAPI)

```python
# POST /plan
{ "intent": {...}, "context": {...} } -> { "steps": [ { "tool": "createJob", "args": {...} }, ... ] }

# POST /tools/validate
{ "steps": [...] } -> { "ok": true, "normalized": [...] }  # shape check, arg coercion

# POST /tools/execute  (delegates to chain-adapter)
{ "steps": [...] } -> { "exec": [ { "txHash": "0x...", "events": [...] }, ... ] }
```

Backed by AGI‑Alpha‑Agent‑v0 planning primitives; runs with pinned Python deps and stateless auth. ([GitHub][3])

### 5.2 `services/chain-adapter` (Node/Fastify)

```ts
POST /simulate { step } -> { summary, gas, ok, reasons? }  // uses callStatic
POST /execute  { step } -> { receipt, events, etherscan }
GET  /events/subscribe?jobId=... -> SSE stream of indexed events
```

* Allowed tools: `createJob`, `approveAndCreateJob`, `depositStake`, `applyForJob`, `submitWork`, `commitValidation`, `revealValidation`, `finalize`, `raiseDispute`, `resolveDispute`, owner setters.
* Reads ABIs/addresses from `packages/orchestrator` (built from repo contracts).

---

## 6) Security, Modularity & Owner Control (institutional‑grade)

* **Module hot‑swap**. Because each repo module is single‑purpose and addressed independently (StakeManager, ReputationEngine, IdentityRegistry, ValidationModule, DisputeModule, CertificateNFT, JobRegistry), the SDK resolves addresses from config; swapping to **new versions** is changing config + verifying interfaces, not redeploying the app. (That matches the repo’s v2 modular statement.) ([GitHub][1])
* **Simulation‑first**. All writes are `callStatic`‑simulated; humans get a natural‑language preview (who pays, who gets slashed, fees/burns).
* **4337 policy**. Session keys, method allowlist (only AGIJobs v2 contracts), daily spend caps, and per‑session revocation.
* **Identity correctness**. ENS proofs are verified exactly as in repo docs; emergency allowlists exist but are logged with explicit “bypass” badges. ([GitHub][1])
* **Owner mastery**. Every on‑chain setter exposed in the **Owner Console** with safe defaults, multi‑step confirm, and **one‑click Etherscan fallback** showing the exact function (name + args) per repo’s Etherscan guide. ([GitHub][1])

---

## 7) CI/CD (all green or it doesn’t merge)

`.github/workflows/onebox-ci.yml`

* **Jobs** (current repo)

  * `build`: installs One-Box and orchestrator dependencies, then runs both package builds and the orchestrator typecheck.
  * `smoke-tests`: rebuilds orchestrator output and performs a minimal runtime import to guarantee the bundle can be required.

* **Planned extensions** (add explicit jobs in the workflow when we introduce them)

  * `lint` (ESLint/Prettier for TS; Ruff/Black for Python).
  * `contracts` (`npm run compile`, `npm run test`, **`npm run verify:agialpha -- --skip-onchain`** to ensure `config/agialpha.json` ↔ constants). ([GitHub][1])
  * `e2e` (Playwright—Anvil fork + seeded addresses; run **micro-job** scenario end-to-end including burn delta and ENS negative case).
  * `security` (`npm audit --audit-level=high`, `bandit -q -r services/alpha-bridge`, `gitleaks`, `actionlint`).

**Blocking rules**:

* Fail if `agialpha.json` malformed or diverges from compiled constants (repo already enforces this; we wire it to CI). ([GitHub][1])
* Fail if bundle size > budget or if E2E drill artifacts are missing.

---

## 8) Owner & Ops Playbook (in‑app and in docs)

* **Set $AGIALPHA** (per operator spec): put the canonical mainnet address in `config/agialpha.json`; run `npm run compile`; CI rejects mismatches. ([GitHub][1])
* **IdentityRegistry sync**: `npm run identity:update -- --network mainnet` keeps ENS roots (`agent.agi.eth`, `club.agi.eth` and `*.alpha.*` aliases) consistent. Exposed as “Sync ENS” button in Owner Console. ([GitHub][1])
* **Fees & treasury**: change `feePct` and `burnPct` safely; Link **FeePool** docs in the dialog; treasury must be pre‑approved per allowlist guards. ([GitHub][1])
* **Wiring & health**: the Owner Wizard/Plan and Wiring Verifier from docs are wrapped in the UI with copy‑paste Etherscan buttons. ([GitHub][1])

---

## 9) Acceptance tests (explicit)

1. **Micro‑job drill** (live RPC or Holesky):

   * Create job (reward `1e15` wei of `$AGIALPHA`), 1–3 validators, `burnPct > 0`.
   * Capture **JobCreated → Applied → Submitted → Commit → Reveal → Finalized** events from SDK stream and link Etherscan detail pages. ([GitHub][1])
   * Record token **`totalSupply()` before/after** finalization to show burn delta.
2. **ENS negative**: try to apply/validate without owning the correct subdomain; show friendly error and attach revert reason. (Repo: ENS policy strictly enforced.) ([GitHub][1])
3. **Owner change**: set `burnPct` and `feePct`, rotate treasury to an allow‑listed address, then confirm via `Read` calls and Etherscan. ([GitHub][1])
4. **Gasless**: run the full flow with a new user that holds no ETH; transactions succeed via 4337 sponsor or relayer.
5. **Hot‑swap module** (staging): change the `ValidationModule` address in config (keeping interface) and re‑run “validate” steps without redeploying UI.

*All screenshots and event logs go in `docs/drill/` and are linked from README → **Deployed Addresses** section.*

---

## 10) Risks & mitigations (explicit)

* **Token address mismatch** → **CI gate** via `verify:agialpha`; block merges on divergence. ([GitHub][1])
* **ENS UX friction** → inline checker + registrar CTA (with safety copy); delegate **AttestationRegistry** when appropriate to authorize alternate addresses. ([GitHub][1])
* **4337/regulatory variability** → keep a sponsor‑relayer fallback; surface ETH prompts only as last resort.
* **Owner errors** → simulate and summarize owner changes in plain language; require typed confirmation and show Etherscan fallback.

---

## 11) What to add to the repo (PR checklist)

* `apps/onebox/` – Next.js app (chat UI, Owner Console, drill helper).
* `services/chain-adapter/` – Fastify service with 4337 integration and “simulate → execute” contract runner.
* `services/alpha-bridge/` – FastAPI service proxying AGI‑Alpha‑Agent‑v0 planning endpoints. ([GitHub][3])
* `packages/orchestrator/` – ICS planner, tool router, and TypeScript wrappers for AGIJobs v2 modules.
* `docs/onebox-sprint.md` – this file.
* `docs/drill/` – artifacts from the micro‑job demonstration (screens, logs, totalSupply diffs).
* CI workflow(s): `.github/workflows/onebox-ci.yml` (current `build` + `smoke-tests`; extend with lint/e2e/security when added) + cache.
* README patch: “Deployed Addresses” table, Etherscan links, and “Try the One‑Box” URL.

---

## 12) Copy‑paste owner story (Day‑2 Ops)

1. Set mainnet `$AGIALPHA` in `config/agialpha.json` → `npm run compile` → `npm run verify:agialpha`. (CI blocks if wrong.) ([GitHub][1])
2. Deploy/wire v2 modules per existing docs; run owner wizard/plan. ([GitHub][1])
3. Open One‑Box Owner Console → **Sync ENS** roots; optionally enable registrar links. ([GitHub][1])
4. Set `feePct`, `burnPct`, `minStake`, windows; simulate → confirm; capture events.
5. Transfer ownership to Safe/timelock; publish addresses in README (“Deployed Addresses”).
6. Run the **micro‑job drill**; attach evidence bundle to `docs/drill/`.

---

## 13) Appendix — Pinned truths used in this plan

* V2 is supported; v0 legacy only. Identity policy enforces ENS subdomains; emergency allowlists exist; `$AGIALPHA` configured via `config/agialpha.json` → `Constants.sol`; FeePool burns with `burnPct`; comprehensive Etherscan flow exists. ([GitHub][1])
* AGI‑Alpha‑Agent‑v0 exposes an API and quickstart; we consume it as the planner. ([GitHub][3])
* Optional subdomain registrar at `0xD75459a31c389f3EBa9ad9bA778e9Ea574A7a777` for `.ALPHA.CLUB.AGI.eth`/`.AGENT.AGI.eth` UX. ([Ethereum (ETH) Blockchain Explorer][4])
* Existing public dApp (form‑based) at GitHub Pages serves as an “advanced view”; One‑Box supersedes it for everyday users. ([Montréal.AI][2])

---

## 14) Final notes on modularity & replacement

This sprint **does not change** on‑chain functionality; it wraps it in a **planner‑driven UX** and an **adapter** that reads **addresses and ABIs from config**, ensuring that **any module** (e.g., `ValidationModule` vN+1) can be swapped by governance with no UI redeploy. That aligns with the repo’s v2 modular design—**each contract owns its state and is replaceable**—and gives owners full, user‑friendly control without sacrificing Etherscan clarity. ([GitHub][1])

---

**End of document.**

[1]: https://github.com/MontrealAI/AGIJobsv0 "GitHub - MontrealAI/AGIJobsv0: ✨ \"We choose to free humanity from the bonds of job slavery—not because it is easy, but because our destiny demands nothing less; because doing so unleashes the full measure of our genius and spirit; and because we embrace this challenge and carry it to triumph.\" ✨"
[2]: https://montrealai.github.io/agijobsv0.html?utm_source=chatgpt.com "AGI Job NFT Marketplace"
[3]: https://github.com/MontrealAI/AGI-Alpha-Agent-v0 "GitHub - MontrealAI/AGI-Alpha-Agent-v0: META‑AGENTIC α‑AGI ️✨ — Mission   End‑to‑end: Identify  → Out‑Learn  → Out‑Think  → Out‑Design  → Out‑Strategise ♟️ → Out‑Execute ⚡"
[4]: https://etherscan.io/address/0xD75459a31c389f3EBa9ad9bA778e9Ea574A7a777
