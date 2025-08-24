# AGIJob Manager
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![CI](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

AGIJob Manager is an experimental suite of Ethereum smart contracts and tooling for coordinating trustless labour markets among autonomous agents. The active implementation is the modular **v2** release located under `contracts/v2`. Earlier v0 and v1 sources, along with their tests and deployment scripts, are archived under the `legacy` tag and are no longer supported. A high‑level mapping of legacy entry points to their v2 counterparts lives in [docs/migration-guide.md](docs/migration-guide.md).

All modules default to the 6‑decimal `$AGIALPHA` token for payments, stakes and dispute deposits. Token addresses can be rotated post‑deployment through owner calls to `StakeManager.setToken` and `FeePool.setToken` without redeploying any module.

## Migrating from legacy

The original v0 and v1 contracts are preserved under the `legacy` git tag for reference only and receive no support. New development should target the v2 modules in `contracts/v2`. See [docs/migration-guide.md](docs/migration-guide.md) for help mapping legacy entry points to their v2 equivalents.

## Quick Start

Use the `examples/ethers-quickstart.js` script to interact with the deployed contracts. Export `RPC_URL`, `PRIVATE_KEY`, `JOB_REGISTRY`, `STAKE_MANAGER` and `VALIDATION_MODULE`.

### Post a job
```bash
node -e "require('./examples/ethers-quickstart').postJob()"
```

### Stake tokens
```bash
node -e "require('./examples/ethers-quickstart').stake(1_000000)"
```

### Validate a submission
```bash
node -e "require('./examples/ethers-quickstart').validate(1, '0xhash', '0xlabel', [], true, '0xsalt')"
```

### Raise a dispute
```bash
node -e "require('./examples/ethers-quickstart').dispute(1, 'ipfs://evidence')"
```
## Step‑by‑Step Deployment with $AGIALPHA

Record each address during deployment. The defaults below assume the 6‑decimal `$AGIALPHA` token and can be adjusted later via [`StakeManager.setToken`](contracts/v2/StakeManager.sol):

| Module | Owner‑only setters |
| --- | --- |
| [`AGIALPHAToken`](contracts/v2/AGIALPHAToken.sol) | `mint`, `burn` |
| [`StakeManager`](contracts/v2/StakeManager.sol) | `setToken`, `setMinStake`, `setSlashingPercentages`, `setTreasury`, `setMaxStakePerAddress` |
| [`JobRegistry`](contracts/v2/JobRegistry.sol) | `setModules`, `setFeePool`, `setTaxPolicy`, `setAgentRootNode`, `setAgentMerkleRoot` |
| [`ValidationModule`](contracts/v2/ValidationModule.sol) | `setJobRegistry`, `setCommitWindow`, `setRevealWindow`, `setValidatorBounds`, `setApprovalThreshold`, `setIdentityRegistry` |
| [`IdentityRegistry`](contracts/v2/IdentityRegistry.sol) | `setENS`, `setNameWrapper`, `setReputationEngine`, `setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot`, `setValidatorMerkleRoot` |
| [`DisputeModule`](contracts/v2/modules/DisputeModule.sol) | `setDisputeFee`, `setTaxPolicy`, `setFeePool` |
| [`ReputationEngine`](contracts/v2/ReputationEngine.sol) | `setCaller`, `setWeights`, `blacklist`, `unblacklist` |
| [`CertificateNFT`](contracts/v2/CertificateNFT.sol) | `setJobRegistry`, `setStakeManager`, `setBaseURI` |
| [`FeePool`](contracts/v2/FeePool.sol) | `setToken`, `setStakeManager`, `setRewardRole`, `setBurnPct`, `setTreasury` |

### Etherscan steps
1. **Deploy contracts** – open each verified contract → **Contract → Deploy** and provide the constructor parameters listed above.
2. **Wire modules** – from each contract’s **Write** tab call:
   - `JobRegistry.setModules(stakeManager, validationModule, disputeModule, certificateNFT, reputationEngine, feePool)`
   - `StakeManager.setJobRegistry(jobRegistry)` and `ValidationModule.setJobRegistry(jobRegistry)`
   - Load ENS settings with `setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot` and `setValidatorMerkleRoot`
3. **Example transactions** – after wiring you can:
   - Approve and stake: `$AGIALPHA.approve(StakeManager, 1_000000)` then `StakeManager.depositStake(role, 1_000000)`
   - Post a job: `JobRegistry.createJob(1_000000, "ipfs://QmHash")`
   - Rotate tokens later via `StakeManager.setToken(newToken)` and `FeePool.setToken(newToken)`

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
1. **Create** – on `JobRegistry` **Write Contract**, call `createJob(reward, uri)` with amounts in 6‑decimal base units.
2. **Apply** – agents stake through `StakeManager.depositStake(0, amount)` then call `applyForJob(jobId, label, proof)`.
3. **Validate** – selected validators execute `commitValidation(jobId, hash, label, proof)` followed by `revealValidation(jobId, approve, salt)`.
4. **Finalize** – once the reveal window closes anyone may call `ValidationModule.finalize(jobId)` to release rewards.
5. **Dispute** – challenges go through `JobRegistry.raiseDispute(jobId, evidence)` which forwards to `DisputeModule` for resolution.

### Updating parameters without redeployment
The contract owner can retune live systems from block‑explorer **Write** tabs:
- **Token address** – `StakeManager.setToken(newToken)` and `FeePool.setToken(newToken)`.
- **ENS roots** – `IdentityRegistry.setAgentRootNode` / `setClubRootNode`.
- **Merkle roots** – `IdentityRegistry.setAgentMerkleRoot` / `setValidatorMerkleRoot`.
- **Timing & fees** – `ValidationModule.setCommitWindow`, `setRevealWindow`, `setValidatorBounds`, and `DisputeModule.setDisputeFee`.
- **Routing & policies** – `JobRegistry.setModules`, `setFeePool`, and `setTaxPolicy`.

## Overview of v2 Modular Architecture

The v2 release decomposes the monolithic manager into single‑purpose modules. Each contract owns its state and can be replaced without touching the rest of the system. Deploy modules in the following order:

1. [`AGIALPHAToken`](contracts/v2/AGIALPHAToken.sol)
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

