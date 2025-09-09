# Job Lifecycle

## Employer Finalization

After validation succeeds and the reveal and dispute windows close, only the employer can finalize the job from their own wallet. Calling `acknowledgeAndFinalize(jobId)` emits a `BurnRequired` event from the `StakeManager` indicating how many tokens must be burned. The employer burns that amount (via the token's `burn` or `burnFrom` functions) and then calls `confirmBurn(jobId, amount)` to release the escrowed reward and fees. This explicit two-step process keeps burn responsibility with the employer and the platform never handles the burned tokens.

## Expiration Handling

When an assigned job misses its deadline without submission, only the employer or governance may call `cancelExpiredJob` to finalize the job. This keeps the burn under the employer's control while still allowing governance to handle edge cases such as blacklisted participants.
