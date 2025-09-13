# Slither Static Analysis Report

Date: 2025-09-??

## Target

`contracts/v2/RewardEngineMB.sol`

## Findings

- **Divide before multiply:** `_distribute` multiplies after division which may result in precision loss.
- **Reentrancy warnings:** `_aggregate` and `settleEpoch` call external contracts before updating state.
- **Uninitialized local variables:** several local variables such as `totalValue`, `sumUpre`, `sumUpost`, and `distributed` rely on default zero initialization.
- **Missing zero address validation:** `setTreasury` does not enforce a non-zero `_treasury` address.
- **Calls inside loops:** loops in `_aggregate` and `_distribute` make external calls (`energyOracle.verify`, `feePool.reward`, `reputation.update`).
- **State variables not immutable:** `thermostat`, `feePool`, `reputation`, and `energyOracle` could be marked `immutable`.

## Notes

`slither` was executed with `--solc-remaps @openzeppelin=node_modules/@openzeppelin/` and `--filter-paths "node_modules"`.
