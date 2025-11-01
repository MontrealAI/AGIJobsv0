# AGI Jobs v0 (v2) — Validator UI

[![Webapp](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/webapp.yml)
[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

The validator UI is a minimal Next.js interface for validators to review pending jobs, commit/reveal their decision, and verify ENS
subdomains. It is optimised for fast onboarding and shares its configuration with the agent gateway and orchestrator manifests.

## Highlights

- **Pending jobs feed** – Fetches jobs from the agent gateway, verifies token decimals against `config/agialpha.json`, and formats
  rewards/stakes using ethers.js to avoid precision loss.【F:apps/validator-ui/pages/index.tsx†L1-L60】
- **Commit/reveal automation** – Uses `generateCommit` and `scheduleReveal` to derive deterministic commitments and automatically
  reveal after the configured delay, calling the validation module through the user’s wallet.【F:apps/validator-ui/pages/index.tsx†L60-L120】
- **ENS guardrails** – `verifyEnsSubdomain` warns validators when their ENS proof is missing or invalid before they submit a vote.【F:apps/validator-ui/lib/ens.ts†L1-L120】
- **Error surfacing** – Shared `useError` hook renders toasts for wallet or RPC issues so non-technical validators know how to
  recover.【F:apps/validator-ui/lib/error.tsx†L1-L120】

## Running locally

```bash
cd apps/validator-ui
npm install
npm run dev
```

Set these environment variables to point at your stack:

```bash
export NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
export NEXT_PUBLIC_GATEWAY_URL=http://localhost:3000
export NEXT_PUBLIC_VALIDATION_MODULE_ADDRESS=0x...
export NEXT_PUBLIC_REVEAL_DELAY_MS=7500
```

## Testing & CI

- `npm test` runs Vitest via `vitest.config.ts`.
- The shared `webapp` workflow builds and type-checks the UI on every PR, while `ci (v2)` enforces linting and coverage to keep the
  console production ready.【F:.github/workflows/webapp.yml†L1-L196】【F:.github/workflows/ci.yml†L44-L70】

## Extending the UI

1. Add new validator tools or dashboards under `pages/`.
2. Update `lib/commit.js` if additional commit schemes are introduced.
3. Keep environment variable names synchronised with `config/` so owner tooling and this UI stay aligned.

Validators rely on this UI when orchestrating missions under pressure—keep it lean, deterministic, and tied to the same manifests
that CI v2 validates.
