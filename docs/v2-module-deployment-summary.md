# AGIJobs v2 Module Deployment Summary

For detailed production deployment instructions see [deployment-production-guide.md](deployment-production-guide.md). For an explanation of module responsibilities and how they interact, refer to [architecture-v2.md](architecture-v2.md).

This note outlines a minimal sequence for deploying the modular v2 stack
and wiring contracts together. The `$AGIALPHA` token, ENS roots, Merkle
roots and all numeric parameters can be updated later by the owner.

## 1. Deployment order

1. **StakeManager** – pass the staking token and treasury details.
2. **ReputationEngine** – constructor accepts the `StakeManager` address.
3. **IdentityRegistry** – supply ENS registry, NameWrapper, `StakeManager`
   and the initial root nodes or `0x00`.
4. **ValidationModule** – deploy with placeholder `jobRegistry = 0` and
   the `StakeManager` address.
5. **DisputeModule** – deploy with `jobRegistry = 0` and desired fee.
6. **CertificateNFT** – deploy with name and symbol.
7. **FeePool** – point at the staking token and `StakeManager`.
8. **JobRegistry** – no constructor args.

## 2. Wiring

1. On `JobRegistry` call
   `setModules(stakeManager, validationModule, reputationEngine,
disputeModule, certificateNFT, feePool)`.
2. Call `setJobRegistry(jobRegistry)` on `StakeManager`,
   `ValidationModule`, `DisputeModule` and `CertificateNFT`.
3. On `ValidationModule` also call `setIdentityRegistry(identityRegistry)`.
4. Verify `ModulesUpdated` and `JobRegistrySet` events before allowing
   user funds.

## 3. Post-deploy configuration

1. **Token rotation** – legacy deployments may change the staking token by calling
2. **ENS & Merkle updates** – adjust namehashes and allowlists through
   `IdentityRegistry.setAgentRootNode`, `setClubRootNode`,
   `setAgentMerkleRoot` and `setValidatorMerkleRoot`.
3. **Parameter tuning** – each module exposes `onlyOwner` setters such as
   `StakeManager.setMinStake`, `JobRegistry.setFeePct` and
   `ValidationModule.setCommitWindow`.

Following this order ensures a functioning deployment while keeping all
critical addresses and parameters modifiable by the contract owner.
