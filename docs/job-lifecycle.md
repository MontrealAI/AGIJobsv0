# Job Lifecycle

## Expiration Handling

When an assigned job misses its deadline without submission, anyone may call `cancelExpiredJob` to finalize the job. The caller does not need to be the employer, agent, or a tax policy acknowledger—**any address can trigger expiration handling** once the deadline has passed.
