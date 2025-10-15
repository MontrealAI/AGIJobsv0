# 🔱 Trident Sovereign AGI Orchestrator Demo

The **Trident Sovereign AGI Orchestrator** is the flagship, non-technical launchpad for AGI Jobs v0 (v2). It packages the entire owner-governed labour market – contracts, owner controls, wallet automation, IPFS/ENS job flows, validator telemetry, and conversational UX – into a single, unstoppable experience.

This demo is built exclusively from production code that already ships in this repository. No experimental shortcuts, no hidden dependencies. Operators get:

- 🌍 **Nation-scale simulation** – scripted wallet identities for multiple sovereign coalitions and independent validators prove how disparate stakeholders coordinate jobs, escrow, results, and payouts in minutes.
- 🧠 **Conversational operating system** – launches the existing enterprise portal chat UX so a business leader can issue jobs, review receipts, and approve payouts without touching Solidity or command lines.
- 🛡️ **Owner total control** – regenerates the complete owner control atlas, surface map, and parameter matrix so the contract owner can pause, update, rotate signers, and retune thermodynamic levers instantly.
- 🚀 **Mainnet-ready deployment** – wraps the hardened one-click deploy pipeline into a single script for Ethereum mainnet, complete with mission checklists, manifests, and audit trails.
- 📊 **Immutable evidence bundles** – stores every orchestration phase, CLI transcript, and simulation verdict under `reports/trident-sovereign/` with deterministic digests ready for CI enforcement.

If you can run a shell script and open a browser, you can run a planetary AGI labour market.

---

## Quick Start (zero coding)

1. **Install prerequisites**
   - Node.js v20.18.1 (ships with the repo toolchain).
   - Docker Desktop / Engine if you plan to reuse the one-click local stack.
   - An Ethereum wallet (MetaMask, Rabby, Ledger) for mainnet deployments.
2. **Clone the repository**
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   ```
3. **Launch the full orchestration**
   ```bash
   npm run demo:trident-sovereign
   ```
   The script:
   - Validates repository cleanliness and configuration.
   - Regenerates owner control dossiers, command centres, and atlas diagrams.
   - Executes the deterministic multi-nation wallet simulation test suite.
   - Produces a signed mission summary in `reports/trident-sovereign/mission-summary.md` with ✅/⚠️ status for every phase.
4. **Open the UI constellation** (in three browser tabs):
   - **Enterprise Portal (chat-driven job launcher):** `npm run demo:trident-sovereign:ui`
   - **Owner Console:** `npm --prefix apps/console run dev`
   - **Validator Dashboard:** `npm --prefix apps/orchestrator run dev`

Everything runs against the same deterministic configuration the automation scripts use, so the UI reflects the exact same state as the command-line orchestration.

---

## Directory layout

```
demo/TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/
├─ README.md                         → This mission dossier.
├─ orchestrator.ts                   → TypeScript command centre driving the full showcase.
├─ config/
│  └─ trident.simulation.json        → Scenario data for nations, wallets, ENS names, and IPFS URIs.
├─ bin/
│  ├─ trident-sovereign.sh           → Friendly entrypoint for the orchestrator.
│  ├─ trident-mainnet.sh             → Push-button mainnet deployment wrapper.
│  └─ trident-ui.sh                  → Boots the conversational enterprise portal with demo wiring.
└─ ui/
   └─ operator-playbook.md           → Step-by-step UI guide for non-technical operators.
```

---

## Features & phases

| Phase | What happens | Scripted command |
| --- | --- | --- |
| Owner control regeneration | Refreshes the quickstart, command centre, parameter matrix, and governance atlas from `deployment-config/` | `npm run owner:quickstart`, `npm run owner:command-center`, `npm run owner:parameters`, `npm run owner:surface` |
| Multi-nation wallet drill | Deploys the `SimpleJobRegistry` harness, mints ERC20 liquidity, and simulates two sovereign coalitions plus independent validators shepherding jobs end-to-end | `npx hardhat test test/demo/tridentSovereignSimulation.test.ts` |
| Evidence packaging | Timestamped Markdown, JSON, and NDJSON transcripts land in `reports/trident-sovereign/` for compliance | Orchestrator handles automatically |
| Conversational UX | Launches the production enterprise portal chatbox and validator console used in live systems | `npm run demo:trident-sovereign:ui` (portal), `npm --prefix apps/console run dev` (owner), `npm --prefix apps/orchestrator run dev` (validator) |
| Mainnet autopilot | Creates `.env` files, validates chains, and executes deterministic deployment bundles | `demo/TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/bin/trident-mainnet.sh` |

All data flows honour IPFS CIDs, ENS naming, staking rules, and ownership semantics that already exist in AGI Jobs v0 (v2).

---

## Running the orchestrator manually

```bash
# Full run (defaults to sepolia wiring)
npm run demo:trident-sovereign

# Use Hardhat localnet instead
env TRIDENT_NETWORK=hardhat npm run demo:trident-sovereign

# Store reports in a custom namespace
env TRIDENT_REPORT_SCOPE=executive-demo npm run demo:trident-sovereign
```

Outputs land under `reports/trident-sovereign/<scope>/` with ISO-8601 timestamps and SHA-256 digests.

---

## Conversational UI experience

`bin/trident-ui.sh` starts the enterprise portal with the Trident scenario prewired:

```bash
npm run demo:trident-sovereign:ui
```

1. Connect your wallet when prompted (or switch MetaMask to the injected local Hardhat account for the deterministic drill).
2. The **Conversational Job Creator** walks you through title, description, reward, SLA, and attachments while showing live ENS resolution.
3. The **Job Receipts** panel streams submissions from the orchestrated wallets so you can verify payouts, hashes, and IPFS results in real time.
4. Use the **Owner Console** and **Validator Dashboard** tabs to pause, resume, validate, or escalate jobs mid-flight.

This is the same UI we ship to production customers – the demo just populates it with curated data so executives can experiment safely.

---

## Mainnet deployment

The mainnet script wraps the one-click deploy stack (`npm run deploy:oneclick:auto`), ensures manifests are regenerated, and refuses to continue if branch protection or signer locks are misconfigured.

```bash
demo/TRIDENT-SOVEREIGN-AGI-ORCHESTRATOR/bin/trident-mainnet.sh
```

It automatically:

1. Runs the preflight wizard (`npm run deploy:env`) to build deterministic `.env` files.
2. Executes the audited deployment sequence with owner-led governance forwarding.
3. Generates the change-ticket package (`npm run owner:change-ticket`) for compliance.

Bring a hardware wallet, confirm each transaction, and your AGI Jobs operating system is live on Ethereum mainnet.

---

## Reports & evidence

The orchestrator emits:

- `mission-summary.md` → executive narrative with phase durations, wallet addresses, ENS names, and contract IDs.
- `owner-command-center.md` → Owner Control Atlas with every module, pauser, and governance lever.
- `parameter-matrix.json` → Machine-readable ledger of adjustable protocol knobs.
- `simulation-ledger.ndjson` → Line-delimited JSON capturing every simulated job, actor, and payout.

All files include SHA-256 digests logged to stdout so you can notarize or pin to IPFS immediately.

---

## CI enforcement

For CI gating, add the following required checks to GitHub branch protection:

- `lint`
- `test`
- `coverage`
- `owner-control` (generated via `npm run owner:surface`)
- `trident-sovereign` (this orchestrator – add `npm run demo:trident-sovereign` to the CI workflow)

The `scripts/ci` suite already ships with helpers (`npm run ci:verify-branch-protection`, `npm run ci:verify-toolchain`, `npm run ci:verify-signers`). The orchestrator keeps them green by exercising the same paths locally.

---

## Need help?

- **Emergency pause or reconfiguration:** `npm run owner:command-center -- --help`
- **Deployment checklist:** `npm run deploy:checklist`
- **Support:** `docs/owner-control-non-technical-guide.md` and the in-app help centre under the enterprise portal.

Welcome to the Trident Sovereign AGI Orchestrator. Your operating system for multi-nation AGI work is officially production-ready.
