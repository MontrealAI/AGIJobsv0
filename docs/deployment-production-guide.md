# AGI Jobs v2 Deployment Guide (Production)

This document walks a non-technical deployer through launching the AGI Jobs v2 contracts on Ethereum using only a browser and Etherscan.  It distills the full deployment process into clear steps and highlights the built‑in protections of the system.

## Prerequisites
- **Ethereum wallet with ETH** for gas (e.g. MetaMask).  The deploying wallet becomes the owner of every module – secure it.
- **$AGIALPHA token address** – mainnet address is `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`.
- **ENS details (optional)** – namehashes for `agent.agi.eth` and `club.agi.eth` if you plan to restrict access using ENS.
- **Contract source code** – all Solidity files are in this repository and must be verified on Etherscan after deployment.
- **Basic Etherscan familiarity** – you will use the *Write Contract* tab to deploy and configure modules.

## Step 1 – Deploy core modules
Deploy the contracts in the following order and record each address.  Use `0x000…000` for any module reference that is not yet deployed; they will be wired later.

1. **StakeManager** – parameters: `token` (AGIALPHA address), `minStake`, `employerPct`, `treasuryPct`, `treasury`.
2. **ReputationEngine** – constructor takes the `StakeManager` address.
3. **IdentityRegistry** *(optional)* – `_ensAddress`, `_nameWrapperAddress`, `_reputationEngine`, `_agentRootNode`, `_clubRootNode`.
4. **ValidationModule** – `_jobRegistry` placeholder, `stakeManager`, `commitWindow`, `revealWindow`, `minValidators`, `maxValidators`, `validatorPool`.
5. **DisputeModule** – `_jobRegistry` placeholder, `disputeFee`, `disputeWindow`, `moderator`.
6. **CertificateNFT** – NFT `name` and `symbol`.
7. **FeePool** – `_token`, `_stakeManager`, `_burnPct`, `_treasury`.
8. **PlatformRegistry** *(optional)* – `stakeManager`, `reputationEngine`, `minStake`.
9. **JobRouter** *(optional)* – `platformRegistry`.
10. **PlatformIncentives** *(optional)* – `stakeManager`, `platformRegistry`, `jobRouter`.
11. **TaxPolicy** *(optional)* – policy URI string.
12. **JobRegistry** – `validationModule`, `stakeManager`, `reputationEngine`, `disputeModule`, `certificateNFT`, `identityRegistry` (or `0`), `taxPolicy` (or `0`), `feePct`, `jobStake`, `ackModules`, `owner` (if required).

## Step 2 – Wire the modules
After deployment the contracts must be linked.

### Option A – ModuleInstaller (one transaction)
1. Deploy `ModuleInstaller`.
2. Transfer ownership of StakeManager, ValidationModule, DisputeModule, CertificateNFT, FeePool, PlatformRegistry, JobRouter and PlatformIncentives (and IdentityRegistry if used) to the installer using `transferOwnership`.
3. On the installer call `initialize(jobRegistry, stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)`.
4. If using IdentityRegistry, separately call `JobRegistry.setIdentityRegistry` and `ValidationModule.setIdentityRegistry`.
5. Ownership is returned to your wallet automatically; verify each module’s stored addresses under the *Read* tab.

### Option B – manual wiring
Call the following setters from the owner account:
- `JobRegistry.setModules(validation, stake, reputation, dispute, certificate, feePool, [])`
- `StakeManager.setJobRegistry(jobRegistry)`
- `ValidationModule.setJobRegistry(jobRegistry)`
- `DisputeModule.setJobRegistry(jobRegistry)`
- `CertificateNFT.setJobRegistry(jobRegistry)` and `CertificateNFT.setStakeManager(stakeManager)`
- `StakeManager.setDisputeModule(disputeModule)`
- Link IdentityRegistry and TaxPolicy with `JobRegistry.setIdentityRegistry`, `ValidationModule.setIdentityRegistry`, `JobRegistry.setTaxPolicy`, `DisputeModule.setTaxPolicy`
- If using platform modules: `PlatformRegistry.setRegistrar(platformIncentives, true)` and `JobRouter.setRegistrar(platformIncentives, true)`

## Step 3 – Post‑deployment tasks & best practices
- **Verify** all contracts on Etherscan for transparency.
- **Optional governance** – transfer ownership to a multisig or timelock once configuration is complete.
- **True token burning** – `FeePool` and `StakeManager` call the ERC‑20 `burn()` function. Setting a non‑zero `burnPct` in `FeePool` permanently destroys that percentage of each fee instead of sending it to a dead address.
- **Owner updatability** – most parameters can be updated on‑chain via `set…` functions (e.g., fees, stake amounts, burn rate, validation windows).  This allows safe tuning without redeployment.
- **Security** – consider using the optional `SystemPause` module for emergency stops and monitor emitted events for every change.
- **Trial run** – with small amounts, walk through posting a job, staking, validation and finalisation to ensure everything is wired correctly.

## Step 4 – Record keeping
Update `docs/deployment-addresses.json` (or your own record) with the addresses of all deployed modules and note any parameter changes made via owner calls.
- If a tax policy is configured, inform every participant to call `JobRegistry.acknowledgeTaxPolicy()` before interacting with the system.

## Legal compliance
Consult legal or tax professionals to ensure that operating the platform and collecting any fees complies with the regulations in your jurisdiction.

---
By following this guide a non‑technical administrator can deploy the full AGI Jobs v2 stack on Ethereum and retain the ability to fine‑tune economic parameters while relying on genuine token burning for deflationary incentives.
