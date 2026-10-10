# Security & Deployment Runbook

This runbook distills the production hardening steps required for an
institutional launch. It assumes contracts are already deployed and wired
per the procedures in `README.md` and focuses on governance hand-off,
admin role management, and emergency response.

## 1. Preserve the staged governance topology

For a new deployment use the [current Hardhat guide](deployment-v2-agialpha.md). Its paused handoff makes SystemPause the owner of JobRegistry, StakeManager, ValidationModule, ReputationEngine, DisputeModule, PlatformRegistry, FeePool and ArbitratorCommittee. The requested governance owns SystemPause. Do not replace this with a blanket transfer of operational modules to a wallet.

CertificateNFT, JobRouter and PlatformIncentives are owned directly by governance. IdentityRegistry and TaxPolicy require `acceptOwnership()` by their pending governance owner; inspect `pendingOwnership` in the deployment report. Record acceptance receipts and verify actual owners before archiving the deploying account.

Managed-module setters go through `SystemPause.executeGovernanceCall(target, data)` from its actual governance. Additional modules deployed separately retain their own authority rules. Review their ABI and owner before any rotation. The script does not impersonate a multisig.

## 2. Configure emergency pausers

Only the timelock/multisig can rotate pausers. Nominate an operations
team wallet for rapid incident response:

| Module          | Function call                         | Event emitted             |
| --------------- | ------------------------------------- | ------------------------- |
| StakeManager    | `setPauser(pauser)`                   | `PauserUpdated(pauser)`   |
| JobRegistry     | `setPauser(pauser)`                   | `PauserUpdated(pauser)`   |
| ValidationModule| `setPauser(pauser)`                   | `PauserUpdated(pauser)`   |
| FeePool         | `setPauser(pauser)` (optional)        | `PauserUpdated(pauser)`   |

Record the pauser address alongside governance transactions. Pauser
wallets must hold zero production funds and should be secured with a
hardware device.

## 3. Emergency halt procedure

1. **Detect incident.** Monitoring detects suspicious activity (e.g.
   unexpected slashing, exploit report).
2. **Pause critical flows.** The pauser (or governance) calls `pause()` on
   `StakeManager`, `JobRegistry`, and `ValidationModule`. Confirm the
   `Paused(account)` event fires for each contract.
3. **Broadcast notice.** Alert validators, agents, and platform operators
   via agreed channels.
4. **Investigate & patch.** Diagnose the issue, deploy new modules if
   needed, and schedule governance transactions to swap them in.
5. **Resume operations.** Once remediation is complete the controller (or
   pauser) calls `unpause()` on each contract. Verify `Unpaused(account)`
   and resume normal processing.

## 4. Parameter or module changes

All privileged updates must originate from the controller. Recommended
workflow:

1. Draft a proposal describing the change (e.g. "Raise `minStake`") and
   obtain stakeholder sign-off.
2. Encode the transaction using the governance UI or script. Examples:
   - `StakeManager.setMinStake(newValue)`
   - `JobRegistry.setModules(...)`
   - `ValidationModule.setCommitWindow(newWindow)`
3. Submit the transaction to the timelock/multisig. Require **majority
   approval** and, for timelocks, wait for the configured delay.
4. Execute the transaction. Archive the transaction hash, emitted events,
   and updated parameter values in the governance logbook.

## 5. Monitoring & logging

Track the following events via an on-chain indexer or log ingestion tool:

- `GovernanceUpdated(address)` and `OwnershipTransferred(address,address)`
  – record every ownership rotation
- `PauserUpdated(address)` – capture pauser handovers
- `Paused(address)` / `Unpaused(address)` – correlate with incident
  reports
- Module-specific events (`ValidationModuleUpdated`,
  `StakeManagerUpdated`, `FeePoolUpdated`, etc.) – confirm module swaps
- `TaxPolicyUpdated` and acknowledgement events – ensure regulatory
  disclosures remain current

Retain logs for at least the statutory record-keeping period required by
stakeholders or regulators.

## 6. Launch checklist

- [ ] Controller deployed with majority threshold and documented signers
- [ ] All modules report the controller as `owner()`/`governance()`
- [ ] Pauser roles assigned and verified via `PauserUpdated`
- [ ] Monitoring alerts configured for the events listed above
- [ ] Emergency communications plan validated (contact tree, incident
      channel)
- [ ] Runbook stored in internal knowledge base and acknowledged by
      stakeholders

Following this checklist ensures the contracts remain under multi-party
control, critical operations can be halted quickly, and every governance
action is auditable via emitted events.
