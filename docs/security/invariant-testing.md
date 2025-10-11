# Invariant Testing Runbook

## Overview

Invariant testing protects critical protocol assumptions beyond conventional unit or fuzz tests. The AGI Jobs v2 contracts ship with dedicated Foundry invariant suites covering FeePool, JobEscrow, and StakeManager accounting flows. Each suite validates safety properties that align with institutional controls, such as escrow solvency, monotonic rewards accounting, and the conservation of stake balances.

## Local Execution

1. Ensure Node.js dependencies are installed and contract constants regenerated:
   ```bash
   npm ci
   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/generate-constants.ts
   ```
2. Install Foundry (version pinned in `foundry.toml`) and run the invariants with the same configuration enforced in CI:
   ```bash
   forge test -vvvv --ffi --match-path 'test/v2/invariant/*.t.sol' --fuzz-runs 256
   ```

   * Set `FOUNDRY_INVARIANT_RUNS` to increase coverage during longer soak runs. The CI workflow currently requires `256` runs per invariant suite.

3. Optional: extend the campaign for deeper assurance by increasing `FOUNDRY_INVARIANT_RUNS` (e.g., `2048`) or by providing `--fuzz-max-iterations` when running targeted investigations.

## CI Enforcement

The `contracts-ci` workflow (`.github/workflows/contracts.yml`) now blocks merges unless the invariant suites succeed. This guarantees that every pull request is checked against the FeePool, JobEscrow, and StakeManager invariants alongside the existing fuzz, unit, and integration tests.

## Troubleshooting

- **Compilation Warnings:** Solidity warnings (e.g., view/pure suggestions) are surfaced during invariant runs. Address them promptly to prevent accidental logic changes from being masked.
- **State Explosion:** If invariants begin to time out, lower `--fuzz-runs` locally to reproduce the failure, then tighten the handler logic or narrow the state space before re-enabling the higher run count.
- **New Modules:** When adding protocol components, extend the handlers in `test/v2/invariant/` or create new suites to encode the conservation laws relevant to the feature. Update this runbook accordingly so operators and reviewers understand the new coverage.

Maintaining these invariants and their CI enforcement satisfies the "Institutional Deployment Readiness" punch-list item for property-based testing rigor and keeps the on-chain system aligned with documented safety guarantees.
