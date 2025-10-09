# AGIJobs v2 Deployment & Operations Guide

For production deployment steps see [deployment-production-guide.md](deployment-production-guide.md). For a detailed explanation of the system design, consult [architecture-v2.md](architecture-v2.md).

Identity for agents and validators is enforced with the
`ENSOwnershipVerifier` library. Participants must control an ENS
subdomain—`*.agent.agi.eth` for agents and `*.club.agi.eth` for
validators—and supply the subdomain label plus Merkle proof when
interacting. The verifier checks ownership via NameWrapper and the ENS
resolver, emitting `OwnershipVerified` on success. Operators can issue
subdomains and set resolver records as outlined in
[ens-identity-setup.md](ens-identity-setup.md).

## Module Responsibilities & Addresses

| Module | Responsibility | Authoritative configuration |
| --- | --- | --- |
| `$AGIALPHA` Token | 18‑decimal ERC‑20 used for payments and staking (external mainnet contract) | [`config/agialpha.json`](../config/agialpha.json) with per-network overrides in `config/agialpha.<network>.json` |
| StakeManager | Custodies stakes, escrows rewards, slashes misbehaviour | [`config/stake-manager.json`](../config/stake-manager.json) |
| FeePool | Burns protocol fees, escrows rewards for stakers, enforces burn percentages | [`config/fee-pool.json`](../config/fee-pool.json) |
| JobRegistry | Orchestrates job lifecycle and wires all modules | [`config/job-registry.json`](../config/job-registry.json) |
| DisputeModule | Escrows dispute fees, routes moderator committees, finalises appeals | [`config/dispute-module.json`](../config/dispute-module.json) |
| PlatformRegistry | Tracks approved job routers and service operators | [`config/platform-registry.json`](../config/platform-registry.json) |
| PlatformIncentives | Configures operator staking incentives and emission weights | [`config/platform-incentives.json`](../config/platform-incentives.json) |
| RewardEngineMB | Distributes thermodynamic rewards across participants | [`config/reward-engine.json`](../config/reward-engine.json) together with the thermodynamic profile in [`config/thermodynamics.json`](../config/thermodynamics.json) |
| Thermostat | PID controller for system temperature and role overrides | [`config/thermodynamics.json`](../config/thermodynamics.json) (thermostat section) |
| RandaoCoordinator | Supplies randomness for validator selection | [`config/randao-coordinator.json`](../config/randao-coordinator.json) |
| EnergyOracle | Authorises telemetry signers and measurement cadence | [`config/energy-oracle.json`](../config/energy-oracle.json) |
| IdentityRegistry | Verifies ENS subdomains, alias roots, and Merkle allowlists | [`config/identity-registry.json`](../config/identity-registry.json) with ENS endpoints in `config/ens*.json` |
| HamiltonianMonitor | Records free-energy observations for thermodynamic audits | [`config/hamiltonian-monitor.json`](../config/hamiltonian-monitor.json) |
| TaxPolicy | Stores the active policy URI and metadata acknowledged on-chain | [`config/tax-policy.json`](../config/tax-policy.json) |

Modules without standalone JSON manifests—`ValidationModule`, `ReputationEngine`, `CertificateNFT`, `SystemPause`, `ArbitratorCommittee`, and the auxiliary routers—are tracked in [`config/owner-control.json`](../config/owner-control.json). Operate on them through the owner CLI (`npm run owner:update-all`, `npm run owner:command-center`, etc.) or the [`OwnerConfigurator`](../contracts/v2/admin/OwnerConfigurator.sol) wrapper. The [Owner Control Authority Reference](owner-control-authority-reference.md) lists every setter, required role, and CLI helper.

## Deployment Script Outline

For a scripted deployment the repository ships with
[`scripts/v2/deployDefaults.ts`](../scripts/v2/deployDefaults.ts). The
helper reads a JSON manifest (for example
[`deployment-config/mainnet.json`](../deployment-config/mainnet.json)) and
deploys each module using the requested parameters. Run:

```bash
npx hardhat run scripts/v2/deployDefaults.ts \
  --network <network> \
  --config deployment-config/<network>.json
```

The helper deploys and wires every module using `$AGIALPHA` as the
staking token. Pass `--no-tax` to omit the optional `TaxPolicy` module.
To customise the token, protocol fees or ENS roots edit the manifest
referenced by `--config` (or the defaults under `deployment-config/`)
and rerun the script. The manifest fields align with the
`config/*.json` files listed above and cover:

- `econ.token` – ERC‑20 used by `StakeManager` and `FeePool`
- `econ.feePct` / `econ.burnPct` – protocol fee and burn percentages
- `identity.roots.agentRoot` / `identity.roots.clubRoot` – namehashes for
  `agent.agi.eth` and `club.agi.eth`
- `identity.agentMerkleRoot` / `identity.validatorMerkleRoot` – optional
  allowlist roots
- `tax` – metadata for the optional `TaxPolicy`
- `secureDefaults` – launch-time toggles such as `pauseOnLaunch`

The script prints module addresses, writes them to the configured output
file, and attempts to verify source on Etherscan.

## Step-by-Step Deployment

1. **Ensure `$AGIALPHA` token exists** – use the external address above or deploy [`contracts/test/AGIALPHAToken.sol`](../contracts/test/AGIALPHAToken.sol) on local networks for testing.
2. **Deploy `StakeManager`** pointing at the token and configuring `_minStake`, `_employerSlashPct`, `_treasurySlashPct`, `_validatorSlashRewardPct`, and `_treasury`. Leave `_jobRegistry` and `_disputeModule` as `0` so governance can wire them later.
3. **Deploy `FeePool`** with the `StakeManager` address, burn percentage, treasury, and optional tax policy placeholder.
4. **Deploy `ReputationEngine`** passing the `StakeManager` address. Transfer ownership to governance after the first configuration so `RewardEngineMB` and `ValidationModule` can read from it safely.
5. **Deploy `Thermostat`** to establish initial temperature bounds, PID coefficients, and governance owner.
6. **Deploy `RewardEngineMB`** pointing at the `Thermostat`, `FeePool`, `ReputationEngine`, and `EnergyOracle` (use `address(0)` temporarily if the oracle is not live yet).
7. **Deploy `ValidationModule`** with `jobRegistry = 0`, the `StakeManager` address, timing windows, validator bounds, and any initial validator pool.
8. **Deploy `RandaoCoordinator`** (or alternative randomness provider) so the validation module can request randomness. Leave `ValidationModule.setRandaoCoordinator` until after deployment to avoid constructor reverts.
9. **Deploy `DisputeModule`** with `jobRegistry = 0`, dispute fees/windows, committee address, and governance owner.
10. **Deploy `CertificateNFT`** supplying a name and symbol; leave the base URI unset until post-launch metadata is final.
11. **Deploy `IdentityRegistry`** with the ENS registry, NameWrapper, `ReputationEngine` address, and the namehashes for `agent.agi.eth` and `club.agi.eth` (plus any alias roots).
12. **Deploy `PlatformRegistry`** and `PlatformIncentives` (if operators participate at launch) pointing at the `StakeManager` and `ReputationEngine`.
13. **Deploy `JobRegistry`** passing the validation, staking, reputation, dispute, certificate, fee pool, optional tax policy, fee percentage, per-job validator stake, acknowledgement modules, and the governance timelock or multisig. The constructor validates module versions and stores the wiring when non-zero addresses are supplied.
14. **Deploy `SystemPause`** so governance can pause multiple modules atomically during incidents.
15. **Point modules back to `JobRegistry`** and supporting components by calling:
    - `StakeManager.setJobRegistry(jobRegistry)`
    - `StakeManager.setDisputeModule(disputeModule)`
    - `ValidationModule.setJobRegistry(jobRegistry)`
    - `ValidationModule.setRandaoCoordinator(randaoCoordinator)`
    - `ValidationModule.setIdentityRegistry(identityRegistry)`
    - `DisputeModule.setJobRegistry(jobRegistry)`
    - `DisputeModule.setStakeManager(stakeManager)`
    - `DisputeModule.setTaxPolicy(taxPolicy)` once a policy is active
    - `CertificateNFT.setJobRegistry(jobRegistry)`
    - `RewardEngineMB.setFeePool(feePool)` and `RewardEngineMB.setReputationEngine(reputationEngine)` if not provided at construction
    - `JobRegistry.setTaxPolicy(taxPolicy)` and `JobRegistry.setFeePool(feePool)` when final addresses are known
    - `SystemPause.setModules(...)` with every ownable module once ownership has been transferred
16. **Verify source code** – publish each contract on the block explorer using `npx hardhat verify --network <network> <address> <constructor args>` or the explorer UI so others can audit and interact with it.
17. **Verify wiring** – run `npm run wire:verify -- --network <network>` to confirm module getters match the addresses recorded in `config/agialpha.<network>.json` and `config/ens.<network>.json`.
18. **Configure ENS and Merkle roots** using `setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot`, and `setValidatorMerkleRoot` on `IdentityRegistry`.
19. **Governance setup** – deploy a multisig wallet or timelock controller and pass its address to the `StakeManager` and `JobRegistry` constructors. Transfer ownership of every remaining `Ownable` module (for example `IdentityRegistry`, `CertificateNFT`, `ValidationModule`, `DisputeModule`, `FeePool`, `PlatformRegistry`, `PlatformIncentives`, `RewardEngineMB`, `Thermostat`, `SystemPause`, and related helpers) to this governance contract so no single EOA retains control. To rotate governance later, the current authority calls `setGovernance(newGov)`.

## Governance Configuration Steps

After deployment the governance contract can fine‑tune the system without redeploying:

1. **Configure `$AGIALPHA`** – `StakeManager`, `FeePool`, and `RewardEngineMB` assume this fixed token. Regenerate [`contracts/v2/Constants.sol`](../contracts/v2/Constants.sol) with `npm run compile` after editing `config/agialpha*.json` to keep Solidity and TypeScript consumers aligned.
2. **Set ENS roots** – on `IdentityRegistry` call `setAgentRootNode`, `setClubRootNode`, and (if using allowlists) `setAgentMerkleRoot` / `setValidatorMerkleRoot`. The helper `npm run identity:update -- --network <network>` previews and optionally submits the required transactions.
3. **Wire supporting modules** – run `npm run owner:wizard` followed by `npm run owner:update-all -- --network <network>` to batch updates across `StakeManager`, `JobRegistry`, `FeePool`, `DisputeModule`, `PlatformRegistry`, `PlatformIncentives`, `RewardEngineMB`, `Thermostat`, `EnergyOracle`, `RandaoCoordinator`, and `IdentityRegistry`. Modules that sit outside the JSON manifests (`ValidationModule`, `ReputationEngine`, `CertificateNFT`, etc.) can be reconfigured through `npm run owner:command-center` or Safe bundles emitted by `scripts/v2/owner-config-wizard.ts`.
4. **Publish a tax policy** – call `JobRegistry.setTaxPolicy(taxPolicy)` then `DisputeModule.setTaxPolicy(taxPolicy)` and instruct participants to acknowledge via `JobRegistry.acknowledgeTaxPolicy()` before staking or disputing.
5. **Install the system pause** – after transferring ownership of every module to the deployed `SystemPause` contract, execute `npx hardhat run scripts/v2/updateSystemPause.ts --network <network> --execute` so emergency pausing covers the entire surface area.

## Interacting via Etherscan

Before any user interaction, open `JobRegistry` → **Write Contract** and
execute `acknowledgeTaxPolicy()` once per address. Subsequent actions can
then be performed through the "Write" tabs on each module.

### Job Creation

1. Approve the job reward on the staking token.
2. In `JobRegistry` → **Write**, call `createJob(reward, uri)`.
3. Watch for `JobCreated(jobId, employer, reward)` in the log.

### Staking

1. Approve tokens on `$AGIALPHA`.
2. In `StakeManager` call `depositStake(role, amount)` (0 = agent,
   1 = validator, 2 = platform).
3. `Staked(role, user, amount)` confirms the bond.

### Applying for a Job

1. Ensure your ENS subdomain is set up and whitelisted.
2. Call `JobRegistry.applyForJob(jobId, subdomain, proof)` or
   `stakeAndApply(jobId, amount, subdomain, proof)`.
3. `ApplicationSubmitted(jobId, agent)` and `AgentAssigned(jobId, agent)` will be emitted.

### Submitting Work

1. The selected agent calls `JobRegistry.submit(jobId, resultHash, resultURI)` when the task is complete.
2. `ResultSubmitted(jobId, resultHash, resultURI)` confirms the submission and triggers validation.

### Validation

1. During commit phase, validators call
   `ValidationModule.commitValidation(jobId, commitHash, subdomain, proof)`.
2. During reveal phase, call
   `revealValidation(jobId, approve, burnTxHash, salt, subdomain, proof)`. Pass `0x0` for `burnTxHash` unless a burn transaction hash is required by policy.
3. After reveal, anyone may call `ValidationModule.finalize(jobId)` to record the outcome.
4. The employer then settles the job by calling `JobRegistry.acknowledgeAndFinalize(jobId)` from their own wallet, which releases funds and burns the fee share.

### Dispute

1. Approve the dispute fee on `$AGIALPHA`.
2. Call `JobRegistry.raiseDispute(jobId, evidenceHash)` with a keccak-256 digest, or `raiseDispute(jobId, reason)` to store a plaintext reason on-chain.
3. Owner or a majority of moderators resolves via `DisputeModule.resolve(jobId, uphold, signatures)`.
4. Monitor `DisputeRaised` and `DisputeResolved` events.

### Certificate NFTs

1. Governance (or an authorised operator) sets the metadata base URI once with `CertificateNFT.setBaseURI("https://…/")` and can update it via `updateBaseURI` before calling `lockBaseURI()`.
2. Certificates are minted by `JobRegistry` via `CertificateNFT.mint(agent, jobId, uriHash)` after successful job settlement. Holders manage transfers using standard ERC‑721 approvals—there is no built-in marketplace logic.

### Minimal Write Transactions

| Action           | Contract / Function                                                | Notes                                           |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Accept tax terms | `JobRegistry.acknowledgeTaxPolicy()`                               | Must be called once before staking or disputing |
| Stake as agent   | `StakeManager.depositStake(0, amount)`                             | `amount` uses 18‑decimal `$AGIALPHA` units      |
| Post a job       | `JobRegistry.createJob(reward, uri)`                               | `reward` in base units; token must be approved  |
| Commit vote      | `ValidationModule.commitValidation(jobId, hash, subdomain, proof)` | `hash = keccak256(approve, salt)`               |
| Reveal vote      | `ValidationModule.revealValidation(jobId, approve, burnTxHash, salt, subdomain, proof)`          | Provide `0x0` for `burnTxHash` unless a burn proof is required.          |
| Raise dispute    | `JobRegistry.raiseDispute(jobId, evidenceHash)` or `raiseDispute(jobId, reason)` | Requires prior fee approval; emits `DisputeRaised`.          |

## Owner Administration

### Adjustable Parameters

| Module               | Function                              | Description                                                                 |
| -------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `JobRegistry`        | `setFeePct(pct)`                      | Percentage of each reward taken as protocol fee                             |
| `StakeManager`       | `setMinStake(amount)`                 | Minimum stake required for any role                                         |
| `ValidationModule`   | `setCommitWindow(seconds)`            | Commit phase length for validation votes                                    |
| `ValidationModule`   | `setRevealWindow(seconds)`            | Reveal phase length for validation votes                                    |
| `DisputeModule`      | `setDisputeFee(fee)`                  | Fee required to raise a dispute                                             |
| `FeePool`            | `setBurnPct(pct)`                     | Portion of fees burned before distribution                                  |
| `PlatformIncentives` | `setModules(stake, registry, router)` | Points to the canonical `StakeManager`, `PlatformRegistry`, and `JobRouter` |
| `TaxPolicy`          | `setPolicy(uri, acknowledgementText)` | Rotates the tax-policy pointer and disclaimer shown to participants         |

- **Manage allowlists:** use `JobRegistry.setAgentRootNode(node)` / `setAgentMerkleRoot(root)` for agents and `JobRegistry.setValidatorRootNode(node)` / `setValidatorMerkleRoot(root)` for validators. These call the underlying `IdentityRegistry` setters and automatically bump the `ValidationModule` validator auth cache so outdated entries expire. Add individual addresses with `IdentityRegistry.addAdditionalAgent(addr)` and `addAdditionalValidator(addr)`.
- **Transfer ownership:** hand governance to a multisig or timelock so no
  single key can change parameters:
  - `StakeManager.setGovernance(multisig)`
  - `JobRegistry.setGovernance(multisig)`
  - `transferOwnership(multisig)` on `ValidationModule`, `ReputationEngine`,
    `IdentityRegistry`, `CertificateNFT`, `DisputeModule`, `FeePool`,
    `PlatformRegistry`, `JobRouter`, `PlatformIncentives`, `TaxPolicy` and
    `SystemPause`.
    To rotate later, the current governance executes `setGovernance(newOwner)`
    or `transferOwnership(newOwner)` and waits for the corresponding event
    before using the new address.

### Pause Mechanism

Deploy the optional [`SystemPause`](system-pause.md) contract and wire
module addresses with `setModules`. Governance may call `pauseAll()` to
halt job creation, validation and payouts during emergencies and
`unpauseAll()` to resume. Individual modules also expose standard
`pause()` hooks for targeted stops.

## Token Configuration

- Default staking/reward token: `$AGIALPHA` at
  `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA` (18 decimals).

## Operational Best Practices

- **Record keeping:** archive deployment transactions, module addresses and
  verification links so upgrades or audits can reference an accurate history.
- **End-to-end testing:** run unit tests with `npm test` and exercise a full job
  flow on a test network before promoting configuration changes to mainnet.
- **Legal compliance:** consult counsel on tax, securities and data-privacy
  obligations in relevant jurisdictions and ensure participants acknowledge the
  posted tax policy. Core contracts wired in via governance (e.g. `StakeManager`
  and `FeePool`) are treated as trusted modules and remain exempt after policy
  updates, so operators do not need to re-acknowledge them when bumping the
  version.

## ENS Identity Monitor

A lightweight script monitors `IdentityRegistry` for `OwnershipVerified` and `RecoveryInitiated` events and logs anomalies.
Run it with:

```bash
RPC_URL=https://rpc.example IDENTITY_REGISTRY_ADDRESS=0xRegistry node scripts/monitor/ens-monitor.js
```

Logs appear on stdout and in `scripts/monitor/ens-monitor.log`. An "Anomaly detected" message indicates frequent `RecoveryInitiated` events.

## Troubleshooting

- **Missing subdomain proof** – ensure your ENS label and Merkle proof
  match the configured roots.
- **Token approvals** – most functions require prior `approve` calls on
  the staking token.
- **Tax policy** – users must call `acknowledgeTaxPolicy()` on
  `JobRegistry` before staking or disputing.

## Identity Requirements & Merkle Proofs

Agents must control an `*.agent.agi.eth` subdomain and validators a `*.club.agi.eth` subdomain. When applying or validating, supply the subdomain label and a Merkle proof showing your address is allow‑listed.

To generate proofs:

1. Compile a list of permitted addresses and normalise to lowercase.
2. Install dependencies with `npm install merkletreejs keccak256`.
3. Build the tree and extract the root and proofs:
   ```js
   const { MerkleTree } = require('merkletreejs');
   const keccak256 = require('keccak256');
   const whitelist = ['0x1234...', '0xabcd...'];
   const leaves = whitelist.map((a) => keccak256(a));
   const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
   console.log('root:', tree.getHexRoot());
   console.log('proof for first address:', tree.getHexProof(leaves[0]));
   ```
4. Set the root on `IdentityRegistry` using `setAgentMerkleRoot` or `setValidatorMerkleRoot` and supply the proof when interacting with protocol functions.

## Event & Function Glossary

| Event                                                                                                      | Emitted by         | Meaning                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `JobCreated(uint256 jobId, address employer, uint256 reward)`                                              | `JobRegistry`      | Employer posted a job and escrowed funds. |
| `ApplicationSubmitted(uint256 jobId, address applicant)`                                                   | `JobRegistry`      | Agent submitted an application.           |
| `AgentAssigned(uint256 jobId, address agent)`                                                              | `JobRegistry`      | Agent assignment recorded.                |
| `ValidationCommitted(uint256 jobId, address validator, bytes32 commitHash, string subdomain)`              | `ValidationModule` | Validator submitted hashed vote.          |
| `ValidationRevealed(uint256 jobId, address validator, bool approve, bytes32 burnTxHash, string subdomain)` | `ValidationModule` | Validator revealed vote.                  |
| `DisputeRaised(uint256 jobId, address claimant, bytes32 evidenceHash, string evidence)`                    | `DisputeModule`    | A job result was contested.               |
| `DisputeResolved(uint256 jobId, bool employerWins)`                                                        | `DisputeModule`    | Moderator issued final ruling.            |
| `CertificateMinted(address to, uint256 jobId)`                                                             | `CertificateNFT`   | NFT minted for a completed job.           |

| Function                                                                                         | Module             | Purpose                         |
| ------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------- |
| `createJob(uint256 reward, string uri)`                                                          | `JobRegistry`      | Post a job and lock payout.     |
| `depositStake(uint8 role, uint256 amount)`                                                       | `StakeManager`     | Bond tokens for a role.         |
| `applyForJob(uint256 jobId, string subdomain, bytes32[] proof)`                                  | `JobRegistry`      | Enter candidate pool for a job. |
| `commitValidation(uint256 jobId, bytes32 hash, string subdomain, bytes32[] proof)`               | `ValidationModule` | Submit a hidden vote.           |
| `revealValidation(uint256 jobId, bool approve, bytes32 salt, string subdomain, bytes32[] proof)` | `ValidationModule` | Reveal vote.                    |
| `raiseDispute(uint256 jobId, string reason)`                                                     | `JobRegistry`      | Start appeal process.           |
| `list(uint256 tokenId, uint256 price)`                                                           | `CertificateNFT`   | List job certificate for sale.  |
| `purchase(uint256 tokenId)`                                                                      | `CertificateNFT`   | Buy listed certificate.         |

- **Automation helpers:** Dry-run your changes with
  `npx hardhat run scripts/v2/updatePlatformIncentives.ts --network <network>`
  (rewires module addresses) and
  `npx hardhat run scripts/v2/updateTaxPolicy.ts --network <network>`
  (updates policy URI, acknowledgement text, acknowledger allowlist, clears
  stale acknowledgements, or bumps the version). Both scripts read defaults from
  `config/*.json`, ensure the connected signer controls the target contract, and
  print a human-readable plan before executing.

  Populate `config/tax-policy.json` with `acknowledgers` (address-to-boolean map)
  and `revokeAcknowledgements` (array of addresses to reset). The helper now
  fetches current allowlist status and acknowledgement versions so the plan only
  includes the deltas that require on-chain transactions.
