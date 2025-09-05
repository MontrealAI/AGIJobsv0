# Coding Sprint: Platform Incentives

This sprint turns the high level incentive design into production ready code.
All modules operate on-chain in the 18‑decimal `$AGIALPHA` token and are fully
configurable by the contract owner.

## Objectives

- Gate platform activation by stake while keeping the owner tax neutral.
- Weight routing and fee share by on-chain stake and reputation.
- Keep all parameters owner updateable through `Ownable` setters.
- Expose simple Etherscan flows so non-technical operators can participate.

## Tasks

1. **StakeManager integration**
   - Deploy `StakeManager(token, owner, treasury)` and wire to `JobRegistry`.
2. **PlatformRegistry & JobRouter**
   - Require `minPlatformStake` for registration.
   - Compute routing scores from stake and reputation; allow owner to blacklist.
3. **FeePool setup**
   - Record fees from jobs and distribute to stakers via `claimRewards`.
   - Owner sets burn percentage and treasury address.
4. **PlatformIncentives helper**
   - Single `stakeAndActivate(amount)` call stakes and registers an operator.
   - Owner may call `stakeAndActivate(0)` to register without revenue share.
5. **Documentation & tests**
   - Update README with Etherscan walkthrough and regulatory disclaimer.
   - Run `npm test` and document gas costs.

## Definition of Done

- Operators can opt in via one transaction and immediately gain routing priority
  and fee share.
- The main deployer remains a zero‑stake, zero‑revenue participant.
- All contracts compile, tests pass and the README documents the flows.
