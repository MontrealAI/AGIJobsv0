# Security Guidelines

## Ownership Transfer to a Multisig

1. Deploy or identify a secure multisig wallet (e.g., Gnosis Safe) with a **strict majority** approval threshold (e.g., 2-of-3, 3-of-5).
2. From the current owner account, call `setGovernance(<multisig_address>)` on `Governable` modules (JobRegistry, StakeManager, SystemPause, Thermostat, etc.). Each call emits both `GovernanceUpdated` and `OwnershipTransferred(previousOwner, newOwner)`.
3. Call `transferOwnership(<multisig_address>)` on `Ownable` modules (ValidationModule, ReputationEngine, FeePool, PlatformRegistry, IdentityRegistry, CertificateNFT, DisputeModule, PlatformIncentives, JobRouter, TaxPolicy, etc.). The hand-off emits `OwnershipTransferred`.
4. Wait for confirmations and verify the emitted events reference the intended multisig.
5. Confirm the transfer by calling `owner()` (or `governance()` on Governable modules) to ensure the multisig address is in control before retiring the deployer key.

## Verifying Module Address Updates

When updating module addresses, ensure the transaction emits the expected events:

- `ValidationModuleUpdated(address)` when setting a new validation module.
- `DisputeModuleUpdated(address)` when setting a new dispute module.
- `JobRegistryUpdated(address)` when modules such as `CertificateNFT` or `StakeManager` update their registry reference.
- `PauserUpdated(address)` when emergency pause delegates are rotated.
- `Paused(address)` / `Unpaused(address)` from critical modules following a governance or pauser action.

## Operations Runbook

See [docs/security-deployment-guide.md](docs/security-deployment-guide.md) for a step-by-step guide that combines ownership transfers, pauser configuration, and emergency response procedures into a single checklist suitable for production launches.

## Static Analysis Commands

- **Slither:** `slither . --solc-remaps @openzeppelin=node_modules/@openzeppelin/`
- **Foundry:**
  - `forge build`
  - `forge test`
