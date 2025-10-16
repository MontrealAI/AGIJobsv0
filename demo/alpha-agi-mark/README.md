# α‑AGI MARK 🔮🌌✨ — Foresight DEX & Risk Oracle

The **α‑AGI MARK** demo showcases how a non‑technical operator can assemble a
prediction & risk intelligence exchange **purely** with the building blocks that
ship in **AGI Jobs v0 (v2)**. Markets are regular AGI jobs, validators provide
truthful settlement through the on‑chain validation module, and $AGIALPHA
staking guarantees skin in the game for every participant.

The demo lives entirely in `demo/alpha-agi-mark/` and is composed of three
layers:

1. **CLI orchestrator** (`cli/mark.demo.ts`) – spins up a mission run, mints
   funds, posts a foresight market, walks through staking, submissions, and
   validation, and emits reproducible receipts under `reports/<network>/agimark`.
2. **Web3 UI** (`webapp/`) – a Vite + React single page app that lets an
   operator connect a wallet, describe a foresight question, publish it to IPFS,
   and monitor validator resolution in real time. Owner controls (pause,
   thermostat tuning) are surfaced with clear guard rails.
3. **CI** (`.github/workflows/demo-alpha-agi-mark.yml`) – compiles contracts,
   executes the CLI demo on Anvil, builds the web front‑end, and uploads mission
   receipts to help auditors re‑play the run.

The entire flow uses only the contracts, ABIs, and scripts already bundled with
AGI Jobs v0 (v2). No protocol changes or contract migrations are required.

## Quickstart

> **Prerequisites**: Node 18+, pnpm or npm, and Foundry/Anvil.

```bash
npm ci
npm run demo:agimark:local
```

The script will:

1. boot an Anvil chain;
2. deploy the standard v2 defaults with `scripts/v2/deployDefaults.ts` while
   capturing the address book to
   `reports/localhost/agimark/deploy.json`;
3. mint $AGIALPHA to the demo actors (nation requester, agents, validators);
4. create a foresight market job with IPFS metadata;
5. orchestrate stake deposits, submissions, validator commits/reveals, and
   final settlement;
6. emit `mission.md` plus granular transaction receipts.

Once the CLI mission finishes, start the UI:

```bash
cd demo/alpha-agi-mark/webapp
npm ci
npm run dev
```

Point a browser at http://localhost:5173 and connect a wallet from your Anvil
accounts to publish new markets or participate in validation.

## Directory Overview

```text
config/        → JSON templates for market specs and thermostat policies
cli/           → Mission orchestration scripts (ts-node)
docs/          → Mermaid diagrams explaining architecture & lifecycle
tests/         → Local E2E harness + (optional) Foundry invariant stubs
webapp/        → Wallet-native SPA for non-technical operators
scripts/       → Thin wrappers around repo-provided deployers
```

More operational details are documented in [RUNBOOK.md](./RUNBOOK.md).
