# Single Job Commit–Reveal–Finalize Flow

This guide shows how a validator processes one job from commitment to finalization.

## Phases and Windows

| Phase    | Validator state   | Allowed window                             | Function                                                              |
| -------- | ----------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Commit   | Commitment stored | `commitWindow` seconds after selection     | `ValidationModule.commitValidation(jobId, commitHash, subdomain, proof)`                |
| Reveal   | Vote disclosed    | `revealWindow` seconds after commit window | `ValidationModule.revealValidation(jobId, approve, salt, subdomain, proof)`             |
| Finalize | Job settled       | After `revealWindow` closes                | `ValidationModule.finalize(jobId)` then `JobRegistry.finalize(jobId)` |

`commitWindow` and `revealWindow` are owner‑configurable via `ValidationModule.setCommitRevealWindows`.

## Sample Solidity

```solidity
bytes32 salt = keccak256(abi.encodePacked(block.timestamp, msg.sender));
bytes32 commitHash = keccak256(abi.encode(true, salt));
validationModule.commitValidation(jobId, commitHash, '', new bytes32[](0));
// ... wait for the commit window to close
validationModule.revealValidation(jobId, true, salt, '', new bytes32[](0));
// ... wait for the reveal window to close
validationModule.finalize(jobId);
jobRegistry.finalize(jobId);
```

## CLI Example

```bash
# Commit during the commit window
cast send $VALIDATION_MODULE "commitValidation(uint256,bytes32,string,bytes32[])" $JOB_ID 0xCOMMIT '' [] --from $VALIDATOR

# Reveal after the commit window
cast send $VALIDATION_MODULE "revealValidation(uint256,bool,bytes32,string,bytes32[])" $JOB_ID true 0xSALT '' [] --from $VALIDATOR

# Finalize after the reveal window
cast send $VALIDATION_MODULE "finalize(uint256)" $JOB_ID --from $ANYONE
cast send $JOB_REGISTRY "finalize(uint256)" $JOB_ID --from $ANYONE
```

Validators that miss a window or reveal a vote inconsistent with their commit risk slashing and loss of reputation.

## Governance Reward Epoch

After each parameter poll, the owner rewards participating voters through the `GovernanceReward` contract.

| Phase    | Caller | Description                                      | Function                                      |
| -------- | ------ | ------------------------------------------------ | --------------------------------------------- |
| Record   | Owner  | capture addresses that voted this epoch          | `GovernanceReward.recordVoters([v1,v2])`      |
| Finalize | Owner  | withdraw reward from FeePool and close the epoch | `GovernanceReward.finalizeEpoch(totalReward)` |
| Claim    | Voter  | withdraw an equal share for that epoch           | `GovernanceReward.claim(epoch)`               |

`totalReward` uses 18‑decimal base units. `finalizeEpoch` increments `currentEpoch` so subsequent `recordVoters` calls start a new epoch.

### Sample Solidity

```solidity
address[] memory voters = new address[](2);
voters[0] = voter1;
voters[1] = voter2;
reward.recordVoters(voters);
feePool.governanceWithdraw(address(reward), 200 * 1e18);
reward.finalizeEpoch(200 * 1e18);
// later
reward.connect(voter1).claim(0);
```

### CLI Example

```bash
# record voters after a poll
cast send $GOV_REWARD "recordVoters(address[])" "[$VOTER1,$VOTER2]" --from $OWNER
# withdraw rewards from the FeePool and finalize the epoch
cast send $FEE_POOL "governanceWithdraw(address,uint256)" $GOV_REWARD 200000000000000000000 --from $TIMELOCK
cast send $GOV_REWARD "finalizeEpoch(uint256)" 200000000000000000000 --from $TIMELOCK
# voter claims their share
cast send $GOV_REWARD "claim(uint256)" 0 --from $VOTER1
```
