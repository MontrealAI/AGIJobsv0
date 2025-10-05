# V2 CI Green Path

This guide explains how to keep every AGI Jobs v2 GitHub Action green and how to reproduce the pipeline locally without tribal knowledge. It is written for both engineers and non-technical release managers who need deterministic sign-off before deploying.

## Required status checks

| Status check | Workflow file | Purpose | Local command(s) |
| --- | --- | --- | --- |
| `contracts / compile-and-test` | [`.github/workflows/contracts.yml`](../../.github/workflows/contracts.yml) | Builds contracts, validates configuration constants, runs the Hardhat + Foundry suites. | `npm run ci:v2` (runs all checks) or `npm ci && npm test` |
| `orchestrator / tsc` | [`.github/workflows/orchestrator-ci.yml`](../../.github/workflows/orchestrator-ci.yml) | Type-checks the orchestrator control-plane. | `npm ci && npx tsc -p apps/orchestrator/tsconfig.json` |
| `e2e / orchestrator-e2e` | [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml) | Boots a local fork, runs orchestrator driven job lifecycles, archives logs. | `npm run e2e:local` (requires Anvil; `npm run test:fork` optional if `MAINNET_RPC_URL` is set) |
| `webapp / webapp-ci` | [`.github/workflows/webapp.yml`](../../.github/workflows/webapp.yml) | Type-checks, lints, builds and Cypress-tests both UIs. | `npm run webapp:typecheck && npm run webapp:lint && npm run webapp:build && npm --prefix apps/enterprise-portal run build && npm run webapp:e2e` |
| `fuzz / fuzz` | [`.github/workflows/fuzz.yml`](../../.github/workflows/fuzz.yml) | Executes Foundry fuzzers against safety-critical harnesses. | `forge test --ffi --fuzz-runs 256 --match-contract 'CommitReveal|Stake|Fee|Slashing'` |
| `security / security` | [`.github/workflows/security.yml`](../../.github/workflows/security.yml) | Secret scanning, dependency audit, Slither, Mythril, SBOM + provenance generation. | `npm run security:audit` plus `slither --config slither.config.json` (see workflow for flags) |
| `containers / build` | [`.github/workflows/containers.yml`](../../.github/workflows/containers.yml) | Builds, scans and publishes all runtime containers. | `docker build` for each target (optional locally) |
| `release / prepare` | [`.github/workflows/release.yml`](../../.github/workflows/release.yml) | Packages NPM modules, containers and signed artefacts for tagged releases. | `npm run release -- --dry-run` (tagged releases only) |

> **Branch protection:** Require each of the status checks above in GitHub settings. The workflow names now match the policy in [`docs/BRANCH_PROTECTION.md`](../BRANCH_PROTECTION.md), so a green dashboard here equals mergeability.

## Fast path for non-technical operators

Run the curated helper once from the repository root:

```bash
npm run ci:v2
```

The script (`scripts/ci/run-v2-ci.sh`) performs the following, mirroring the Actions pipeline order:

1. Installs dependencies with `npm ci`.
2. Runs Solhint and ESLint via `npm run lint:check`.
3. Executes the Node + Hardhat suites (`npm test`).
4. Runs forked integration tests if `MAINNET_RPC_URL` is exported.
5. Executes the local orchestrator gateway integration (`npm run e2e:local`).
6. Validates the owner console and enterprise portal (type-check, lint, build).
7. Launches Cypress end-to-end tests for the web interfaces.

The script prints a coloured header before each step and aborts immediately on the first failure, matching CI behaviour. Successful completion leaves every workflow reproducible locally.

## Environment checklist

- **Node.js**: Use Node 20.x (`nvm use`) before running any command.
- **Foundry/Anvil**: Install Foundry if you plan to run fuzzing or the optional fork tests.
- **MAINNET_RPC_URL** *(optional)*: Enables the fork drill in both the CI workflow and the local helper script. Without it the tests are skipped and the remaining checks still pass.
- **Docker** *(optional)*: Required to mirror the `containers` workflow locally.

## Observability

The workflows now cache npm dependencies and Cypress binaries (`~/.cache/Cypress`) to keep reruns fast. GitHub Action artefacts (`e2e-logs`, `owner-console-dist`, container digests, SBOMs) capture everything a release manager needs to audit a run. When debugging locally, re-run the same command shown in the table above to reproduce the failing job.

## Escalation playbook

If any status check fails:

1. Re-run the matching command locally (see table).
2. Inspect the artefacts attached to the failing workflow (`Actions` → run → `Artifacts`).
3. File or update an incident in the owner control command centre (see [`docs/owner-control-command-center.md`](../owner-control-command-center.md)).
4. Keep `main` frozen until the failing workflow and `npm run ci:v2` both succeed.

Keeping this checklist evergreen ensures AGI Jobs v2 stays deployable by on-call staff without requiring core developers on every change.
