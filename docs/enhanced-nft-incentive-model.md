# Enhanced NFT Incentive Model for AGIJobsv0

## 1. Legacy vs. New Incentive Models

The original on-chain manager (v0) granted a single-tier payout boost to agents or validators that owned an eligible ENS subdomain NFT. The bonus increased job costs for employers and did not apply to platform operators.

The v2 architecture introduces a list of `AGIType` entries in `StakeManager` that associates approved NFT contracts with specific payout multipliers. When a participant holds multiple NFTs, only the highest multiplier is applied, preventing reward compounding. Agents already benefit from this mechanism; the enhanced model extends the same logic to validators and platform operators so every core role can earn more when holding an approved NFT.

## 2. NFT Reward Multiplier Implementation

- **Agents** – `StakeManager.getHighestPayoutPct` multiplies an agent's base reward by the highest applicable tier. Employers escrow only the base reward; any bonus is covered by reduced burns or fees.
- **Validators** – `distributeValidatorRewards` weights each validator's share by their multiplier. A 150% NFT counts as weight `150` versus the default `100`.
- **Platform operators** – the `FeePool` exposes `boostedStake(address)` to reveal a staker's weight (`stake * multiplier / 100`). Off-chain scripts can use this to apportion fee distributions so that operators with NFTs receive a larger portion of the fee pool.

The `getHighestPayoutPct` function is a general utility that any module can call to check the top multiplier for a given address and now serves agents, validators and platform participants alike.

## 3. Game-Theoretic Robustness

Weighting rewards by NFT multipliers removes the equal‑split sybil attack among validators and aligns incentives across roles. Caps on multiplier values and selecting only the highest tier prevent unbounded gains. Employers are not penalised for hiring NFT holders because extra payouts are subsidised by reduced burns or fees, so the best agents remain attractive hires.

## 4. Simulation of Reward Outcomes

Simulations show NFT holders consistently earn more than non‑holders while total rewards remain conserved. Example: in a four‑validator pool with one 150% NFT, the boosted validator receives roughly one third of the pool instead of 25% under equal split. When multiple validators hold NFTs, shares scale with their tiers but never exceed the pool's total value. If all validators hold the same tier, the result converges back to an equal split but at a higher absolute payout for everyone.

## 5. Milestone-Based Implementation Plan

1. **Design finalisation** – approve NFT tiers, payout caps and the list of supported contracts.
2. **Solidity changes** – generalise `getHighestPayoutPct`, weight validator rewards, provide `boostedStake` for platform calculations and enforce reasonable multiplier caps.
3. **Simulation and audit** – unit tests and economic simulations confirm robustness; fix any findings.
4. **Documentation and deployment** – update guides, deploy upgrades and announce NFT reward boosts to the community.
