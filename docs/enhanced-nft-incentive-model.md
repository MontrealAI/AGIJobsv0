# Enhanced NFT Incentive Model for AGIJobsv0

## 1. Legacy vs. New Incentive Models

The original on-chain manager (v0) granted a single-tier payout boost to agents or validators that owned an eligible ENS subdomain NFT. The bonus increased job costs for employers and did not apply to platform operators.

The v2 architecture introduces a list of `AGIType` entries in `StakeManager` that associates approved NFT contracts with specific payout multipliers. When a participant holds multiple NFTs, only the highest multiplier is applied, preventing reward compounding. Agents already benefit from this mechanism; validators and platform operators will also gain boosts under the enhanced model.

## 2. NFT Reward Multiplier Implementation

- **Agents**: continue using `StakeManager.getHighestPayoutPct` (currently `getAgentPayoutPct`) to scale their rewards.
- **Validators**: `distributeValidatorRewards` will weight payouts by each validator's multiplier rather than splitting the pool evenly.
- **Platform operators**: fee distributions will be weighted by multipliers so that operators with NFTs earn proportionally more from the `FeePool`.

The `getHighestPayoutPct` function becomes a general utility that any module can call to check the top multiplier for a given address.

## 3. Game-Theoretic Robustness

Weighting rewards by NFT multipliers removes the equal-split sybil attack among validators and aligns incentives across roles. Caps on multiplier values and selecting the highest tier prevent unbounded gains. Employers are not penalised for hiring NFT holders because extra payouts are subsidised by reduced burns or fees.

## 4. Simulation of Reward Outcomes

Simulations show NFT holders consistently earn more than non-holders while total rewards remain conserved. Example: in a four-validator pool with one 150% NFT, the boosted validator receives ~33% of the reward pool compared with 25% under equal split. When multiple validators hold NFTs, shares scale with their tiers but never exceed the pool's total value.

## 5. Milestone-Based Implementation Plan

1. **Design finalisation** – approve NFT tiers and payout caps.
2. **Solidity changes** – generalise `getHighestPayoutPct`, weight validator and platform rewards, and cap extreme multipliers.
3. **Simulation and audit** – unit tests and economic simulations confirm robustness.
4. **Documentation and deployment** – update guides, deploy upgrades and announce NFT reward boosts to the community.
