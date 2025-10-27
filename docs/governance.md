# Governance Operations & Incident Response

This playbook documents how the multisig or timelock that controls AGI Jobs v0
governance can manage contract parameters and respond to operational incidents
without touching application code.

## Governance surface

- **System-wide pause** – `SystemPause` allows governance to freeze or resume
  the Job Registry, Stake Manager, Validation Module, and other core services
  with a single transaction. It validates ownership of all managed modules and
  emits `ModulesUpdated`/`PausersUpdated` events whenever custody changes.【F:contracts/v2/SystemPause.sol†L16-L119】
- **Shard-level quotas** – The `ShardRegistry` exposes governance-only setters
  that forward quota updates to the individual `ShardJobQueue` contracts. Each
  queue now enforces maximum open jobs and active (assigned/in-progress)
  concurrency before accepting new work.【F:contracts/v2/modules/ShardRegistry.sol†L60-L74】【F:contracts/v2/modules/ShardJobQueue.sol†L55-L115】
- **Owner configurator** – The `OwnerConfigurator` batch-forwards parameter
  changes from a Safe/EOA and emits `ParameterUpdated` events so operator
  dashboards and subgraphs can replay the governance log.【F:contracts/v2/admin/OwnerConfigurator.sol†L9-L105】

## Routine parameter changes

### Update shard quotas

1. Encode the desired limits (reward cap, maximum job duration, maximum open
   jobs, maximum concurrent assignments). For example, to cap a shard at 1,000
   reward tokens, 1 hour duration, 25 open jobs and 10 active jobs:

   ```bash
   npx hardhat run scripts/shards/manage-shards.ts -- \
     set-params EARTH 1000 3600 25 10
   ```

   The helper script now accepts the optional `maxOpenJobs` and `maxActiveJobs`
   fields and logs the applied configuration so the multisig can attach the
   transaction receipt to its minutes.【F:scripts/shards/manage-shards.ts†L45-L75】

2. Confirm the queue applied the new guardrails by reading
   `ShardRegistry.getShardUsage`. The adapter in `@agijobs/onebox-sdk` exposes a
   convenience helper that returns the live open/active job counters so off-chain
   monitors can alert before hitting hard limits.【F:packages/onebox-sdk/src/shardRegistry.ts†L6-L104】

3. Record the emitted `ShardParametersUpdated` event. It now includes the open
   and active quotas alongside reward/duration for full audit coverage.【F:contracts/v2/interfaces/IShardRegistry.sol†L11-L26】

### Pause and resume operations

- **Single shard outage** – call `ShardRegistry.pauseShard(shardId)` to stop job
  intake for the affected queue. Once mitigated, invoke
  `ShardRegistry.unpauseShard(shardId)` and verify `getShardUsage` no longer
  changes while the shard is paused.【F:contracts/v2/modules/ShardRegistry.sol†L75-L113】
- **Full platform incident** – execute `SystemPause.pause()` to freeze the
  entire protocol, including staking and dispute flows. Resume with
  `SystemPause.unpause()` after postmortem approval.【F:contracts/v2/SystemPause.sol†L159-L221】

## Incident response playbooks

### API abuse or credential compromise

1. Rotate the API token (or individual token/role mapping) via environment
   variables and redeploy. The shared security guard enforces bearer tokens,
   per-actor rate limits, optional HMAC signatures, and role allowlists for every
   `/onebox/*` route. It emits `security.authenticated` audit events and exposes
   helpers to reset rate limit buckets during investigations.【F:routes/security.py†L1-L188】
2. For FastAPI services running in production, redeploy with the rotated token
   and signing secret. Confirm requests without valid credentials fail with
   `401` and that rate limits trigger `429` after the configured burst budget.【F:test/routes/test_meta_orchestrator.py†L112-L170】

### Shard congestion or malicious workload

1. Use `getShardUsage` to identify shards that are approaching quota ceilings.
   If abuse is detected, lower `maxOpenJobs` or `maxActiveJobs` temporarily via
   the governance script to shed load before service-level indicators degrade.【F:contracts/v2/modules/ShardJobQueue.sol†L55-L115】
2. For severe situations, pause the shard or invoke `SystemPause` to halt all
   new jobs. Capture emitted events and incident timestamps for the runbook.

### Signature verification failures

1. When HMAC validation starts failing (e.g., due to clock skew or compromised
   secret), check the audit log for `SIGNATURE_*` errors emitted by the security
   guard. Adjust the signature tolerance window or rotate the shared secret via
   environment variables, then call `reload_security_settings()` to apply the
   change without restarting unit tests or staging nodes.【F:routes/security.py†L114-L176】
2. After rotation, use the signed request test pattern from the suite to verify
   the new secret is accepted and invalid signatures are rejected.【F:test/routes/test_meta_orchestrator.py†L143-L170】

Maintain an incident diary with the executed transactions, emitted events, and
API responses. The expanded quota fields and audit hooks introduced in this
release provide the evidence needed for governance disclosures and postmortems.

