# @agi/orchestrator

A TypeScript toolkit that implements the intent-constrained schema (ICS) planner, tool routing, and blockchain adapters for the
AGI Jobs "one-box" experience. The package is designed to be imported by UI surfaces or service workers that need to translate natural language into deterministic protocol actions.

## Scripts

- `npm run build` – compile TypeScript into `dist/`.
- `npm run clean` – remove compiled artifacts.

## Key folders

- `src/llm.ts` – meta-orchestrator plan/execution loop.
- `src/router.ts` – validates ICS payloads and dispatches to action tools.
- `src/tools/` – scaffolding adapters for jobs, staking, validation, and disputes.
- `src/chain/` – lightweight provider abstractions and contract factories.

Replace the placeholder logic in each tool as you connect to production smart contracts, relayers, and paymasters.

## Environment variables

The orchestrator reads its blockchain configuration from environment variables. When a global relayer key is not provided, the
orchestrator deterministically derives per-user wallets from the configured mnemonic so that each user session reuses the same
account and funding source.

| Variable | Required | Description |
| --- | --- | --- |
| `RPC_URL` | Optional | JSON-RPC endpoint for chain access. Defaults to `http://127.0.0.1:8545`. |
| `TX_MODE` | Optional | Set to `relayer` (default) or `aa` to choose between direct relaying or account abstraction session keys. |
| `RELAYER_PRIVATE_KEY` | Optional | Hex-encoded private key for a single relayer account. Overrides mnemonic derivation. |
| `RELAYER_MNEMONIC` | When `RELAYER_PRIVATE_KEY` is unset | BIP-39 mnemonic used to deterministically derive relayer wallets per `userId`. |
| `AA_SESSION_PRIVATE_KEY` | Optional | Hex-encoded private key for a single AA session signer. Overrides mnemonic derivation. |
| `AA_SESSION_MNEMONIC` | When `AA_SESSION_PRIVATE_KEY` is unset in `aa` mode | BIP-39 mnemonic used to deterministically derive AA session wallets per `userId`. Falls back to `RELAYER_MNEMONIC` when set. |

Ensure these secrets are provisioned in the deployment environment so user requests always resolve to a stable signer.
