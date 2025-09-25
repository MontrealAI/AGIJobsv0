# @agi/orchestrator

A TypeScript toolkit that implements the intent-constrained schema (ICS) planner, tool routing, and blockchain adapters for the AGI Jobs "one-box" experience. The package is designed to be imported by UI surfaces or service workers that need to translate natural language into deterministic protocol actions.

## Scripts

- `npm run build` – compile TypeScript into `dist/`.
- `npm run clean` – remove compiled artifacts.

## Key folders

- `src/llm.ts` – meta-orchestrator plan/execution loop.
- `src/router.ts` – validates ICS payloads and dispatches to action tools.
- `src/tools/` – scaffolding adapters for jobs, staking, validation, and disputes.
- `src/chain/` – lightweight provider abstractions and contract factories.

Replace the placeholder logic in each tool as you connect to production smart contracts, relayers, and paymasters.
