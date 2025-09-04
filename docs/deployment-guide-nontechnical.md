# AGI Jobs v2 Production Deployment Guide (Non‑Technical)

This guide provides step-by-step instructions for a non-technical user to deploy the AGI Jobs v2 smart contracts to a production (on-chain) environment using Etherscan. It highlights best practices such as true token burning and owner updatability and explains how to update this repository with your deployment information.

## Prerequisites
- **Ethereum wallet with ETH** for gas (e.g. MetaMask). The deploying wallet becomes the owner of every module; secure it carefully.
- **$AGIALPHA token address** – mainnet: `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`.
- **ENS details (optional)** – if restricting access via ENS subdomains, note the namehashes of `agent.agi.eth` and `club.agi.eth` and the mainnet addresses of the ENS registry (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`) and name wrapper (`0x253553366Da8546fC250F225fe3d25d0C782303b`).  Use `0x00…00` for open access.
- **Contract source code** – Solidity files are in this repository; they must be verified on Etherscan after deployment.
- **Basic Etherscan knowledge** – you will use the *Write Contract* tab to deploy and configure modules.

## Step 1 – Deploy contracts in order
Deploy each module via Etherscan and record its address.  Use `0x000…000` for module addresses that are not yet deployed.

1. **StakeManager** – parameters: `token`, `minStake`, `employerPct`, `treasuryPct`, `treasury`.
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

### Option B – Manual wiring
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
- **Owner updatability** – most parameters can be updated on‑chain via `set…` functions (e.g., fees, stake amounts, burn rate, validation windows). This allows safe tuning without redeployment.
- **Security** – consider using the optional `SystemPause` module for emergency stops and monitor emitted events for every change.
- **Trial run** – with small amounts, walk through posting a job, staking, validation and finalization to ensure everything is wired correctly.

## Step 4 – Update repository documentation
- Add each deployed address to `docs/deployment-addresses.json` and commit the file so future operators can reference it.
- Note any parameter changes you make via owner calls in your commit message or changelog.
- If a tax policy is configured, inform every participant to call `JobRegistry.acknowledgeTaxPolicy()` before interacting with the system.

## Legal compliance
Consult legal or tax professionals to ensure that operating the platform and collecting any fees complies with the regulations in your jurisdiction.

---
By following this guide a non‑technical administrator can deploy the full AGI Jobs v2 stack on Ethereum and retain the ability to fine‑tune economic parameters while relying on genuine token burning for deflationary incentives.

