# Coding Sprint: $AGIALPHA Incentive Modules

This sprint adds revenue sharing and routing incentives to the v2 suite while preserving tax neutrality and pseudonymity.

## Objectives
- Implement smart‑contract revenue sharing for platform operators.
- Introduce stake‑weighted job routing and discovery modules.
- Align governance with rewards and embed sybil resistance.

## Tasks
1. **FeePool Contract**
   - Collect per‑job protocol fees from `JobRegistry`.
   - Track operator stakes from `StakeManager` and stream rewards periodically.
   - Expose `setFeePercentage` and `setBurnPercentage` for the owner.
2. **StakeManager Extensions**
   - Record operator stakes (`role = 2`).
   - Emit events for stake deposits, withdrawals, and slashing usable by `FeePool`.
3. **JobRouter**
   - Accept job submissions without specified platform and route them to eligible operators based on stake weight.
   - Allow owner to adjust routing algorithm parameters.
4. **DiscoveryModule**
   - Index platforms and expose a paginated list sorted by stake and reputation.
   - Include a stake badge for UI clients.
5. **Dispute & Governance Hooks**
   - Add token‑weighted voting using staked balances for configuration changes (e.g., fee rates).
   - Implement bonus distribution to participating voters in the next `FeePool` epoch.
   - Denominate appeal deposits in $AGIALPHA via `DisputeModule.setAppealFee` and route slashed fees to the `FeePool` or burner.
6. **Sybil Mitigations**
   - Enforce minimum stake for platform registration.
   - Add optional identity commitments or human‑check modules that can be toggled by the owner.
7. **Testing & Docs**
   - Extend Hardhat tests to cover revenue distribution, routing, governance, and slashing scenarios.
   - Update `README.md` and `docs/incentive-mechanisms-agialpha.md` once modules are complete.

## Definition of Done
- All new modules deployed immutably and wired through `JobRegistry`.
- `npm run lint` and `npm test` pass.
- Documentation explains Etherscan flows for non‑technical operators.
