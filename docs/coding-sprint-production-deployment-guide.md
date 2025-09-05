# Coding Sprint: AGI Jobs v2 Production Deployment Guide

This sprint delivers a non-technical, step-by-step deployment manual for the AGI Jobs v2 smart-contract suite on Ethereum. The guide will rely solely on Etherscan interactions and will document how owners can configure modules, prove true token burning, and keep parameters updatable.

## Objectives

- Explain prerequisites such as wallets, token address, ENS data and contract sources.
- Provide ordered deployment steps for all core and optional modules with constructor parameters.
- Describe module wiring using the one-call `ModuleInstaller` with a manual fallback.
- Outline post-deployment actions: contract verification, address recording, transferring ownership and testing.
- Highlight best practices implemented in v2: irreversible token burning via `$AGIALPHA.burn` and owner-controlled parameter updates.
- Instruct operators to update repository docs, including `docs/deployment-addresses.json`, with the final contract addresses.

## Tasks

1. **Draft Prerequisites Section**
   - List required tools, token address, ENS info and repository source files.
2. **Write Sequential Deployment Instructions**
   - Document constructor arguments and recommended defaults for StakeManager, ReputationEngine, IdentityRegistry, ValidationModule, DisputeModule, CertificateNFT, FeePool, PlatformRegistry, JobRouter, PlatformIncentives, TaxPolicy and JobRegistry.
3. **Explain Module Wiring**
   - Detail the `ModuleInstaller` ownership transfer and `initialize` call.
   - Provide manual setter calls if the installer is unavailable.
4. **Add Post-Deployment Configuration**
   - Include guidance on verifying contracts, recording addresses, enabling pause controls and transferring ownership to multisig/timelock if desired.
   - Emphasise token burning and owner updatability.
   - Outline a simple end-to-end job flow test to confirm modules interact correctly.
5. **Repository Update Guidance**
   - Instruct operators to commit the guide and updated `deployment-addresses.json` after deployment.

## Acceptance Criteria

- `docs/agi-jobs-v2-production-deployment-guide.md` contains the full non-technical deployment workflow and best-practice notes.
- The guide references token burning via `$AGIALPHA.burn` and explains how owners can adjust parameters post-deployment.
- Documentation includes steps for updating repository records with deployed addresses.
