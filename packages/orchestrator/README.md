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
| `TX_MODE` | Optional | Set to `relayer` (EIP-2771 meta-transactions, default), `aa` (ERC-4337 account abstraction), or `direct` (send raw transactions with derived wallets). |
| `RELAYER_PRIVATE_KEY` | Optional | Hex-encoded private key for a single relayer account. Superseded by `RELAYER_SPONSOR_PRIVATE_KEY` when provided. |
| `RELAYER_MNEMONIC` | When explicit keys are unset | BIP-39 mnemonic used to deterministically derive wallets when user-specific/sponsor mnemonics are not provided. |
| `RELAYER_USER_PRIVATE_KEY` | Optional | Private key used for per-user EIP-2771 signatures. Overrides the user mnemonic. |
| `RELAYER_USER_MNEMONIC` | When `RELAYER_USER_PRIVATE_KEY` is unset | Mnemonic used to derive user-specific meta-transaction signers by `userId`. |
| `RELAYER_SPONSOR_PRIVATE_KEY` | Optional | Private key for the gas-sponsoring relayer that submits EIP-2771 transactions. |
| `RELAYER_SPONSOR_MNEMONIC` | When `RELAYER_SPONSOR_PRIVATE_KEY` is unset | Mnemonic used to derive the sponsoring relayer account. |
| `EIP2771_TRUSTED_FORWARDER` | Required in `relayer` mode | Address of the trusted forwarder contract (e.g., OpenZeppelin MinimalForwarder). |
| `AA_SESSION_PRIVATE_KEY` | Optional | Hex-encoded private key for a single AA session signer. Overrides mnemonic derivation. |
| `AA_SESSION_MNEMONIC` | When `AA_SESSION_PRIVATE_KEY` is unset in `aa` mode | BIP-39 mnemonic used to deterministically derive AA session wallets per `userId`. Falls back to `RELAYER_MNEMONIC` when set. |
| `AA_BUNDLER_RPC_URL` | Required in `aa` mode | Bundler JSON-RPC endpoint that accepts `eth_sendUserOperation`. |
| `AA_ENTRY_POINT` | Required in `aa` mode | Address of the ERC-4337 EntryPoint contract. |
| `AA_ACCOUNT_FACTORY` | Optional | Address of the smart account factory used to compute/create user smart accounts. |
| `AA_ACCOUNT_SALT` | Optional | Salt used with the factory when deriving account addresses (defaults to `0`). |
| `AA_PAYMASTER_URL` | Optional | Managed paymaster RPC endpoint supporting `pm_sponsorUserOperation`. |
| `AA_PAYMASTER_API_KEY` | Optional | API key passed as `Authorization: Bearer` when calling the managed paymaster. |
| `AA_PAYMASTER_HEADERS` | Optional | JSON object of additional headers for the paymaster requests. |
| `AA_PAYMASTER_CONTEXT` | Optional | JSON object injected into the paymaster sponsorship context. |
| `AA_BUNDLER_HEADERS` | Optional | JSON object of additional headers to send with bundler requests. |
| `POLICY_DAILY_GAS_CAP` | Optional | Maximum gas units a single `userId` may consume per UTC day. |
| `POLICY_MAX_JOB_BUDGET_AGIA` | Optional | Maximum on-chain job budget (AGIA) enforced during job creation. |
| `POLICY_RATE_LIMIT_WINDOW_MS` / `POLICY_RATE_LIMIT_MAX_REQUESTS` | Optional | Sliding-window request throttling (window size in milliseconds and allowed request count). |

Policy variables are evaluated in-memory to guard against runaway spending: user gas usage is summed per UTC day, jobs reserve a
budget when they are created, and repeated API calls are throttled via a sliding window. Configure the limits above to align wi
th your paymaster allowances and per-job burn caps.

Ensure these secrets are provisioned in the deployment environment so user requests always resolve to a stable signer.

### Per-request overrides

The orchestrator defaults to the transport specified by `TX_MODE`, but callers can override the signer on a per-request basis by
including a `meta.txMode` field in the ICS payload. Supported values are `aa`, `relayer`/`2771`, and `direct`, which map to the
ERC-4337 paymaster path, the EIP-2771 relayer, and raw key-based signing respectively.
