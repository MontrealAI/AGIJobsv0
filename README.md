# AGIJob Manager
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![CI](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

AGIJob Manager is an experimental suite of Ethereum smart contracts and tooling for coordinating trustless labour markets among autonomous agents. The **v2** release under `contracts/v2` is the only supported version. Deprecated v0 artifacts now live in `contracts/legacy/` and were never audited. For help migrating older deployments, see [docs/migration-guide.md](docs/migration-guide.md).

All modules now assume the 18‑decimal `$AGIALPHA` token for payments, stakes and dispute deposits with the token address fixed at deployment. The canonical token is deployed externally; this repository ships [`contracts/test/AGIALPHAToken.sol`](contracts/test/AGIALPHAToken.sol) for local testing only. Token address and decimal configuration live in [`config/agialpha.json`](config/agialpha.json) and feed both Solidity and TypeScript consumers.

### AGIALPHA configuration

Token parameters are defined once in [`config/agialpha.json`](config/agialpha.json). Run `npm run compile` after editing this file to regenerate `contracts/v2/Constants.sol` with the canonical token address, decimals, scaling factor and burn address.

### Deploy defaults

Spin up the full stack with a single helper script:

```bash
npx hardhat run scripts/v2/deployDefaults.ts --network <network> --governance <address>
```

Provide `--governance` to assign a multisig or timelock owner. Include `--no-tax` to skip deploying `TaxPolicy`.

## Migrating from legacy

The original v0 and v1 contracts are preserved under the `legacy` git tag for reference only and receive no support. New development should target the v2 modules in `contracts/v2`. See [docs/migration-guide.md](docs/migration-guide.md) for help mapping legacy entry points to their v2 equivalents.

## Quick Start

Use the `examples/ethers-quickstart.js` script to interact with the deployed contracts. Export `RPC_URL`, `PRIVATE_KEY`, `JOB_REGISTRY`, `STAKE_MANAGER` and `VALIDATION_MODULE`.

The [API reference](docs/api-reference.md) describes every public contract function and includes TypeScript and Python snippets. For an event‑driven workflow check the minimal [agent gateway](examples/agent-gateway.js) that listens for `JobCreated` events and applies automatically.

### Post a job
```bash
node -e "require('./examples/ethers-quickstart').postJob()"
```

### Stake tokens
```bash
node -e "require('./examples/ethers-quickstart').stake('1')"
```

### Validate a submission
```bash
node -e "require('./examples/ethers-quickstart').validate(1, '0xhash', '0xlabel', [], true, '0xsalt')"
```

### Raise a dispute
```bash
node -e "require('./examples/ethers-quickstart').dispute(1, 'ipfs://evidence')"
```

## Deployed Addresses

| Module | Address |
| --- | --- |
| `$AGIALPHA` Token | `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA` |
| StakeManager | `0x0000000000000000000000000000000000000000` |
| ReputationEngine | `0x0000000000000000000000000000000000000000` |
| IdentityRegistry | `0x0000000000000000000000000000000000000000` |
| ValidationModule | `0x0000000000000000000000000000000000000000` |
| DisputeModule | `0x0000000000000000000000000000000000000000` |
| CertificateNFT | `0x0000000000000000000000000000000000000000` |
| JobRegistry | `0x0000000000000000000000000000000000000000` |
## Step‑by‑Step Deployment with $AGIALPHA

Record each address during deployment. The defaults below assume the 18‑decimal `$AGIALPHA` token; token rotation is considered legacy and is not supported in new deployments.

| Module | Owner‑only setters |
| --- | --- |
| [`AGIALPHAToken`](contracts/test/AGIALPHAToken.sol) *(local testing only)* | `mint`, `burn` |
| [`StakeManager`](contracts/v2/StakeManager.sol) | `setMinStake`, `setSlashingPercentages`, `setTreasury`, `setMaxStakePerAddress` |
| [`JobRegistry`](contracts/v2/JobRegistry.sol) | `setModules`, `setFeePool`, `setTaxPolicy`, `setAgentRootNode`, `setAgentMerkleRoot`,<br>`setTreasury`, `setIdentityRegistry` |
| [`ValidationModule`](contracts/v2/ValidationModule.sol) | `setJobRegistry`, `setCommitWindow`, `setRevealWindow`, `setValidatorBounds`, `setApprovalThreshold`, `setIdentityRegistry` |
| [`IdentityRegistry`](contracts/v2/IdentityRegistry.sol) | `setENS`, `setNameWrapper`, `setReputationEngine`, `setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot`, `setValidatorMerkleRoot`, `setAgentProfileURI` |
| [`DisputeModule`](contracts/v2/modules/DisputeModule.sol) | `setDisputeFee`, `setTaxPolicy`, `setFeePool` |
| [`ReputationEngine`](contracts/v2/ReputationEngine.sol) | `setCaller`, `setWeights`, `blacklist`, `unblacklist` |
| [`CertificateNFT`](contracts/v2/CertificateNFT.sol) | `setJobRegistry`, `setStakeManager`, `setBaseURI` |
| [`FeePool`](contracts/v2/FeePool.sol) | `setStakeManager`, `setRewardRole`, `setBurnPct`, `setTreasury` |

### Etherscan steps
1. **Deploy contracts** – open each verified contract → **Contract → Deploy** and provide the constructor parameters listed above.
2. **Wire modules** – from each contract’s **Write** tab call:
   - `JobRegistry.setModules(validationModule, stakeManager, reputationEngine, disputeModule, certificateNFT, feePool, new address[](0))`
     - any `_ackModules` passed to this call must implement `IJobRegistryAck` and successfully respond to `acknowledgeFor(address(0))`
   - Point modules back to the registry with `StakeManager.setJobRegistry(jobRegistry)`, `ValidationModule.setJobRegistry(jobRegistry)`, `DisputeModule.setJobRegistry(jobRegistry)` and `CertificateNFT.setJobRegistry(jobRegistry)`
   - Authorise cross‑module calls using `StakeManager.setDisputeModule(disputeModule)` and `CertificateNFT.setStakeManager(stakeManager)`
   - `JobRegistry.setTaxPolicy(taxPolicy)` then `DisputeModule.setTaxPolicy(taxPolicy)`
   - `JobRegistry.setIdentityRegistry(identityRegistry)` and `ValidationModule.setIdentityRegistry(identityRegistry)`
   - Load ENS settings with `IdentityRegistry.setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot` and `setValidatorMerkleRoot`
3. **Example transactions** – after wiring you can:
   - Approve and stake: `$AGIALPHA.approve(StakeManager, 1_000000000000000000)` then `StakeManager.depositStake(role, 1_000000000000000000)`
   - Post a job: `JobRegistry.createJob(1_000000000000000000, "ipfs://QmHash")`

### Transfer ownership to a multisig or timelock
After deployment hand control of each module to a governance contract so no
single key can change parameters:

1. Deploy a multisig wallet or an OpenZeppelin
   `TimelockController`.
2. From the deployer account hand over control of each module:
   - `StakeManager.setGovernance(multisig)`
   - `JobRegistry.setGovernance(multisig)`
   - `transferOwnership(multisig)` on all other modules such as
     `ValidationModule`, `ReputationEngine`, `IdentityRegistry`,
     `CertificateNFT`, `DisputeModule`, `FeePool`, `PlatformRegistry`,
     `JobRouter`, `PlatformIncentives`, `TaxPolicy` and `SystemPause`.
3. To rotate governance later, the current multisig executes
   `setGovernance(newOwner)` or `transferOwnership(newOwner)` as
   appropriate and the new address assumes control after the relevant
   event. Timelock contracts must schedule and execute the call; direct EOA
   transactions will revert once ownership has moved.

### ENS subdomain prerequisites
- Agents must control an ENS subdomain ending in `.agent.agi.eth`.
- Validators require `.club.agi.eth`.
- Owners load allowlists with `JobRegistry.setAgentMerkleRoot` and `ValidationModule.setValidatorMerkleRoot`.

### Quickstart flow
1. **Obtain Merkle proof** – request your address proof from AGI operators or generate it from the published allowlist.
2. **Stake** – approve `$AGIALPHA` for the `StakeManager` and call `depositStake(role, amount)` (`role` 0 = agent, 1 = validator`).
3. **Apply** – submit `applyForJob(jobId, subdomain, proof)` on `JobRegistry` or use `stakeAndApply` to combine staking and applying.
4. **Commit & reveal** – validators call `commitValidation(jobId, hash, subdomain, proof)` then `revealValidation(jobId, approve, salt)`.
5. **Resolve disputes** – anyone can raise a dispute via `acknowledgeAndDispute(jobId, evidence)`; the owner settles it on `DisputeModule.resolve`.

### Etherscan job lifecycle
1. **Create** – on `JobRegistry` **Write Contract**, call `createJob(reward, uri)` with amounts in 18‑decimal base units.
2. **Apply** – agents stake through `StakeManager.depositStake(0, amount)` then call `applyForJob(jobId, label, proof)`.
3. **Validate** – selected validators execute `commitValidation(jobId, hash, label, proof)` followed by `revealValidation(jobId, approve, salt)`.
4. **Finalize** – once the reveal window closes anyone may call `ValidationModule.finalize(jobId)` to release rewards.
5. **Dispute** – challenges go through `JobRegistry.raiseDispute(jobId, evidence)` which forwards to `DisputeModule` for resolution.

### Updating parameters without redeployment
The contract owner can retune live systems from block‑explorer **Write** tabs:
- **ENS roots** – `IdentityRegistry.setAgentRootNode` / `setClubRootNode`.
- **Merkle roots** – `IdentityRegistry.setAgentMerkleRoot` / `setValidatorMerkleRoot`.
- **Timing & fees** – `ValidationModule.setCommitWindow`, `setRevealWindow`, `setValidatorBounds`, and `DisputeModule.setDisputeFee`.
- **Routing & policies** – `JobRegistry.setModules`, `setFeePool`, `setTaxPolicy`, then `DisputeModule.setTaxPolicy`.

## Overview of v2 Modular Architecture

The v2 release decomposes the monolithic manager into single‑purpose modules. Each contract owns its state and can be replaced without touching the rest of the system. Deploy modules in the following order:

1. `$AGIALPHA` token – external mainnet contract (use [`contracts/test/AGIALPHAToken.sol`](contracts/test/AGIALPHAToken.sol) on local networks)
2. [`StakeManager`](contracts/v2/StakeManager.sol)
3. [`ReputationEngine`](contracts/v2/ReputationEngine.sol)
4. [`IdentityRegistry`](contracts/v2/IdentityRegistry.sol)
5. [`ValidationModule`](contracts/v2/ValidationModule.sol)
6. [`DisputeModule`](contracts/v2/modules/DisputeModule.sol)
7. [`CertificateNFT`](contracts/v2/CertificateNFT.sol)
8. [`JobRegistry`](contracts/v2/JobRegistry.sol)

Each subsequent constructor accepts addresses from earlier steps, so deploying in this order avoids placeholder values.

For detailed behaviour and additional modules such as `FeePool`, `TaxPolicy` and `PlatformIncentives`, consult the docs under `docs/`.

## Further reading
- [Architecture overview](docs/architecture-v2.md)
- [Module and interface reference](docs/v2-module-interface-reference.md)
- [Etherscan interaction guide](docs/etherscan-guide.md)
- [Deployment walkthrough with $AGIALPHA](docs/deployment-v2-agialpha.md)
- [API reference and SDK snippets](docs/api-reference.md)
- [Agent gateway example](examples/agent-gateway.js)

