# AGI Jobs v2 Production Deployment Guide (Non-Technical)

This guide walks a non-technical administrator through deploying the AGI Jobs v2 smart contracts on Ethereum using only a web browser and Etherscan.  It also explains best practices such as true token burning, owner updatability and how to record your deployment in this repository.

### Best Practices in AGI Jobs v2
- **True token burning**: FeePool and StakeManager call the $AGIALPHA `burn()` function, permanently removing tokens instead of sending them to a dead address.
- **Owner updatability**: The contract owner can adjust fees, stakes and other parameters via `set...` functions without redeploying.

## Prerequisites
- **Ethereum wallet with ETH** for gas (e.g. MetaMask).  The deploying wallet becomes the owner of every module – secure it carefully.
- **$AGIALPHA token address** – mainnet address: `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`.
- **ENS details (optional)** – if restricting access via ENS subdomains prepare the namehashes for `agent.agi.eth` and `club.agi.eth`, plus the ENS registry (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`) and name wrapper (`0x253553366Da8546fC250F225fe3d25d0C782303b`).  Use `0x00` for open access.
- **Contract source code** – Solidity files live in this repository and must be verified on Etherscan after deployment.
- **Basic Etherscan familiarity** – you will use the *Write Contract* tab to deploy and configure modules.

## Overview of AGI Jobs v2 Architecture
AGI Jobs v2 is modular.  Each contract manages one aspect of the marketplace:
- **StakeManager** – staking, escrow of job rewards and slashing.
- **JobRegistry** – main registry tracking job lifecycle.
- **ValidationModule** – validator selection and commit–reveal voting.
- **DisputeModule** – dispute escalation and resolution.
- **ReputationEngine** – reputation scores and blacklisting.
- **CertificateNFT** – NFTs certifying completed jobs.
- **IdentityRegistry** *(optional)* – ENS subdomain checks and allowlists.
- **FeePool** – collects protocol fees and optionally burns a portion.
- **PlatformRegistry & JobRouter** *(optional)* – manage multiple front-end platforms and route jobs to them.
- **PlatformIncentives** *(optional)* – helper that combines staking and registration for platforms.
- **TaxPolicy** *(optional)* – on-chain acknowledgment of terms of service or tax policy.

## Step 1: Deploy the Core Contracts in Order
Deploy each contract through Etherscan and note its address.  Use `0x000...000` as placeholders for module addresses that are not yet deployed.

1. **StakeManager**
   - Parameters: `token` ($AGIALPHA address), `minStake`, `employerPct`, `treasuryPct`, `treasury`.
   - Enter `0` for `minStake`, `employerPct` and `treasuryPct` to use defaults that send all slashed funds to the treasury.
   - Supply `0x0` for any module address placeholders that will be wired later.
2. **ReputationEngine**
   - Constructor: `stakeManager` address.
3. **IdentityRegistry** *(optional)*
   - Parameters: `_ensAddress`, `_nameWrapperAddress`, `_reputationEngine`, `_agentRootNode`, `_clubRootNode`.
   - Use `0x00` for any ENS gates you wish to disable.
4. **ValidationModule**
   - Parameters: `_jobRegistry` placeholder, `stakeManager`, `commitWindow`, `revealWindow`, `minValidators`, `maxValidators`, `validatorPool` (usually empty array).
   - Recommended defaults: `commitWindow` = `86400`, `revealWindow` = `86400`, `minValidators` = `1`, `maxValidators` = `3`.
5. **DisputeModule**
   - Parameters: `_jobRegistry` placeholder, `disputeFee`, `disputeWindow`, `moderator` (or `0x0`).
   - Set `disputeFee` to `0` for a free dispute process or provide a value in wei (e.g. `1e18` for 1 $AGIALPHA).
6. **CertificateNFT**
   - Parameters: collection `name` and `symbol` (e.g. "AGI Jobs Certificate", "AGIJOB").
7. **FeePool**
   - Parameters: `_token`, `_stakeManager`, `_burnPct`, `_treasury`.
   - `burnPct` is in basis points (`500` = 5%).  Use `0` to disable burning initially.
8. **PlatformRegistry** *(optional)*
   - Parameters: `stakeManager`, `reputationEngine`, `minStake`.
9. **JobRouter** *(optional)*
   - Parameters: `platformRegistry`.
10. **PlatformIncentives** *(optional)*
    - Parameters: `stakeManager`, `platformRegistry`, `jobRouter`.
11. **TaxPolicy** *(optional)*
    - Parameter: policy URI string.
12. **JobRegistry**
    - Parameters: `validationModule`, `stakeManager`, `reputationEngine`, `disputeModule`, `certificateNFT`, `identityRegistry` (or `0`), `taxPolicy` (or `0`), `feePct`, `jobStake`, `ackModules`, `owner` (if required).
    - A `feePct` of `500` equals a 5% protocol fee.  `jobStake` is typically `0` unless employers must stake.

## Step 2: Wire the Modules Together
After deployment the contracts must learn each other's addresses.

### Option A: Automatic Wiring with ModuleInstaller
1. Deploy `ModuleInstaller`.
2. For StakeManager, ValidationModule, DisputeModule, CertificateNFT, FeePool, PlatformRegistry, JobRouter, PlatformIncentives and IdentityRegistry (if used) call `transferOwnership(installer)`.
3. On the installer call `initialize(jobRegistry, stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)`.
   - This single call wires all module addresses, registers `PlatformIncentives` with `PlatformRegistry` and `JobRouter`, assigns the `FeePool` and optional `TaxPolicy`, and then hands ownership of every module back to your wallet.
   - Execute `initialize` from the same wallet that deployed `ModuleInstaller`; it is owner-only and can run only once.
   - Use `0x0` for any optional modules you chose not to deploy; the installer will skip them.
4. If using IdentityRegistry, separately call `JobRegistry.setIdentityRegistry` and `ValidationModule.setIdentityRegistry`.
5. After initialization, verify each module's owner and stored addresses via the *Read* tabs and emitted events.

### Option B: Manual Wiring
Invoke the following setters from the owner account:
- `JobRegistry.setModules(validation, stake, reputation, dispute, certificate, feePool, [])`
- `StakeManager.setJobRegistry(jobRegistry)`
- `ValidationModule.setJobRegistry(jobRegistry)`
- `DisputeModule.setJobRegistry(jobRegistry)`
- `CertificateNFT.setJobRegistry(jobRegistry)`
- `CertificateNFT.setStakeManager(stakeManager)`
- `StakeManager.setDisputeModule(disputeModule)`
- `JobRegistry.setIdentityRegistry(identityRegistry)` and `ValidationModule.setIdentityRegistry(identityRegistry)` (if used)
- `JobRegistry.setTaxPolicy(taxPolicy)` and `DisputeModule.setTaxPolicy(taxPolicy)` (if used)
- For platform modules: `PlatformRegistry.setRegistrar(platformIncentives, true)` and `JobRouter.setRegistrar(platformIncentives, true)`

## Step 3: Post-Deployment Configuration and Best Practices
- **Verify contracts on Etherscan.**  Publish source for every module so the *Read* and *Write* views are available.
- **Consider multisig/timelock ownership.**  Transfer ownership to a governance address once configuration is complete.
### True Token Burning
`FeePool` and `StakeManager` invoke the ERC‑20 `burn()` function so any portion marked for burning is permanently removed from total supply rather than sent to a dead address.  You can update the burn rate at any time with `FeePool.setBurnPct`.

### Owner Updatability
Almost every operational parameter can be changed by the owner without redeploying.  Adjust fees, stake requirements, burn percentages, validation windows or allowlists through `set...` functions such as `JobRegistry.setFeePct`, `StakeManager.setMinStake...` or `ValidationModule.setCommitWindow`.

- **Security.**  Optional `SystemPause` can halt activity in emergencies.  Monitor emitted events to audit changes.
- **Trial run.**  Use small amounts or a testnet account to walk through posting a job, staking, validation and finalization:
   1. **Post a job** – From an employer wallet approve the reward to `StakeManager` and call `JobRegistry.createJob` or `acknowledgeAndCreateJob` with the reward amount and metadata URI.
   2. **Stake & apply** – An Agent calls `StakeManager.depositStake` (role `0`) and then `JobRegistry.applyForJob` or `stakeAndApply` supplying any ENS subdomain data or empty values if ENS is disabled.
   3. **Validate** – Validators stake (role `1`) then call `ValidationModule.commitValidation` followed later by `ValidationModule.revealValidation`.
   4. **Finalize** – After the reveal window anyone may call `ValidationModule.finalize`; `StakeManager` pays the Agent, sends protocol fees to `FeePool` and burns the configured percentage.
   5. **Dispute** – To test disputes, raise one via `JobRegistry.raiseDispute` and resolve it through `DisputeModule.resolve` (or a moderator/committee if configured).
- **Final verification.**  Confirm each module reports the correct addresses via their `Read` interfaces.
- **Record keeping.**  Log all contract addresses and parameter changes.  Update `docs/deployment-addresses.json` with your deployment.
- **Legal compliance.**  Consult professionals to ensure operations comply with local regulations.

## Step 4: Update Repository Documentation
Add your deployment addresses to `docs/deployment-addresses.json` and commit them.  Include any parameter changes in commit messages or a changelog.  If a tax policy is set, instruct users to call `JobRegistry.acknowledgeTaxPolicy()` before interacting.

By following this guide you can launch the full AGI Jobs v2 platform on Ethereum and maintain control over critical parameters while relying on genuine token burning for deflationary incentives.
