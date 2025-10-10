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
`test/v2/invariant/StakeManagerAccountingInvariant.t.sol` and executed in
CI with the rest of the Foundry tests (`forge test`).

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
`test/v2/invariant/FeePoolInvariant.t.sol`, extending the Foundry
invariant job that already runs inside the v2 CI pipeline.
