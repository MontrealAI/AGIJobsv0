# Incentive Mechanisms for Decentralized AGI Jobs v2 Platforms

This note details how $AGIALPHA (18 decimals) powers a tax‑neutral, reporting‑free rollout of AGI Jobs marketplaces. All mechanisms are implemented on‑chain so operators interact only through pseudonymous addresses.

## 1. Revenue Sharing via Staking

- Platform operators stake $AGIALPHA in `StakeManager`.
- A `FeePool` contract receives a protocol fee from each finalized job and periodically streams rewards to operators proportional to stake weight.
- Rewards are paid directly on‑chain; no custody of user funds or off‑chain accounting is required.
- During distribution, any rounding dust is forwarded to a treasury address set via `FeePool.setTreasury(treasury)` so unallocated tokens never remain trapped.

Token burns may be configured on every fee so a portion of payouts is destroyed, creating a deflationary sink that increases scarcity without routing revenue to the owner.

## 2. Algorithmic & Reputational Incentives

- `JobRouter` favors platforms with higher stakes when routing unspecific jobs, giving committed operators more volume.
- `DiscoveryModule` surfaces staked platforms earlier in search results and displays a stake badge as reputation.
- Validators from well‑staked platforms receive extra validation slots, improving throughput.

## 3. Governance‑Aligned Rewards

- Staked operators participate in token‑weighted votes that adjust module parameters and fee splits.
- A dedicated `GovernanceReward` contract records voters and distributes owner‑funded bonuses after each poll, linking governance diligence to revenue.

## 4. Sybil & Regulatory Mitigation

- Minimum stake gates every platform deployment; failure or misconduct can slash this collateral.
- A configurable burn percentage on each payout permanently removes tokens, countering sybil farms and increasing scarcity.
- Appeal deposits in `DisputeModule` are denominated in $AGIALPHA and may be burned or paid to honest parties, discouraging frivolous challenges.
- On-chain tax acknowledgements and blacklist thresholds are owner‑tuned, letting deployments adapt to local compliance signals while keeping addresses pseudonymous.
- Because the protocol never takes custody or issues off‑chain payouts, there is no centralized revenue that would trigger reporting duties.

All modules expose simple `Ownable` setters so the contract owner can retune fees, stakes and burn rates through Etherscan without redeploying contracts. Token rotation is considered legacy and is not part of normal operations.

## 5. Owner Controls & User Experience

- The contract owner may update fees, burn rates and stake thresholds. The $AGIALPHA token address is immutable after deployment.
- All interactions rely on simple data types, enabling non‑technical users to operate entirely through Etherscan.
- Each module exposes an `isTaxExempt()` view and rejects direct ETH to prevent the contracts or owner from ever holding taxable funds.
- Reward flows never touch off‑chain accounts, keeping operators pseudonymous and outside traditional reporting regimes.

These incentives encourage honest participation, amplify $AGIALPHA demand, and keep all flows pseudonymous and globally tax‑neutral.
