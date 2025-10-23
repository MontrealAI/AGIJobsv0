# CULTURE Demo CI Strategy

`culture-ci.yml` defines the end-to-end workflow that gates every CULTURE pull request. The reusable workflow is mirrored under `.github/workflows/culture-ci.yml` so the pipeline is enforced on GitHub pull requests while remaining documented alongside the demo code.

## Jobs

1. **`lint`** – Installs the CULTURE workspace with `pnpm` and executes ESLint and Prettier across the orchestrator, indexer, and studio packages.
2. **`solidity`** – Runs Solhint, Foundry tests (with gas snapshots and coverage), Hardhat tests + coverage, and enforces bytecode/gas budgets.
3. **`static-analysis`** – Executes Slither in Docker and runs MythX if an API key is available.
4. **`services`** – Executes the Jest/Vitest suites with coverage gating for the orchestrator, indexer, and studio packages.
5. **`e2e`** – Boots the docker-compose stack (Anvil, IPFS, Postgres, orchestrator, indexer, studio) and runs the Cypress smoke test suite headlessly.

All jobs run on Ubuntu 24.04 with Node.js 20.18.1. Coverage enforcement requires ≥90% line coverage for the contracts, orchestrator, indexer, and studio.

## Secrets

- `MYTHX_API_KEY` (optional): If present, MythX analyses run as part of the `static-analysis` job. When omitted, the job reports a skipped status with clear messaging.

## Required Branch Protection Checks

To mirror branch protection the repository should require the following workflow names:

- `CULTURE Demo CI / lint`
- `CULTURE Demo CI / solidity`
- `CULTURE Demo CI / static-analysis`
- `CULTURE Demo CI / services`
- `CULTURE Demo CI / e2e`

These match the job names surfaced by GitHub’s status API.
