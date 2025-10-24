# Phase 8 Universal Value Governance Playbook

This playbook distils the on-chain controls exposed by `Phase8UniversalValueManager` into a
checklist non-technical operators can follow when rotating access, pausing subsystems, or rolling
out new manifest data. Each procedure references the contract calls surfaced in the
`Phase8UniversalValueManager` ABI and mirrors the automation published by the `run-phase8-demo`
console script.

## Quick reference roles

| Role | Description |
| ---- | ----------- |
| **Governance** | Timelock or multisig authorised to call `onlyGovernance` functions. |
| **Guardian Council** | Fast-reacting committee configured via `setGuardianCouncil` for accelerated actions. |
| **System Pause** | Aggregator module receiving forwarded pause calls from governance. |
| **Sentinels** | External watchdog agents that must cover at least the guardian review window. |

## Updating global addresses and manifesto data

1. Prepare the new addresses (treasury, universal vault, upgrade coordinator, validator registry,
   mission control, knowledge graph) and verify they are deployed contracts when required.
2. Generate the new manifesto artifact, compute its IPFS URI and keccak256 hash.
3. Encode `setGlobalParameters` with the full tuple including the manifesto hash, or
   call `updateManifesto(uri, hash)` for URI-only refreshes.
4. Submit the transaction from the governance executor. The contract emits
   `GlobalParametersUpdated` with the full struct for auditors to snapshot.
5. If only the emergency routing changes, call `setGuardianCouncil(newCouncil)` and
   `setSystemPause(newPause)` with the updated addresses.

### Checklist

- [ ] All six critical addresses reviewed and audited.
- [ ] Manifesto URI reachable and checksum logged.
- [ ] Manifesto hash reproduced by two independent operators.
- [ ] Guardian council multisig online and monitored.
- [ ] System pause contract verified on explorer.

## Pausing modules through the manager

1. Gather the encoded calldata for the downstream pause function (e.g. `pauseAll()` on
   `SystemPause`).
2. Call `forwardPauseCall(calldata)` from governance. The manager checks that the configured pause
   contract has code deployed, forwards the call, and emits `PauseCallForwarded` with the return
   data.
3. Confirm the downstream module reports `paused=true` and archive the transaction hash in the
   incident log.
4. To resume operations, forward the corresponding unpause calldata.

### Checklist

- [ ] Pause calldata reviewed for the intended module.
- [ ] System pause address confirmed via `systemPause()` getter before execution.
- [ ] `PauseCallForwarded` event recorded with response payload.
- [ ] Incident response runbook updated with block number.

## Sentinel roster maintenance

- Register sentinels with `registerSentinel` and ensure `coverageSeconds` is **greater than or equal
  to** the guardian review window recorded in `globalParameters.guardianReviewWindow`.
- Use `setSentinelDomains` to bind sentinels to specific domain identifiers after confirming the
  domain hashes with `listDomains()`.
- `setSentinelStatus` toggles the active flag without changing metadata; use it for temporary
  disablement.
- Removing a domain automatically prunes sentinel bindings—double-check assignments after any domain
  delisting.

### Checklist

- [ ] Coverage window per sentinel ≥ guardian review window.
- [ ] Duplicate domain bindings rejected by dry-run tests.
- [ ] Domain removal audit log reviewed for pruned bindings.

## Self-improvement receipts

1. Configure the plan with `setSelfImprovementPlan` including the cadence, plan hash, and optional
   last execution timestamp.
2. After completing scheduled work, call `recordSelfImprovementExecution(executedAt, reportURI)`.
   URIs must begin with `ipfs://` or `https://`, and timestamps must be monotonically increasing.
3. Archive emitted `SelfImprovementExecutionRecorded` events as proof of execution in the strategic
   roadmap tracker.

### Checklist

- [ ] Plan hash matches signed manifesto entry.
- [ ] Report URI hosted on approved storage backend.
- [ ] Execution timestamp ≥ previous run recorded on-chain.

## Governance rotation

- Rotate the controlling timelock by calling `setGovernance(newAddress)` from the current governance
  account. Subsequent privileged calls must originate from the new executor.
- Validate the new address by attempting a read-only call and checking emitted `GovernanceUpdated`
  and `OwnershipTransferred` events.
- Update operator tooling (mermaid diagrams, automation manifests) with the new governance
  contract.

### Checklist

- [ ] New governance address multisig quorum verified.
- [ ] Old governance account confirmed without residual privileges.
- [ ] Automation pipelines (Hardhat, Foundry, runbooks) reconfigured.

## Mass onboarding considerations

- Domain, sentinel, and capital stream removals now use constant-time index pruning to keep calldata
  costs flat even with large registries. Always batch creations using the `register*` helpers in the
  demo console to minimise operator error.
- Before large imports, run `forge test --gas-report` to capture gas deltas and file the report in
  the deployment artifacts directory.

### Checklist

- [ ] Gas report captured post-change.
- [ ] Registry size documented before and after onboarding.
- [ ] Index pruning verified by sampling `list*()` outputs.
