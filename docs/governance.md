# Governance via Timelock or Multisig

Contracts inheriting from `Governable` expect a timelock or multisig
address. The controller is stored as a contract interface so that direct
EOA ownership is not possible.

## Deploying with a timelock

1. Deploy an on-chain controller such as OpenZeppelin's
   `TimelockController` or a Gnosis Safe.
2. Note its address and use it as the final constructor argument when
   deploying `StakeManager`, `JobRegistry` and any other `Governable`
   modules. Example using Hardhat:
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
   capable of invoking functions marked `onlyGovernance`.

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

## Parameter changes

After deployment, modules such as `RewardEngineMB` and `Thermostat`
transfer ownership to a governance timelock. Adjusting their parameters
follows the same queue-and-execute pattern:

1. **Schedule** the call on the timelock with the encoded function data.
2. **Execute** the transaction once the timelock delay has elapsed.

The script `scripts/v2/queueOwnershipTransfer.ts` demonstrates this
workflow by queueing and executing `transferOwnership` for both modules:

```bash
TIMELOCK=<timelock> NEW_OWNER=<new> REWARD_ENGINE=<engine> THERMOSTAT=<thermo> \
  npx hardhat run scripts/v2/queueOwnershipTransfer.ts --network <net>
```

Replace the encoded function to schedule other parameter updates.
