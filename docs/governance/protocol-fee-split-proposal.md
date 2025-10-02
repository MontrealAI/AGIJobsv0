# Draft Governance Proposal: Protocol Fee Split Upgrade

## Summary
- Formalise the pilot fee policy where employers pay a 5% protocol fee and 1% of that fee is burned immediately.
- Establish a community treasury destination once governance tooling is live so a fixed slice of collected fees can fund operations without touching user custody.
- Preserve the remaining fee balance inside `FeePool` for platform stakers, ensuring rewards stay transparent and on-chain.

## Current State (Pilot)
- `JobRegistry.feePct` is set to `5`, so every job sends 5% of the reward to the protocol.
- `FeePool.burnPct` defaults to `1`, burning one percent of the collected fee on every `JobRegistry.finalize` call.
- `FeePool.treasury` is the zero address, so rounding dust and any governance withdrawals default to burning.
- All residual fees remain in `FeePool` and accrue to the platform staker role until they claim through `FeePool.claimRewards`.

## Proposed Post-Pilot Split
When the DAO ratifies a treasury address:

| Allocation | Percentage of each job reward | Mechanism |
| ---------- | ----------------------------- | --------- |
| Burn       | 1% (unchanged)                | Automatic via `FeePool.burnPct` |
| Community Treasury | 2%                     | Monthly `FeePool.governanceWithdraw` to the treasury multisig |
| Staker Rewards | 2%                         | Remains escrowed in `FeePool` for `Role.Platform` stakers |

This keeps the employer-facing cost at 5% while clearly reserving budget for operations and ecosystem growth.

## Execution Plan
1. **Prepare configuration**
   - Add the treasury multisig to `config/fee-pool.json → treasuryAllowlist` and set `treasury` to that address while keeping `burnPct = 1`.
   - (Optional) Update `config/stake-manager.json` if the treasury should also receive slashed stakes.
2. **Generate the change bundle**
   - Run `npm run owner:plan -- --network <network> --only=feePool,stakeManager` to produce the audit log and Safe transaction set.
3. **Apply on-chain**
   - Execute `npm run owner:update-all -- --network <network> --only=feePool,stakeManager --execute` once governance approves the bundle.
   - Record the resulting receipts in `reports/<network>-fee-policy.md`.
4. **Schedule withdrawals**
   - After each distribution cycle, governance withdraws `0.02 × collected fees` to the treasury using `FeePool.governanceWithdraw(treasury, amount)`.
   - Publish a quarterly statement describing how withdrawn funds were spent.

## Rationale
- Employers see a fixed, documented cost where 1% is burned and 4% supports network participants.
- Stakers retain a transparent revenue stream; governance can demonstrate exactly how much remains for rewards versus treasury operations.
- Using the owner ops workflow (`owner:plan` ➝ `owner:update-all`) keeps every change auditable and reproducible for future councils.

## Open Questions for Governance
- Should the treasury withdrawal happen automatically via a keeper, or remain a manual multisig action with published receipts?
- Does the community want to earmark part of the treasury share (e.g. 0.5%) for grants or dispute resolution funds using `FeePool.setRewarder`?
- What cadence (monthly, quarterly) gives contributors enough runway without leaving excess capital idle in the FeePool?

Document these decisions before executing the proposal so operators can implement them without ambiguity.
