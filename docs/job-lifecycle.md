# Job Lifecycle

## Employer Finalization

After validation succeeds and the reveal and dispute windows close, only the employer can finalize the job from their own wallet. Calling `acknowledgeAndFinalize(jobId)` on `JobRegistry` calculates the employer's burn obligation and emits a `BurnRequired` event from `StakeManager` while keeping all funds escrowed. The employer must then burn the stated amount from their wallet (e.g., via the token's `burn` or `burnFrom` functions) and submit the proof by calling `confirmBurn(jobId, amount)` on `StakeManager`. Once confirmed, the contract releases the pending payouts and refunds any burned amount back to the employer. This flow ensures the platform never initiates finalization nor collects burned tokens.

## Expiration Handling

When an assigned job misses its deadline without submission, only the employer or governance may call `cancelExpiredJob` to finalize the job. This keeps the burn under the employer's control while still allowing governance to handle edge cases such as blacklisted participants.
