# Governance via Timelock or Multisig

Contracts inheriting from `Governable` expect a timelock or multisig
address. The controller is stored as a contract interface so that direct
EOA ownership is not possible.

The system uses a **7 day** timelock delay so all privileged operations are
announced before execution. During this window agents and validators can exit
by unbonding their stake. Call `StakeManager.requestWithdraw` to start the
unbonding process and, after the `unbondingPeriod` elapses, use
`StakeManager.finalizeWithdraw` to retrieve tokens before the proposal is
executed.

## Deploying with a timelock

1. Deploy an on-chain controller such as OpenZeppelin's
   `TimelockController` or a Gnosis Safe.
2. Note its address and use it as the final constructor argument when
   deploying `StakeManager`, `JobRegistry`, `Thermostat`, `RewardEngineMB`
   and any other `Governable` modules. Example using Hardhat:
   ```javascript
   const timelock = '0xTimelockAddress';
   const stake = await StakeManager.deploy(
     token,
     minStake,
     employerSlashPct,
     treasurySlashPct,
     treasury,
     jobRegistry,
     disputeModule,
     timelock
   );
   ```
3. After deployment the timelock or multisig becomes the only account
   capable of invoking functions marked `onlyGovernor`.

## Upgrading through the timelock

1. Encode the desired function call on the target contract (for example
2. Submit the call to the timelock or multisig:
   - For OpenZeppelin timelocks, use `schedule` with the target, value,
     data, predecessor, salt and delay parameters.
   - For multisigs like Gnosis Safe, create a transaction pointing to the
     target contract and collect the required signatures.
3. Once the timelock delay has passed (or sufficient signatures are
   collected), execute the queued transaction. The timelock or multisig
   will call the target contract and the upgrade takes effect.

This flow ensures all privileged operations occur only after the
configured delay or multi-party approval.

## Quadratic Voting

`QuadraticVoting` introduces a voting mechanism where the cost of casting votes
scales quadratically: committing `n` votes locks `n^2` governance tokens (typically
AGIALPHA). Locked funds remain in the contract until the proposal is executed by
the configured executor. After execution, each voter may call `claimRefund` to
retrieve the exact tokens they locked.

Example: voting with 3 votes costs 9 tokens, while 5 votes costs 25 tokens.
Voters approve the contract to transfer tokens on their behalf, `castVote` to
lock the cost, and once `execute` is called they can reclaim funds. The contract
optionally calls `GovernanceReward.recordVoters` so rewards can be distributed
based on participation.

