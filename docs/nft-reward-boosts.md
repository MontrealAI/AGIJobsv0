# NFT Reward Boosts

AGI Jobs v2 applies payout multipliers to agents, validators and platform operators based on approved NFT holdings. The `StakeManager` maintains a list of AGI types – NFT contracts paired with a `payoutPct` percentage – and exposes `getHighestPayoutPct(address)` so all modules can determine a participant's bonus.

## Agents

When releasing job rewards, `StakeManager` multiplies the base amount by the agent's highest NFT multiplier. Fees and burns are applied to the boosted amount while ensuring employers never pay more than escrowed: any deficit is covered by reducing burn then fee components. An agent with a 150% NFT receiving 100 tokens collects 150 tokens while the employer's cost remains 100 plus fees.

## Validators

`distributeValidatorRewards` weights each selected validator's share by their NFT multiplier. If one validator holds a 150% NFT and two others hold none, validator weights become `[150,100,100]`, granting the boosted validator 37.5% of the pool and the others 31.25% each. Any rounding remainder is assigned to the highest‑weight validator.

## Platform Operators

`FeePool.claimRewards` queries the staker's multiplier and scales their stake accordingly, so platform operators with NFTs accrue a larger portion of protocol fees. For example, with equal stakes and one operator holding a 200% NFT, that operator receives twice the rewards of a non‑NFT peer.

## Querying Boosted Stake

For off‑chain reporting and future integrations, `StakeManager.boostedStakeOf(user, role)` returns a user's stake already adjusted by their NFT multiplier, and `totalBoostedStake(role)` exposes the network total.

Governance may register new NFT tiers via `StakeManager.addAGIType(nft, pct)`. Percentages above 100 increase payouts, while values below 100 can provide discounts. Multipliers are capped by `MAX_PAYOUT_PCT` (200%).

