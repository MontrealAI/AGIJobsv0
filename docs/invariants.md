# Protocol Invariants

This document captures the core safety properties that the mainnet
contracts MUST uphold at all times.  The invariant suite created for the
Sprint is intentionally small and focused on the highest-risk surfaces;
further invariants will be appended as coverage grows.

## StakeManager

* **Total stake accounting** – the aggregate stake tracked per role must
  equal the sum of per-account balances.  Violations point to corruption
  in `_deposit`/`_withdraw` flows or boosts that double-count balances.
* **Solvency** – the contract balance of $AGI must always cover the sum
  of liabilities (total stake across roles plus the operator reward
  pool).  Any failure indicates that tokens were transferred without the
  appropriate accounting update.

Each invariant is enforced by the Forge suite in
`test/v2/invariant/StakeManagerAccountingInvariant.t.sol` and executed in
CI with the rest of the Foundry tests (`forge test`).
