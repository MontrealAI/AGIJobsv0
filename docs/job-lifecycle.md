# Job Lifecycle

## Employer Finalization

After validation succeeds and the reveal and dispute windows close, the employer must finalize the job from their own wallet by calling `acknowledgeAndFinalize(jobId)` on `JobRegistry`. This confirms the tax disclaimer and burns the fee portion of the employer's escrow. The platform never finalizes jobs or collects burned tokens.

## Expiration Handling

When an assigned job misses its deadline without submission, anyone may call `cancelExpiredJob` to finalize the job. The caller does not need to be the employer, agent, or a tax policy acknowledger—**any address can trigger expiration handling** once the deadline has passed.
