# Contracts control matrix

AGI Jobs v0 ships with two distinct administrative surfaces:

- **Governance-controlled modules** inherit `Governable` and expect all
  privileged calls to flow through a timelock or multisig.
- **Operator-owned modules** rely on `Ownable`/`Ownable2Step` and are now fronted
  by the upgrade-ready [`HGMControlModule`](v2/admin/HGMControlModule.sol) so the
  Huxley–Gödel Machine (HGM) deployment can exercise full parameter authority
  without juggling many EOAs.

The table below summarises the effective owner and the most important control
points for each production contract.

| Contract | Location | Ownership expectation | Primary control points | Notes |
| --- | --- | --- | --- | --- |
| `JobRegistry` | `contracts/v2/JobRegistry.sol` | Timelock via `Governable` | `setJobParameters`, `setFeePct`, `setValidatorRewardPct`, `setAgent/Validator*` roots, `setTaxPolicy`, `pause` | Custodies no funds; pausing is delegated to a pauser manager and the global [`SystemPause`]. |
| `StakeManager` | `contracts/v2/StakeManager.sol` | Timelock via `Governable` | `setFeePct`, `setBurnPct`, `setValidatorRewardPct`, `setMinStake`, `setTreasury`, `setTreasuryAllowlist`, `pause` | Works in tandem with the registry for stake limits and treasury routing. |
| `SystemPause` | `contracts/v2/SystemPause.sol` | Timelock via `Governable` | `pauseAll`, `unpauseAll`, `setGlobalPauser`, `refreshPausers` | Cascades pause signals across every core module. |
| `ValidationModule` & `modules/*` | `contracts/v2/ValidationModule.sol`, `contracts/v2/modules/*.sol` | Timelock (many inherit `Governable` or `Ownable`) | Module-specific wiring helpers | Swapped or reconfigured via `ModuleInstaller`. |
| `RewardEngineMB` & `Thermostat` | `contracts/v2/RewardEngineMB.sol`, `contracts/v2/Thermostat.sol` | Timelock | `setRoleShare`, `setThermostat`, `setPID`, `setTemperature*` | Aligns emissions with Hamiltonian telemetry. |
| `PlatformRegistry` | `contracts/v2/PlatformRegistry.sol` | Ownable (now fronted by `HGMControlModule`) | `applyConfiguration`, `setPauser`, `setRegistrar`, `setBlacklist` | Tracks operator onboarding with per-registrar controls. |
| `ReputationEngine` | `contracts/v2/ReputationEngine.sol` | Ownable (now fronted by `HGMControlModule`) | `setScoringWeights`, `setPremiumThreshold`, `setCaller`, `setBlacklist` | Handles routing heuristics and blacklist enforcement. |
| `FeePool` | `contracts/v2/FeePool.sol` | Ownable | `setDistribution`, `setTreasury`, `setBurner` | No custody inside HGM; funds routed externally. |
| `OwnerConfigurator` | `contracts/v2/admin/OwnerConfigurator.sol` | Ownable2Step (operator) | `configure`, `configureBatch` | Low-level ABI forwarder used by owner consoles and scripts. |
| `HGMControlModule` | `contracts/v2/admin/HGMControlModule.sol` | Ownable2Step (timelock or Safe) | `pauseSystem`, `updateJobEconomics`, `updateJobAccess`, `updateJobFunding`, `configureStakeManager`, `configurePausers`, `configurePlatformRegistry`, `configureReputationEngine` | Aggregates governance knobs across registries, StakeManager, PlatformRegistry, and ReputationEngine. |

## Parameter ownership quick-reference

- **Economic levers** (job fees, validator rewards, stake minimums) are owned by
  governance and are accessible through `HGMControlModule.updateJobEconomics` and
  `HGMControlModule.configureStakeManager`.
- **Access metadata** (ENS/Merkle allow-lists, authentication cache windows)
  live on `JobRegistry` and are controlled through
  `HGMControlModule.updateJobAccess`.
- **Treasury and fee routing** stay synchronised via
  `HGMControlModule.updateJobFunding`, which updates both the registry and the
  StakeManager and optionally refreshes the tax policy reference.
- **Platform onboarding** knobs (`minPlatformStake`, registrar allow-list,
  blacklist) are updated in a single call with
  `HGMControlModule.configurePlatformRegistry`.
- **Reputation tuning** (weights, premium thresholds, authorised callers,
  blacklists) is centralised in
  `HGMControlModule.configureReputationEngine`.
- **Pausing** uses `HGMControlModule.configurePausers` to delegate pauser
  addresses and `HGMControlModule.pauseSystem` / `resumeSystem` for full stop /
  resume operations through `SystemPause`.

These control points feed the operator tooling found under `scripts/v2` and the
HGM demo playbooks so that contract owners can rotate governance, apply
emergency brakes, or adjust market parameters with auditable, deterministic
transactions.
