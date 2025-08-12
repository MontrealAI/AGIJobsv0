# Universal Platform Incentive Architecture

This document details a stake-based framework that aligns every AGI Jobs v2 role within a single on-chain economy.  The design operates entirely in the six‑decimal **$AGIALPHA** token and allows the contract owner to reconfigure parameters without redeploying modules.

> Regulatory shifts continue to evolve. On-chain fee routing minimises reporting, but operators and owners must still comply with local laws and monitor policy updates.

## Core Modules
- **StakeManager** – tracks deposits for agents, validators and platform operators; owner may update token, minimums and slashing percentages.
- **PlatformRegistry** – records platform operators and exposes routing scores derived from stake and reputation.
- **JobRouter** – selects platforms for new jobs according to `PlatformRegistry` scores.
- **FeePool** – accumulates protocol fees and distributes them to staked platforms; burn and treasury percentages are owner‑settable.
- **PlatformIncentives** – convenience wrapper letting an operator stake and activate routing in one transaction.
- **JobRegistry**, **ValidationModule**, **ReputationEngine**, **DisputeModule**, and **CertificateNFT** – handle job lifecycle, validation, reputation, appeals and credentials.

## Roles and Incentives
| Role | Stake | Incentives |
|------|------:|------------|
| Platform operator | `minPlatformStake` | Routing priority and proportional share of `FeePool` distributions |
| Agent | job‑level stake | Eligibility to complete work and earn rewards |
| Validator | owner‑set minimum | Commit–reveal voting rights and validation rewards |
| Main deployer | 0 | May register for demonstration but receives **no** routing or revenue boosts |
| Owner | 0 | Adjusts parameters via `Ownable` setters; does not receive fees unless staking like any operator |

All interactions flow through block‑explorer “Write” tabs so non‑technical users can participate without custom tooling.  Each contract exposes `isTaxExempt()` and rejects direct ETH to keep value transfers pseudonymous and on‑chain.

## Zero‑Stake Special Case
The primary deploying entity registers its reference platform with `stake = 0`.  The platform is listed but has a routing score of zero and cannot claim `FeePool` rewards.  This ensures the deployer remains tax neutral while still signalling expected behaviour to other operators.

## Owner Flexibility
The owner can retune the system at any time:
- `StakeManager.setToken` swaps the staking and payout token.
- `setMinStake`, `setBurnPct`, `setTreasury`, and similar setters adjust economics.
- Module addresses can be replaced through `setModules` functions to upgrade periphery contracts while preserving stakes and reputations.

## Coding Sprint – Implementation Tasks
1. **Deploy core modules** in this order: `StakeManager`, `PlatformRegistry`, `JobRouter`, `FeePool`, `JobRegistry`, `ValidationModule`, `ReputationEngine`, `DisputeModule`, `CertificateNFT`, `PlatformIncentives`.
2. **Implement staking flows**
   - Expose `stakeAndActivate` for operators; allow owner to call with `amount = 0`.
   - Emit events for stake deposits, registrations and fee claims.
3. **Route and reward**
   - Compute routing scores from `PlatformRegistry.getScore(addr)`.
   - Distribute fees in `FeePool` proportional to registered stake; provide `claimRewards()`.
4. **Testing & docs**
   - Unit tests: staking, zero‑stake registration, routing weight, fee distribution, token swap.
   - Integration tests: job creation through completion with multiple platforms.
   - Update README and deployment guides with Etherscan walkthroughs and regulatory disclaimers.
5. **Security**
   - Reject unexpected ETH in every module.
   - Verify `isTaxExempt()` returns `true` for helpers and owner addresses.

Participants must still follow local laws despite the on-chain design; see `docs/tax-obligations.md` for guidance.
