# AGI Jobs v2 Deployment Guide (Production)

This guide walks a non-technical administrator through deploying the AGI Jobs v2 smart contracts on Ethereum using only a web browser and Etherscan. It also explains best practices such as true token burning, owner updatability and how to record your deployment in this repository.

All steps are executed directly from Etherscan's web interface—no command line tools or local scripts are required. For a deeper explanation of how the modules interact, see [architecture-v2.md](architecture-v2.md). This guide focuses strictly on deployment steps.

### Best Practices in AGI Jobs v2

- **True token burning**: FeePool and StakeManager call the $AGIALPHA `burn()` function, permanently removing tokens instead of sending them to a dead address.
- **Owner updatability**: The contract owner can adjust fees, stakes and other parameters via `set...` functions without redeploying.

## Prerequisites

- **Ethereum wallet with ETH** for gas (e.g. MetaMask). The deploying wallet becomes the owner of every module – secure it carefully.
- **$AGIALPHA token address** – mainnet address: `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`.
- **Burnability preflight** – run `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/check-burnable.ts` to ensure the token supports `burn(uint256)`; the script exits with an error if not.
- **ENS details (optional)** – if restricting access via ENS subdomains prepare the namehashes for `agent.agi.eth` and `club.agi.eth`, plus the ENS registry (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`) and name wrapper (`0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`). Use `0x00` for open access.
- **Contract source code** – Solidity files live in this repository and must be verified on Etherscan after deployment.
- **Basic Etherscan familiarity** – you will use the _Write Contract_ tab to deploy and configure modules.
- **Governance account** – a multisig or timelock that will ultimately own the modules.
- **Etherscan API key & local build** – run `npm install` and `npx hardhat compile` so bytecode matches when verifying with your API key.

## Step 1: Deploy the Core Contracts in Order

Deploy each contract through Etherscan and note its address. Verify the source code after deployment and record each address (for example in `deployment-addresses.json`). Use `0x000...000` as placeholders for module addresses that are not yet deployed.

1. **StakeManager**
   - Parameters: `token` ($AGIALPHA address), `minStake`, `employerPct`, `treasuryPct`, `treasury`.
   - Enter `0` for `minStake`, `employerPct` and `treasuryPct` to use defaults that send all slashed funds to the treasury.
   - Supply `0x0` for any module address placeholders that will be wired later.
2. **ReputationEngine**
   - Constructor: `stakeManager` address.
3. **IdentityRegistry** _(optional)_
   - Parameters: `_ensAddress`, `_nameWrapperAddress`, `_reputationEngine`, `_agentRootNode`, `_clubRootNode`.
   - Use `0x00` for any ENS gates you wish to disable.
   - `verifyAgent`/`verifyValidator` return `(ok, node, viaWrapper, viaMerkle)` and emit `ENSVerified`; modules that call them re-emit `AgentIdentityVerified` or `ValidatorIdentityVerified`.
4. **ValidationModule**
   - Parameters: `_jobRegistry` placeholder, `stakeManager`, `commitWindow`, `revealWindow`, `minValidators`, `maxValidators`, `validatorPool` (usually empty array).
   - Recommended defaults: `commitWindow` = `1800`, `revealWindow` = `1800`, `minValidators` = `3`, `maxValidators` = `5`.
5. **DisputeModule**
   - Parameters: `_jobRegistry` placeholder, `disputeFee`, `disputeWindow`, `moderator` (or `0x0`).
   - Set `disputeFee` to `0` for a free dispute process or provide a value in wei (e.g. `1e18` for 1 $AGIALPHA).
6. **CertificateNFT**
   - Parameters: collection `name` and `symbol` (e.g. "AGI Jobs Certificate", "AGIJOB").
7. **FeePool**
   - Parameters: `_token`, `_stakeManager`, `_burnPct`, `_treasury`.
   - `burnPct` is a percentage (`0`–`100`). Enter `1` for the 1% pilot baseline; use `0` to disable burning entirely.
8. **PlatformRegistry** _(optional)_
   - Parameters: `stakeManager`, `reputationEngine`, `minStake`.
9. **JobRouter** _(optional)_
   - Parameters: `platformRegistry`.
10. **PlatformIncentives** _(optional)_
    - Parameters: `stakeManager`, `platformRegistry`, `jobRouter`.
11. **TaxPolicy** _(optional)_
    - Parameter: policy URI string.
12. **JobRegistry**
    - Parameters: `validationModule`, `stakeManager`, `reputationEngine`, `disputeModule`, `certificateNFT`, `identityRegistry` (or `0`), `taxPolicy` (or `0`), `feePct`, `jobStake`, `ackModules`, `owner` (if required).
    - A `feePct` of `5` equals a 5% protocol fee. `jobStake` is typically `0` unless employers must stake.

## Step 2: Wire the Modules Together

After deployment the contracts must learn each other's addresses.

### Option A: Automatic Wiring with ModuleInstaller

1. Deploy `ModuleInstaller` (see [module-installer.md](module-installer.md) for more details).
2. For StakeManager, ValidationModule, DisputeModule, CertificateNFT, FeePool, PlatformRegistry, JobRouter, PlatformIncentives and IdentityRegistry (if used) call `transferOwnership(installer)`.
3. On the installer call `initialize(jobRegistry, stakeManager, validationModule, reputationEngine, disputeModule, certificateNFT, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)`.
   - This single call wires all module addresses, registers `PlatformIncentives` with `PlatformRegistry` and `JobRouter`, assigns the `FeePool` and optional `TaxPolicy`, and then hands ownership of every module back to your wallet.
   - Execute `initialize` from the same wallet that deployed `ModuleInstaller`; it is owner-only and can run only once.
   - Use `0x0` for any optional modules you chose not to deploy; the installer will skip them.
4. If using IdentityRegistry, separately call `JobRegistry.setIdentityRegistry` and `ValidationModule.setIdentityRegistry`.
5. After initialization, verify each module's owner and stored addresses via the _Read_ tabs and emitted events.

### Option B: Manual Wiring

Invoke the following setters from the owner account:

- `JobRegistry.setModules(validation, stake, reputation, dispute, certificate, feePool, [])`
- `StakeManager.setJobRegistry(jobRegistry)`
- `ValidationModule.setJobRegistry(jobRegistry)`
- `DisputeModule.setJobRegistry(jobRegistry)`
- `CertificateNFT.setJobRegistry(jobRegistry)` (requires `JobRegistry.version() == 2`)
- `CertificateNFT.setStakeManager(stakeManager)`
- `StakeManager.setDisputeModule(disputeModule)`
- `JobRegistry.setIdentityRegistry(identityRegistry)` and `ValidationModule.setIdentityRegistry(identityRegistry)` (if used)
- `JobRegistry.setTaxPolicy(taxPolicy)` and `DisputeModule.setTaxPolicy(taxPolicy)` (if used)
- For platform modules: `PlatformRegistry.setRegistrar(platformIncentives, true)` and `JobRouter.setRegistrar(platformIncentives, true)`

## Step 3: Post-Deployment Configuration and Best Practices

- **Verify contracts on Etherscan.** Publish source for every module so the _Read_ and _Write_ views are available.
- **Consider multisig/timelock ownership.** Transfer ownership to a governance address once configuration is complete. The repository includes `scripts/transfer-ownership.ts` to batch transfer every module's ownership.

- **Identity sanity check.** On the IdentityRegistry page use the _Read Contract_ tab and call `verifyAgent` or `verifyValidator`. Etherscan shows four return values `(ok, node, viaWrapper, viaMerkle)` and emits `ENSVerified`.

  ```
  verifyAgent("0xAgent", "alice", [])
  // 0: bool true
  // 1: bytes32 0x2641541d3a011e8650c9d362d903c5e4149353eb4cb34761875be4b7455d3aca
  // 2: bool false   // viaWrapper
  // 3: bool false   // viaMerkle
  ```

  When jobs call these helpers the platform also emits `AgentIdentityVerified` or `ValidatorIdentityVerified`.

### True Token Burning

`FeePool` and `StakeManager` invoke the ERC‑20 `burn()` function so any portion marked for burning is permanently removed from total supply rather than sent to a dead address. You can update the burn rate at any time with `FeePool.setBurnPct`.

#### Adjust burn percentage

On the **FeePool** contract's Etherscan page use the _Write Contract_ tab and call `setBurnPct` with the new percentage value (e.g. `5` for 5%).
Source: [`contracts/v2/FeePool.sol`](../contracts/v2/FeePool.sol)

### Fee Handling & Treasury

`JobRegistry` forwards protocol fees to `FeePool`. When an employer finalizes a job, the pool burns the configured `burnPct` and holds the remainder for platform stakers. `StakeManager.setTreasury`, `JobRegistry.setTreasury`, and `FeePool.setTreasury` route slashed stakes or blacklisted payouts to a governance-controlled treasury, while any undistributed fees are burned if no stakers are present. The platform never keeps fees or burned tokens. Adjustments must flow through the owner ops workflow (`npm run owner:plan`, review, then `npm run owner:update-all`) so the audit trail covers every change.

### Owner Updatability

Almost every operational parameter can be changed by the owner without redeploying. Adjust fees, stake requirements, burn percentages, validation windows or allowlists through `set...` functions such as `JobRegistry.setFeePct`, `StakeManager.setMinStake...` or `ValidationModule.setCommitWindow`.

#### Update minimum stake

Open the **StakeManager** contract in Etherscan and, under _Write Contract_, invoke `setMinStake` with the desired stake amount in wei.
Source: [`contracts/v2/StakeManager.sol`](../contracts/v2/StakeManager.sol)

#### Adjust protocol fee

On the **JobRegistry** contract's Etherscan page use _Write Contract_ → `setFeePct` to change the protocol fee percentage (0–100).
Source: [`contracts/v2/JobRegistry.sol`](../contracts/v2/JobRegistry.sol)

- **Security.** Contracts rely on OpenZeppelin components like `Ownable`, `ReentrancyGuard` and `SafeERC20`. The modular design lets you replace a faulty module. Optional [`SystemPause`](system-pause.md) can halt activity in emergencies. Monitor emitted events to audit changes.
- **Trial run.** Use small amounts or a testnet account to walk through posting a job, staking, validation and finalization:
  1.  **Post a job** – From an employer wallet approve the reward to `StakeManager` and call `JobRegistry.createJob` or `acknowledgeAndCreateJob` with the reward amount and metadata URI.
  2.  **Stake & apply** – An Agent calls `StakeManager.depositStake` (role `0`) and then `JobRegistry.applyForJob` or `stakeAndApply` supplying any ENS subdomain data or empty values if ENS is disabled.
  3.  **Validate** – Validators stake (role `1`) then call `ValidationModule.commitValidation` followed later by `ValidationModule.revealValidation`.
  4.  **Finalize** – The employer calls `JobRegistry.acknowledgeAndFinalize(jobId)` from their own wallet; `StakeManager` pays the Agent, sends protocol fees to `FeePool` and burns the configured percentage.
  5.  **Dispute** – To test disputes, raise one via `JobRegistry.raiseDispute` and resolve it through `DisputeModule.resolve` (or a moderator/committee if configured).
- **Final verification.** Confirm each module reports the correct addresses via their `Read` interfaces or run `npm run wire:verify -- --network <network>` to check automatically against `config/agialpha.<network>.json` and `config/ens.<network>.json`.
- **Record keeping.** Log all contract addresses and parameter changes, updating [`deployment-addresses.json`](deployment-addresses.json) and noting changes in commit messages or the changelog whenever any parameter or address changes. Maintain an admin log of post-deployment actions for auditability. For scripted deployments see [`deployment-addresses.md`](deployment-addresses.md).
- **Legal compliance.** Consult professionals to ensure operations comply with local regulations.

## Step 4: Update Repository Documentation

Add your deployment addresses to [`deployment-addresses.json`](deployment-addresses.json) and commit them. Whenever any parameter or address changes, update this file and document the change in the changelog or commit message. If a tax policy is set, instruct users to call `JobRegistry.acknowledgeTaxPolicy()` before interacting.

By following this guide you can launch the full AGI Jobs v2 platform on Ethereum and maintain control over critical parameters while relying on genuine token burning for deflationary incentives.

## Post-Deployment Checklist

- [ ] Verify all contracts on Etherscan.
- [ ] Record and log every deployed address.
- [ ] Transfer ownership to a secure governance account.
- [ ] Configure and document the current burn rate.

Update [`deployment-addresses.json`](deployment-addresses.json) and note the change in the changelog or commit message whenever any parameter or address changes. Maintain an admin log of all post-deployment changes for auditability.
