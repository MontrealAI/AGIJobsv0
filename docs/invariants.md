# Protocol Invariants

This document captures the core safety properties that the mainnet
contracts MUST uphold at all times.  The invariant suite created for the
Sprint is intentionally small and focused on the highest-risk surfaces;
further invariants will be appended as coverage grows.

## StakeManager

* **Total stake accounting** – the aggregate stake tracked per role must
  equal the sum of per-account balances. Violations point to corruption
  in `_deposit`/`_withdraw` flows or boosts that double-count balances.
* **Solvency** – the contract balance of $AGI must always cover the sum
  of liabilities (total stake across roles plus the operator reward
  pool). Any failure indicates that tokens were transferred without the
  appropriate accounting update.

Each invariant is enforced by the Forge suite in
`test/v2/invariant/StakeManagerAccountingInvariant.t.sol` and now executes in
two CI entry points:

- The `ci (v2)` workflow's Foundry job runs the full `forge test` matrix with
  the invariant profile configured for 256 runs and depth 128.
- The contract-focused workflow (`contracts-ci`) invokes a dedicated
  `Foundry invariants` step so path-filtered pull requests cannot bypass the
  property tests.

## FeePool

* **Pending fees must be asset-backed** – `pendingFees` may never exceed
  the ERC20 balance held by the pool. This guarantees that queued
  distributions are always redeemable without depending on external
  treasury replenishment.
* **Cumulative reward growth is monotonic** –
  `cumulativePerToken` increases only when fees are distributed and can
  never decrease. This prevents retroactive reward clawbacks or
  accounting rollbacks that would undermine validator/agent payouts.
* **Treasury reward ledger is conservative** – the tracked
  `treasuryRewards` total must always be less than or equal to the actual
  ERC20 balance at the configured treasury address. The invariant guards
  against scenarios where bookkeeping overstates what the treasury has
  received.

These properties are enforced in
`test/v2/invariant/FeePoolInvariant.t.sol`. They run under the same CI
conditions described above, and the nightly `fuzz` workflow increases the
`FOUNDRY_INVARIANT_RUNS` budget to 1,024 to hunt for deeper edge cases.

## CI enforcement summary

| Workflow | Step | Runs | Notes |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `Foundry` | 256 | Executes the complete Foundry suite (fuzz + invariants) after Hardhat tests. |
| `.github/workflows/contracts.yml` | `Foundry invariants` | 256 | Guarantees property tests run on contract-only pull requests. |
| `.github/workflows/fuzz.yml` | `Foundry invariants (deep)` | 1,024 | Nightly/PR job with 1,024 runs to expose long horizon failures. |
