# AGIJobs v2 Module Deployment Summary

For detailed production deployment instructions see
[deployment-production-guide.md](deployment-production-guide.md). For an
explanation of module responsibilities and how they interact, refer to
[architecture-v2.md](architecture-v2.md).

This note outlines a minimal sequence for deploying the modular v2 stack
and wiring contracts together. The `$AGIALPHA` token, ENS roots, Merkle
roots and all numeric parameters can be updated later by the owner.
Prefer automated helpers when possible:

- [`scripts/v2/deployDefaults.ts`](../scripts/v2/deployDefaults.ts) reads
  `deployment-config/<network>.json`, deploys each module with the
  requested parameters, and writes the resulting addresses to the
  configured manifest.
- [`ModuleInstaller`](module-installer.md) batches post-deployment wiring
  so multisig operators can execute a single transaction.

## 1. Deployment order

1. **StakeManager** – provide the staking token, minimum stake, slash
   percentages, treasury destination and governance timelock/multisig.
2. **ReputationEngine** – constructor accepts the `StakeManager` address.
3. **IdentityRegistry** – supply the ENS registry, NameWrapper,
   `ReputationEngine`, and the initial root nodes or `0x00`.
4. **ValidationModule** – deploy with placeholder `jobRegistry = 0`, the
   `StakeManager` address, validator windows and committee bounds.
5. **DisputeModule** – deploy with `jobRegistry = 0`, any dispute fee and
   resolution window.
6. **CertificateNFT** – deploy with the collection name and symbol.
7. **FeePool** – pass the staking token, `StakeManager`, burn percentage,
   and optional treasury.
8. **Optional platform helpers** – `PlatformRegistry`, `JobRouter`,
   `PlatformIncentives`, `TaxPolicy`, or `SystemPause` if they are part
   of the configuration manifest.
9. **JobRegistry** – constructor requires every module address (or
   `address(0)` when omitting an optional dependency), the protocol fee,
   per-job validator stake, acknowledgement module list, and the
   governance authority. The constructor validates module versions and
   persists the wiring immediately.

## 2. Wiring

- If `ModuleInstaller` is deployed, transfer ownership of each module to
  the installer, invoke `initialize(...)`, then transfer ownership back
  to the governance address.
- For manual wiring call:
  - `JobRegistry.setModules(validation, stake, reputation, dispute,
    certificate, feePool, ackModules)`
  - `StakeManager.setJobRegistry(jobRegistry)` and
    `StakeManager.setDisputeModule(disputeModule)`
  - `ValidationModule.setJobRegistry(jobRegistry)` and
    `ValidationModule.setIdentityRegistry(identityRegistry)`
  - `DisputeModule.setJobRegistry(jobRegistry)` and
    `DisputeModule.setTaxPolicy(taxPolicy)` when applicable
  - `CertificateNFT.setJobRegistry(jobRegistry)` then
    `CertificateNFT.setStakeManager(stakeManager)`
  - `JobRegistry.setTaxPolicy(taxPolicy)` and
    `JobRegistry.setIdentityRegistry(identityRegistry)` when those
    modules are used
- Verify `ModulesUpdated`, `JobRegistrySet` and related events before
  allowing user funds. Run `npm run wire:verify -- --network <network>`
  to compare on-chain wiring with the committed manifests.

## 3. Post-deploy configuration

1. **Identity updates** – adjust namehashes and allowlists through
   `IdentityRegistry.setAgentRootNode`, `setClubRootNode`,
   `setAgentMerkleRoot` and `setValidatorMerkleRoot`.
2. **Economic tuning** – `StakeManager.setMinStake`,
   `JobRegistry.setFeePct`, `FeePool.setBurnPct`, thermostat, reward
   engine, and treasury settings can be changed at any time. Use
   `npm run owner:plan` followed by `npm run owner:update-all -- --network
   <network> [--execute]` to batch and audit these updates.
3. **Ownership rotation** – transfer ownership of every `Ownable` module
   to the governance contract once configuration is complete. Verify with
   `npm run owner:verify-control -- --network <network>`.

Following this order keeps the deployment deterministic while ensuring
all critical parameters remain under explicit owner control.
