# 🏛️ Large-Scale α-AGI Business 3 — Omega-Grade Edition

This dossier packages an Omega-grade demonstration of AGI Jobs v0 (v2) without inventing a single new primitive. It layers the existing Trident orchestration engine, owner playbooks, validator simulators, and conversational UIs into a turnkey storyline where entire nations and treasury-controlled wallets transmute planetary free-energy gradients into compounding cash-flows.

The deliverable is a non-technical command centre: run one script, open three familiar UIs, and watch three sovereign coalitions cooperate and get paid entirely on-chain. Every artefact lands under `reports/omega-business-3/` with deterministic hashes so compliance teams, investors, and auditors can trust the outcome.

---

## Quick Launch (zero new code)

1. **Install prerequisites**
   - Node.js v20.18.1 (same toolchain the repo enforces).
   - Docker Engine/Desktop if you prefer the one-click stack (optional).
   - An Ethereum wallet for mainnet deployment (MetaMask, Rabby, Ledger).
2. **Clone + bootstrap**
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   npm install
   ```
3. **Run the Omega orchestration**
   ```bash
   npm run demo:omega-business-3
   ```
   The orchestrator reuses production scripts to:
   - Regenerate the complete owner control dossiers (quickstart, command centre, parameter matrix, surface map).
   - Execute a sovereign wallet simulation (`test/demo/omegaBusinessSimulation.test.ts`) where three nations, two validator guilds, and a treasury coordinate jobs and payouts.
   - Emit a cryptographically signed ledger plus a mission summary under `reports/omega-business-3/`.
4. **Open the UI constellation**
   ```bash
   npm run demo:omega-business-3:ui
   ```
   - `http://localhost:3001` → Enterprise Portal (chat-driven job launcher with wallet UX).
   - `http://localhost:3000` → Owner Console (pause toggles, thermostat controls, governance status).
   - `http://localhost:3002` → Validator Dashboard (validator workloads, dispute timers, receipts).

Everything you see is powered by code that already shipped with AGI Jobs v0 (v2). No forks, no experimental branches.

---

## Mainnet mission (owner governed)

When you are ready to run the Omega-grade scenario against Ethereum mainnet infrastructure, use the hardened deployment bundle:

```bash
npm run demo:omega-business-3:mainnet -- --tags omega-mission
```

The wrapper script:
- Generates one-click `.env` files with production RPC endpoints.
- Runs the official deployment checklist, wiring the StakeManager, JobRegistry, DisputeModule, ReputationEngine, CertificateNFT, and IdentityRegistry exactly as documented.
- Boots the one-click automation (`npm run deploy:oneclick:auto -- --network mainnet`) so the stack is live with owner safeguards.
- Captures a signed change-ticket in `reports/omega-business-3/mainnet-change-ticket.md` demonstrating complete owner control (pause, parameter updates, governance rotation).

All privileged actions remain owner-gated. The owner can modify every parameter via the existing `owner:*` scripts or by using the Owner Console UI.

---

## Scenario wiring

- **ENS Root:** `omega-business.eth`
- **Nation actors:** Solaris Continuum, Arctic Quantum Accord, Celestial Silk Road Coalition.
- **Validators:** Horizon Arbitration Collective, Atlas Integrity Guild.
- **Treasury:** Omega Stewardship Treasury.
- **Ledger:** `reports/omega-business-3/<scope>/simulation-ledger.ndjson`

The orchestration produces:
- Mission summary with execution timeline and SHA-256 integrity table.
- Owner quickstart, command centre atlas, parameter matrix, and control surface snapshots.
- Deterministic Hardhat test transcript proving wallet-level job creation, assignment, validator protection, and payouts.

---

## Operator experience

1. Launch the conversational portal (`npm run demo:omega-business-3:ui`).
2. Connect a wallet (Hardhat default accounts when local, or your production wallet on mainnet).
3. Use the chat assistant to publish the Solaris Continuum mission (reward `150000`, deadline `72` hours, validators `Horizon Arbitration Collective`).
4. Watch validator guilds commit, reveal, and approve deliverables automatically (driven by the baked-in simulation harness).
5. Open the Owner Console to pause/unpause modules or adjust timing windows via the documented toggles.
6. Finalize payouts either from the UI or by rerunning the deterministic test harness.

Every interaction is recorded, verifiable on-chain, and backed by the existing CI v2 controls.

---

## Artifacts & evidence

After each run, consult `reports/omega-business-3/<scope>/` for:

- `mission-summary.md` – executive-grade overview with success ✅/failure ❌ markers.
- `simulation-ledger.ndjson` – machine-readable journal of every nation job.
- `owner-quickstart.md`, `owner-command-center.md`, `owner-control-surface.md` – governance dossiers proving total owner authority.
- `parameter-matrix.json` – snapshot of all tunable parameters with current values.
- `mainnet-change-ticket.md` (mainnet mode) – signed governance record for auditors.

Pin these assets to IPFS/ENS and you have an immutable audit trail for investors, regulators, and ecosystem partners.

---

## Safety & governance

- The owner remains in full command via `owner:pause`, `owner:update-all`, `owner:rotate`, and the documented applyConfiguration flows.
- Validators and agents follow the ENS naming policy (e.g., `*.agent.agi.eth`, `*.club.agi.eth`). Emergency allowlists are still available for testing only.
- Every command executed by the orchestrator matches an existing CI pipeline step, so a green run implies the platform is production-ready.

The result is a grandiose yet practical showcase of AGI Jobs v0 (v2) as the user-friendly machine that compounds wealth for entire nations.
