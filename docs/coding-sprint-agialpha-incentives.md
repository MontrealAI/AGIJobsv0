# Coding Sprint: $AGIALPHA Incentive Modules

This sprint finalises revenue sharing, routing and governance incentives for the
v2 suite while keeping all flows tax‑neutral, reporting‑free and pseudonymous.

## Objectives

- Implement smart‑contract revenue sharing for platform operators with no
  off‑chain accounting.
- Route and discover jobs using stake‑weighted, reputation‑aware algorithms.
- Align governance with rewards and ensure all parameters remain owner‑configurable.
- Embed sybil resistance and regulatory‑flag mitigation through staking gates,
  blacklists and burn sinks.
- Keep all value flows on‑chain in $AGIALPHA (18 decimals). The token is fixed
  across modules; rotation is treated as a legacy capability.

## Tasks

1. **FeePool Contract**
   - Collect protocol fees from `JobRegistry` on each finalised job.
   - Track operator stakes from `StakeManager` and stream rewards in proportion
     to stake.
   - Enforce burn percentage for an entropy sink; owner toggles via `setBurnPct`.
2. **StakeManager Extensions**
   - Record platform operator stakes (`role = 2`) and expose `setMinStake`,
     `setMaxStakePerAddress` and `lockStake` hooks.
   - Emit events for deposits, withdrawals, slashing and lock/unlock for
     auditability.
3. **PlatformRegistry & JobRouter**
   - Register platform operators that maintain the minimum stake.
   - Compute routing scores from stake and reputation and expose view functions
     for front‑ends.
   - JobRouter assigns unspecific jobs to the highest‑scoring registered
     operator; owner adjusts weighting factors.
4. **ReputationEngine**
   - Support stake/reputation weighting, blacklisting and threshold‑based sybil
     flagging.
   - Expose `setScoringWeights`, `blacklist` and `isBlacklisted` helpers for
     `PlatformRegistry` and external auditors.
5. **DiscoveryModule**
   - Provide paginated operator listings sorted by
     `PlatformRegistry.getScore`.
   - Include stake badge metadata for UI clients and optional blacklist
     filtering.
6. **GovernanceReward & Parameter Polls**
   - Record voters for each governance epoch and distribute owner‑funded
     rewards.
   - Integrate with parameter change votes so participants get bonuses after
     `finalizeEpoch`.
7. **Dispute & Burn Hooks**
   - Dispute deposits denominated in $AGIALPHA via `DisputeModule.setDisputeFee`;
     slashed fees forwarded to `FeePool` or burned.
   - Owner chooses burn rate to counter sybil farms and avoid accumulating
     taxable treasuries.
8. **Sybil/Regulatory Defenses**
   - Enforce minimum stake for platform registration; expose `setMinPlatformStake`.
   - Optional identity commitment module (stub) plug‑in for `PlatformRegistry`.
   - Document tax‑policy acknowledgement flows; wire `TaxPolicy` and
     `JobRegistry.acknowledgeTaxPolicy`.
   - Surface `isTaxExempt()` on every module and reject direct ETH so owners and contracts remain revenue‑free and off‑ledger.
9. **Testing & Documentation**
   - Extend Hardhat tests for revenue distribution, routing priority,
     governance rewards, slashing and blacklist enforcement.
   - Update `README.md`, `docs/incentive-mechanisms-agialpha.md` and
     `docs/deployment-v2-agialpha.md` to cover Etherscan flows, owner‑only setters
     and base‑unit conversions.
   - Add a concise Etherscan deployment quickstart to the README so non‑technical
     operators can launch the suite with $AGIALPHA and later retune parameters
     without redeploying contracts.

## Definition of Done

- All modules deployed immutably and wired through `JobRegistry`.
- `npm run lint` and `npm test` pass.
- Documentation explains pseudonymity, tax disclaimers and Etherscan interaction
  for non‑technical operators.
