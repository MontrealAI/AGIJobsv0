# Job Lifecycle

The agent gateway now handles end-to-end execution for assigned jobs. The
workflow bridges off-chain task orchestration with on-chain settlement, while
preserving the requirement that employers acknowledge the platform's tax policy
before final payout.

## Agent Gateway Task Execution

1. The orchestrator selects an agent profile and establishes a
   `TaskExecutionContext` containing the job specification, ENS identity
   metadata, and the most recent performance analysis.
2. `runAgentTask(agent, jobSpec)` aggregates orchestration context from
   registered hooks. These hooks can inject domain-specific cues or replay the
   most recent memory entries for the agent so downstream models receive
   situational awareness.
3. The gateway calls the agent endpoint with the enriched payload. If the
   endpoint is unreachable or returns an error, a deterministic fallback
   response is generated to keep the job moving.
4. Invocation results, along with any errors, are fed back through memory hooks
   so subsequent jobs can reuse the latest context without additional storage
   lookups.

## Packaging and IPFS Publishing

1. The structured result is serialised to JSON and written to
   `agent-gateway/storage/results/<jobId>.json` for local auditing.
2. The payload is uploaded to IPFS using `ipfs-http-client`. The gateway keeps a
   direct reference to the returned CID.
3. The payload digest and result hash are computed from the serialised JSON and
   signed by the executing wallet.

Example output:

- Local file: `storage/results/201.json`
- CID: `bafybeigdyrzt5xndz4g6sxu4sx2ap7lvtwqz6sg6rqad7l4n3dq4k23qmu`
- Result URI: `ipfs://bafybeigdyrzt5xndz4g6sxu4sx2ap7lvtwqz6sg6rqad7l4n3dq4k23qmu`

## On-chain Submission and Finalization

1. The executing wallet acknowledges the active tax policy when required.
2. The gateway attempts to call `JobRegistry.finalizeJob(jobId, resultRef)` so
   the registry can atomically record the artifact reference and emit
   `JobFinalized`.
3. If the target registry does not expose `finalizeJob` or the call reverts
   (for example, on networks that still require employer-driven settlement), the
   gateway falls back to `submit(jobId, resultHash, resultURI, subdomain, proof)`
   so validation and employer finalization can proceed as usual.
4. Every transaction hash, signature, and CID is logged through the audit
   logger and recorded in the agent memory hooks for future orchestration.

Sample trace:

1. `finalizeJob(201, "ipfs://…")` → `0x8c12…af9b`
2. Fallback scenario: `submit(202, 0x6f8a…, "ipfs://…")` → `0xa1b4…0de7`
3. Employer follow-up: `acknowledgeAndFinalize(202)` once burns are confirmed.

## Employer Finalization

After validation succeeds and the reveal and dispute windows close, only the
employer can finalize the job from their own wallet when the gateway was forced
onto the submission path. Before calling `acknowledgeAndFinalize(jobId)` on
`JobRegistry`, the employer must burn the required fee share from their wallet,
submit the receipt, and call `confirmEmployerBurn(jobId, txHash)`. This confirms
the tax disclaimer and ensures the platform never initiates finalization nor
collects burned tokens.

## Expiration Handling

When an assigned job misses its deadline without submission, only the employer
or governance may call `cancelExpiredJob` to finalize the job. This keeps the
burn under the employer's control while still allowing governance to handle edge
cases such as blacklisted participants.

## Employer Reputation

The registry tracks a simple reputation score for each employer. When a job
finalizes successfully, the employer's positive count increases. If a job ends
in dispute, the negative count increments. Anyone can call
`getEmployerReputation(address)` on `JobRegistry` to retrieve these counters and
`getEmployerScore(address)` for a normalized reputation score between 0 and 1
(scaled by `1e18`). Evaluating an employer's history before engaging helps
participants route work toward reliable counterparties.
