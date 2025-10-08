# Owner Control Matrix

> **Status:** Production reference. Pair this matrix with
> [owner-control-authority-reference.md](owner-control-authority-reference.md)
> for the canonical, source-linked list of setters surfaced through the
> OwnerConfigurator and governance scripts.

## Overview

The AGI Jobs v2 system preserves an owner-first operating model. A single Owner address (EOA or Safe) must retain the ability to configure, pause, upgrade, and recover assets across every module. Ownership is mediated through `Ownable2Step` on all upgradeable implementations and a central `OwnerConfigurator` facade for non-technical operators.

### Operating Principles

1. **Single Source of Truth** – Every mutable parameter appears here with the contract that guards it and the emitted `ParameterUpdated` event identifier.
2. **Idempotent Batched Updates** – The configurator will expose batch setters that no-op when the requested value already matches on-chain state.
3. **Auditability** – Each change must emit `ParameterUpdated(name, oldValue, newValue, msg.sender)` and be indexed for the owner console and subgraph.
4. **Safe Compatibility** – All configuration flows will be Safe Transaction Builder compatible and surfaced in the Owner Console UI.

---

## Owner Configurator Surface

| Module | Control themes | Notes |
| ------ | -------------- | ----- |
| JobRegistry | Module wiring, ENS roots & allowlists, treasury/fee splits, lifecycle guard rails, acknowledger ACLs, pause control. | Full setter list lives in the [authority reference](owner-control-authority-reference.md) and matches `JobRegistry`’s `onlyGovernance` surface.【F:contracts/v2/JobRegistry.sol†L1096-L1359】 |
| ValidationModule | Commit/reveal timing, validator pool composition, slashing, randomness coordinator wiring, local pauser. | Owned by governance Safe; see the authority reference plus `config/validation-module*.json`.【F:contracts/v2/ValidationModule.sol†L254-L806】 |
| StakeManager | Staking minima, fee distribution, treasury routes, slash percentages, module wiring. | Ensure `config/stake-manager*.json` stays aligned; CI checks access-control coverage on these setters.【F:contracts/v2/StakeManager.sol†L720-L1439】 |
| FeePool | Reward routing, burn ratios, treasury allowlist, tax policy pointer. | Guarded by `onlyOwner`; governance Safe controls these knobs via OwnerConfigurator.【F:contracts/v2/FeePool.sol†L154-L441】 |
| RewardEngineMB & Thermostat | Epoch reward splits, μ adjustments, thermodynamic PID tuning, settlement allowlists. | Update alongside `config/reward-engine*.json` & `config/thermostat*.json`; scripts enforce checksum hashes before execution.【F:contracts/v2/RewardEngineMB.sol†L112-L227】【F:contracts/v2/Thermostat.sol†L52-L107】 |
| IdentityRegistry | ENS roots, Merkle allowlists, attestor / additional identity ACLs. | Maintains non-technical ability to onboard or quarantine participants quickly.【F:contracts/v2/IdentityRegistry.sol†L161-L287】 |
| Energy & Monitoring | EnergyOracle signer sets, Hamiltonian window/reset, SystemPause wiring, CertificateNFT mint policy. | Each module has dedicated JSON manifests and CLI helpers; see authority reference for exact setter names.【F:contracts/v2/EnergyOracle.sol†L21-L57】【F:contracts/v2/HamiltonianMonitor.sol†L38-L144】【F:contracts/v2/SystemPause.sol†L16-L168】【F:contracts/v2/CertificateNFT.sol†L41-L115】 |

---

## Event Naming

All setter actions emit a canonical `ParameterUpdated(bytes32 indexed name, bytes32 indexed field, bytes oldValue, bytes newValue, address indexed actor)` event. The `name` encodes the module (e.g., `JOB_REGISTRY`) and `field` encodes the parameter (e.g., `SET_VALIDATION_MODULE`).

## Next Steps

1. Use `npm run owner:parameters` to regenerate the authoritative setter matrix whenever Solidity surfaces change and commit the diff alongside contract updates.
2. Keep every mutable module under `Ownable2Step`/`Governable` ownership so governance can rotate controllers without redeploying logic.
3. Maintain ≥90 % overall coverage and full access-control coverage (enforced in CI) so regressions in owner-only modifiers are caught before merge.
4. Sync the Owner Console and Safe template generator with the [authority reference](owner-control-authority-reference.md) to keep non-technical flows aligned with on-chain reality.

