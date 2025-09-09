# Job Lifecycle

## Employer Finalization

After validation succeeds and the reveal and dispute windows close, only the employer can finalize the job from their own wallet. Before calling `acknowledgeAndFinalize(jobId)` on `JobRegistry`, the employer must burn the required fee share from their wallet, submit the receipt, and call `confirmEmployerBurn(jobId, txHash)`. This confirms the tax disclaimer and ensures the platform never initiates finalization nor collects burned tokens.

## Expiration Handling

When an assigned job misses its deadline without submission, only the employer or governance may call `cancelExpiredJob` to finalize the job. This keeps the burn under the employer's control while still allowing governance to handle edge cases such as blacklisted participants.
