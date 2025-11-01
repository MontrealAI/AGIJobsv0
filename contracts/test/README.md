# AGI Jobs v0 (v2) — Solidity Test Harness

[![CI (v2)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)
[![Fuzz](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml/badge.svg?branch=main)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/fuzz.yml)

The `contracts/test/` toolkit contains deterministic mocks, harnesses, and Echidna fixtures that power the Hardhat, Foundry, and
Echidna suites. These contracts isolate each subsystem—staking, dispute resolution, validation failovers—so regressions surface
before they reach production deployments.

## Layout

| File | Purpose |
| ---- | ------- |
| `CommitRevealEchidna.sol` | Property-based harness that validates the commit/reveal lifecycle and feeds the nightly Echidna run. |
| `ConfigurableModuleMock.sol` | Flexible proxy that lets tests simulate modules accepting arbitrary configuration calls. |
| `DeterministicValidationModule.sol` | Lightweight validation module used to assert validator quorum paths under fuzz. |
| `EmployerContract.sol` | Simulated employer contract exercising the registry APIs. |
| `GovernanceRewardMock.sol` | Stub for governance reward distribution to validate HGM reward accounting. |
| `StakeManagerHarness.sol` | Exposes internal stake manager calculations for invariant tests. |

All helpers are pure Solidity with no external dependencies so they compile alongside production contracts.

## Running the suites

```bash
npm test                          # Hardhat unit + integration tests (uses contracts/test mocks)
forge test -vvvv --ffi            # Foundry fuzz suite (ci (v2) / Foundry job)
forge test -vvvv --ffi --match-path 'test/v2/invariant/**' --fuzz-runs 512  # Invariant harness
npm run test:fork                 # Optional fork-mode regression suite
```

CI v2 executes the Hardhat suite in the `Tests` job, the Foundry fuzz suite in `ci (v2) / Foundry`, and the dedicated invariant
run in `ci (v2) / Invariant tests`, keeping every helper in this directory covered on each commit.【F:.github/workflows/ci.yml†L62-L152】【F:.github/workflows/ci.yml†L452-L641】【F:.github/workflows/ci.yml†L1208-L1339】

## Extending the harness

1. Add your mock or harness contract under `contracts/test/` with a descriptive filename.
2. Wire it into the Hardhat or Foundry test that exercises the new behaviour (`test/v2/**`).
3. Export any helper types through `contracts/test/utils` if they will be reused across multiple specs.
4. Update `npm run coverage` snapshots when the new harness changes branch counts.

The harness is intentionally modular so non-technical owners can rely on the CI signal without needing to understand the Solidity
internals—every new scenario must integrate here to inherit the automated guarantees.
