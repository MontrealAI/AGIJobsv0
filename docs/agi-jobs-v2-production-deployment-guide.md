# AGI Jobs v2 Deployment Guide (Production)

This guide walks a non-technical operator through deploying the **AGI Jobs v2** smart-contract suite on Ethereum using only a browser and Etherscan.  It also highlights key best practices such as true token burning and owner updatability.

## 1. Prerequisites
- **Ethereum wallet** (e.g. MetaMask) with enough ETH for gas; it becomes the owner of all contracts.
- **$AGIALPHA token address** (canonical mainnet: `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`).
- **ENS details** if restricting access (namehashes for `agent.agi.eth` and `club.agi.eth`, ENS registry `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`, and name wrapper `0x253553366Da8546fC250F225fe3d25d0C782303b`).
- **Contract sources** from this repository for verification.
- **Basic familiarity with the “Contract → Deploy” and “Write Contract” tabs** on Etherscan.

Keep a text file or spreadsheet open to record every contract address as you deploy.

## 2. Deploy Modules in Order
Deploy each contract via **Contract → Deploy** on Etherscan, supplying constructor parameters shown below.  After each deployment, copy the resulting address to your notes.

1. **StakeManager** – requires `$AGIALPHA` token address, optional minimum stake and slashing percents, and a treasury address.
2. **ReputationEngine** – constructor needs the StakeManager address.
3. **IdentityRegistry** *(optional)* – constructor needs ENS registry, name wrapper, ReputationEngine, and ENS root nodes (or `0x00…00` for open access).
4. **ValidationModule** – pass `0x0` for JobRegistry (wired later), StakeManager address, and timing/validator counts.
5. **DisputeModule** – pass `0x0` for JobRegistry, optional dispute fee/window, and an initial moderator.
6. **CertificateNFT** – NFT name and symbol.
7. **FeePool** – token address, StakeManager address, burn percentage (basis points), and treasury.
8. **PlatformRegistry** *(optional)* – StakeManager address, ReputationEngine address, and minimum stake.
9. **JobRouter** *(optional)* – PlatformRegistry address.
10. **PlatformIncentives** *(optional)* – StakeManager, PlatformRegistry, and JobRouter addresses.
11. **TaxPolicy** *(optional)* – URI or text for the policy users must acknowledge.
12. **JobRegistry** – constructor takes ValidationModule, StakeManager, ReputationEngine, DisputeModule, CertificateNFT, IdentityRegistry (`0x0` if unused), TaxPolicy (`0x0` if unused), fee percentage (basis points), job stake, acknowledgement module array (usually `[]`), and owner address (if required).

## 3. Wire Modules Together
### Recommended: `ModuleInstaller`
1. Deploy `ModuleInstaller`.
2. For every module above, call `transferOwnership(installerAddress)` (or `setGovernance` for JobRegistry if provided).
3. On the installer, call `initialize(jobRegistry, stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)` using `0x0` for any module you skipped.
4. Call `JobRegistry.setIdentityRegistry` and `ValidationModule.setIdentityRegistry` if you deployed IdentityRegistry.
5. Ownership of all modules automatically returns to your wallet.

### Manual Wiring Fallback
If you skip the installer, connect contracts individually:
- `JobRegistry.setModules(validation, stake, reputation, dispute, certificate, feePool, [])`.
- `StakeManager.setJobRegistry(jobRegistry)`.
- `ValidationModule.setJobRegistry(jobRegistry)`.
- `DisputeModule.setJobRegistry(jobRegistry)`.
- `CertificateNFT.setJobRegistry(jobRegistry)`.
- `CertificateNFT.setStakeManager(stakeManager)`.
- `StakeManager.setDisputeModule(disputeModule)`.
- Optional: `JobRegistry.setIdentityRegistry` and `ValidationModule.setIdentityRegistry`.
- Optional: authorise `PlatformIncentives` on `PlatformRegistry` and `JobRouter` via `setRegistrar`.

Verify wiring by reading stored addresses on Etherscan.

## 4. Post‑Deployment Tasks & Best Practices
- **Verify contracts** on Etherscan so the source matches the deployed bytecode.
- **Record addresses** in `docs/deployment-addresses.json` (update and commit to this repository).
- **True token burning:** whenever a burn percentage is set in `FeePool` or `StakeManager`, tokens are destroyed via `$AGIALPHA.burn`, reducing total supply rather than sending to a dead address.
- **Owner updatability:** as the contract owner you may adjust parameters (fee percentages, stake limits, burn rate, validation windows, allowlists, etc.) through the various `set...` functions.  Consider transferring ownership to a multisig for additional safety.
- **Security checks:** test a small job end‑to‑end, monitor emitted events, and keep a pause mechanism (see `docs/system-pause.md`) ready.

## 5. Updating Repository Documentation
After a successful deployment:
1. Add the final contract addresses to `docs/deployment-addresses.json`.
2. Commit this guide and the updated addresses so future operators can replicate the setup.

Following these steps will allow you to launch AGI Jobs v2 on Ethereum with minimal technical overhead while retaining full control over platform parameters and ensuring tokens are truly burned when configured.
