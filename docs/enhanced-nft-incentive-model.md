# Enhanced NFT Incentive Model for AGIJobsv0

## 1. Legacy vs. New Incentive Models

The original on-chain manager (v0) granted a single-tier payout boost to agents or validators that owned an eligible ENS subdomain NFT. The bonus increased job costs for employers and did not apply to platform operators.

The v2 architecture introduces a list of `AGIType` entries in `StakeManager` that associates approved NFT contracts with specific payout multipliers. **Only the highest multiplier applies**: the contract tracks the maximum `payoutPct` across all NFTs the user holds, starting from the baseline `100`. With NFTs at `150%` and `125%` the effective multiplier remains `150%`. Agents already benefit from this mechanism; the enhanced model extends the same logic to validators and platform operators so every core role can earn more when holding an approved NFT.

## 2. NFT Reward Multiplier Implementation

- **Agents** – `StakeManager.getTotalPayoutPct` applies the highest applicable multiplier to an agent's base reward. Employers escrow only the base reward; any bonus is covered by reduced burns or fees. If neither fee nor burn is available to absorb the difference, the call reverts with `InsufficientEscrow`.
- **Validators** – `distributeValidatorRewards` weights each validator's share by their multiplier. A 150% NFT counts as weight `150` versus the default `100`.
- **Platform operators** – the `FeePool` exposes `boostedStake(address)` to reveal a staker's weight (`stake * multiplier / 100`). Off-chain scripts can use this to apportion fee distributions so that operators with NFTs receive a larger portion of the fee pool. Participants should call `StakeManager.syncBoostedStake` after acquiring or losing an NFT to refresh their weight; `FeePool` invokes this helper automatically for callers when distributing or claiming rewards.

### Example Payouts

- **Single NFT:** Base reward `10` with a `150%` boost pays `15` tokens. The extra `5` tokens are drawn from the reward pool funded by protocol fees and reduced burns.
- **Multiple NFTs:** Base reward `10`, holder owns `150%` and `125%` NFTs → multiplier `150%` → payout `15` tokens. The additional `5` tokens come from the same fee/burn pool. If fee and burn shares together cannot fund the bonus, the transaction reverts.

### Snapshot Rules and Claims

- Reward percentages are snapshot at the moment `releaseReward` or `syncBoostedStake` runs. Acquiring or selling an NFT requires `StakeManager.syncBoostedStake(user, role)` before claiming from the `FeePool` to update the snapshot.
- `FeePool.claimRewards` automatically syncs and pays out based on the current multiplier, even when the total exceeds `100%`. Agents and validators receive boosted amounts during `releaseReward` with no extra steps.

The `getTotalPayoutPct` function is a general utility that any module can call to check the applicable multiplier for a given address and now serves agents, validators and platform participants alike.

## 3. Game-Theoretic Robustness

Weighting rewards by NFT multipliers removes the equal‑split sybil attack among validators and aligns incentives across roles. Each tier is capped at 200%, and a configurable global cap (`maxTotalPayoutPct`, default `200`) prevents payouts from exceeding system limits even if multiple NFTs are held. Employers are not penalised for hiring NFT holders because extra payouts are subsidised by reduced burns or fees, so the best agents remain attractive hires.

## 4. Simulation of Reward Outcomes

Simulations show NFT holders consistently earn more than non‑holders while total rewards remain conserved. Example: in a four‑validator pool with one 150% NFT, the boosted validator receives roughly one third of the pool instead of 25% under equal split. When multiple validators hold NFTs, shares scale with their tiers but never exceed the pool's total value. If all validators hold the same tier, the result converges back to an equal split but at a higher absolute payout for everyone.

## 5. Milestone-Based Implementation Plan

1. **Design finalisation** – approve NFT tiers, payout caps and the list of supported contracts.
2. **Solidity changes** – generalise `getTotalPayoutPct`, weight validator rewards, provide `boostedStake` for platform calculations and enforce per-tier and global payout caps.
3. **Simulation and audit** – unit tests and economic simulations confirm robustness; fix any findings.
4. **Documentation and deployment** – update guides, deploy upgrades and announce NFT reward boosts to the community.
