# Emergency Response Runbook

## Purpose

This runbook documents how governance operators (the DAO multisig or timelock
executors) can pause the protocol, extend validation windows, or escalate a job
into the dispute process when the validator network is experiencing an
incident.

## Circuit Breaker Operations

1. **Pause the network** – Use the `SystemPause.pauseAll()` helper to freeze all
   critical modules in one transaction. This pauses job creation, staking, and
   validation to prevent further damage while the incident is investigated.
2. **Resume** – Once mitigations are in place, call `SystemPause.unpauseAll()`
   to bring the protocol back online.

## Validation Failover

When validators cannot reveal in time (for example due to a regional outage)
governance can trigger failover actions from the timelock:

1. Call `SystemPause.triggerValidationFailover(jobId, action, extension, reason)`
   where `action` is `1` to extend the reveal window or `2` to escalate to a
   dispute. `extension` is the number of seconds to add when extending, and
   `reason` is a short human readable string that is emitted on-chain for
   auditing.
2. Extending the window updates the reveal deadline in-place and records the
   change in `ValidationModule.failoverStates(jobId)` so off-chain services can
   adapt their schedules. The validator CLI will read the new deadline before
   attempting a reveal.
3. Escalating triggers `JobRegistry.escalateToDispute`, moving the job into the
   dispute flow and opening a zero-fee case via `DisputeModule.raiseGovernanceDispute`.

## Governance Slashing

During incident response the timelock can claw back stake from malicious
participants by calling `StakeManager.governanceSlash(address user, uint8 role,
uint256 pctBps, address beneficiary)`. The percentage is expressed in basis
points (1/100 of a percent) and the beneficiary typically points to the DAO
treasury or directly to the affected employer.

## Validator CLI Support

Validators can use `scripts/validator/cli.ts` to:

- manage ENS-backed identities and proofs,
- deposit or withdraw validator stake,
- commit and reveal votes with automatic hash generation and
  deadline warnings, and
- raise or inspect disputes ("challenges") when job results are contested.

The CLI reads the same configuration JSON as the orchestrator tooling and will
emit warnings if a reveal is attempted before the commit window closes.

