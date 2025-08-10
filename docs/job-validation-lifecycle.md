# Single Job Commit–Reveal–Finalize Flow

This guide shows how a validator processes one job from commitment to finalization.

## Phases and Windows

| Phase    | Validator state | Allowed window | Function |
|----------|-----------------|----------------|----------|
| Commit   | Commitment stored | `commitWindow` seconds after selection | `ValidationModule.commitValidation(jobId, commitHash)` |
| Reveal   | Vote disclosed    | `revealWindow` seconds after commit window | `ValidationModule.revealValidation(jobId, approve, salt)` |
| Finalize | Job settled       | After `revealWindow` closes | `ValidationModule.tally(jobId)` then `JobRegistry.finalize(jobId)` |

`commitWindow` and `revealWindow` are owner‑configurable via `ValidationModule.setCommitRevealWindows`.

## Sample Solidity

```solidity
bytes32 salt = keccak256(abi.encodePacked(block.timestamp, msg.sender));
bytes32 commitHash = keccak256(abi.encode(true, salt));
validationModule.commitValidation(jobId, commitHash);
// ... wait for the commit window to close
validationModule.revealValidation(jobId, true, salt);
// ... wait for the reveal window to close
validationModule.tally(jobId);
jobRegistry.finalize(jobId);
```

## CLI Example

```bash
# Commit during the commit window
cast send $VALIDATION_MODULE "commitValidation(uint256,bytes32)" $JOB_ID 0xCOMMIT --from $VALIDATOR

# Reveal after the commit window
cast send $VALIDATION_MODULE "revealValidation(uint256,bool,bytes32)" $JOB_ID true 0xSALT --from $VALIDATOR

# Finalize after the reveal window
cast send $VALIDATION_MODULE "tally(uint256)" $JOB_ID --from $ANYONE
cast send $JOB_REGISTRY "finalize(uint256)" $JOB_ID --from $ANYONE
```

Validators that miss a window or reveal a vote inconsistent with their commit risk slashing and loss of reputation.
