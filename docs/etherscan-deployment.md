# Etherscan Deployment Quickstart

All token amounts use the 6 decimal base units of $AGIALPHA (e.g., **1 AGIALPHA = 1_000_000 units**). Convert values before entering them on Etherscan.

## Deploying AGIJobsv0 with $AGIALPHA

1. Open the verified
   [AGIJobManager v0 contract](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477#code)
   on Etherscan and select **Contract → Deploy**.
2. Supply constructor parameters:
   - `_agiTokenAddress` – [$AGIALPHA token](https://etherscan.io/token/0xf0780F43b86c13B3d0681B1Cf6DaeB1499e7f14D).
     Remember that 6‑decimal base units are required (e.g. `10.5` tokens = `10_500000`).
   - `_baseIpfsUrl` – common prefix for job metadata such as `ipfs://`.
   - `_ensAddress` – [ENS Registry](https://etherscan.io/address/0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e).
   - `_nameWrapperAddress` – [ENS NameWrapper](https://etherscan.io/address/0x253553366Da8546fC250F225fe3d25d0C782303b).
   - `_clubRootNode` and `_agentRootNode` – namehashes for `club.agi.eth` and `agent.agi.eth`; use
     `0x00` if no ENS gating is desired.
   - `_validatorMerkleRoot` and `_agentMerkleRoot` – allowlist roots or `0x00` for open access.
3. Submit the transaction; the deploying wallet becomes the owner.
4. Post‑deployment owner actions appear under **Write Contract**:
   - `updateAGITokenAddress(newToken)` swaps the payout token without redeploying
     ([example](https://etherscan.io/tx/0x9efa2044bc0d0112f21724baacecf72719297c9db1d97e49a9281863684a668a)).
   - `setRootNodes(clubRootNode, agentRootNode)` and `setMerkleRoots(validatorRoot, agentRoot)` adjust
     ENS and Merkle allowlists as policies evolve.
   - `addAdditionalAgent(address)` whitelists specific addresses; the paired `addAdditionalValidator`
     provides similar overrides.
   - `blacklist(address, true)` blocks misbehaving agents or validators.
   - Token transfers and payouts use 6‑decimal units, as illustrated by
     [this 10 666.56 AGIALPHA transfer](https://etherscan.io/tx/0x7d16c9a27d2d852c04ccca086d32fcc03f6931635ff63a7ab37dc8d24f659fee).
5. These setters mirror module controls in the v2 architecture—`StakeManager.setToken`,
   `ENSOwnershipVerifier.setRootNodes`, `IdentityRegistry.setMerkleRoots`, `JobRegistry.addAdditionalAgent`,
   and `ReputationEngine.blacklist`—demonstrating that the owner can retune parameters or swap tokens
   without redeploying contracts.

## One-click Etherscan deployment

### Recommended constructor parameters

| Parameter | Recommended value |
| --- | --- |
| `token` | `0x2e8fb54C3EC41F55F06C1f082C081A609eAA4EbE` |
| `feePct` | `5` (protocol fee percentage) |
| `burnPct` | `0` (no burn) |
| `commitWindow` | `86400` seconds (24h) |
| `revealWindow` | `86400` seconds (24h) |

### Deployment order and wiring

1. Deploy `StakeManager(token, treasury)` with the token above and your treasury address.
2. Deploy `JobRegistry()`.
3. Deploy `TaxPolicy(uri, acknowledgement)` and call `JobRegistry.setTaxPolicy(taxPolicy)`.
4. Deploy `ValidationModule(jobRegistry, stakeManager, commitWindow, revealWindow, 1, 3, [])`.
5. Deploy `ReputationEngine(stakeManager)` or `ReputationEngine(address(0))` if wiring later.
6. Deploy `CertificateNFT("AGI Jobs", "AGIJOB")`.
7. Deploy `DisputeModule(jobRegistry, 0, owner, owner)`.
8. Deploy `FeePool(token, stakeManager, burnPct, treasury)`; rewards default to platform stakers.
9. Deploy `PlatformRegistry(stakeManager, reputationEngine, 0)`.
10. Deploy `JobRouter(platformRegistry)`.
11. Deploy `PlatformIncentives(stakeManager, platformRegistry, jobRouter)`.
12. Deploy `ModuleInstaller()` if you prefer to wire modules after deployment; the deployer becomes the temporary owner via `Ownable`.
13. If using the installer, transfer ownership of each module to it and from that owner address call `ModuleInstaller.initialize(jobRegistry, stakeManager, validation, reputation, dispute, nft, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)` **once**. Only the owner may invoke `initialize`, and the installer blocks subsequent calls. The transaction wires modules, assigns the fee pool and optional tax policy, then transfers ownership back automatically. Finally authorize registrars:
    - `PlatformRegistry.setRegistrar(platformIncentives, true)`
    - `JobRouter.setRegistrar(platformIncentives, true)`
14. Verify each contract via **Contract → Verify and Publish** on Etherscan.

### Minimal ownership transfer example

1. Deploy `ModuleInstaller()`; the deploying address is the owner.
2. On each module contract, call `transferOwnership(installer)`.
3. From that owner address, open **ModuleInstaller → Write Contract** and execute `initialize(jobRegistry, stakeManager, validation, reputation, dispute, nft, platformIncentives, platformRegistry, jobRouter, feePool, taxPolicy)` (gated by `onlyOwner`) to wire any remaining zero addresses.
4. After the transaction, every module reports your address as `owner` again.

### Job posting, staking, and activation via Etherscan

1. **Post a job:** Approve the `StakeManager` to transfer `reward + fee`. On `JobRegistry`, call `acknowledgeAndCreateJob(reward, uri)`.
2. **Stake tokens:** After approving tokens, call `StakeManager.depositStake(role, amount)` (`0` = Agent, `1` = Validator, `2` = Platform).
3. **Activate a platform:** On `PlatformIncentives`, call `stakeAndActivate(amount)` to stake and register in one transaction.

### Owner-only setters

- `StakeManager.setToken(newToken)`
- `StakeManager.setMinStake(amount)`
- `JobRegistry.setFeePct(fee)`
- `ValidationModule.setCommitRevealWindows(commitWindow, revealWindow)`
- `FeePool.setBurnPct(pct)`
- `DisputeModule.setDisputeFee(fee)`

## Distribute Fees

As jobs finalize, protocol fees accumulate in the FeePool. Anyone may trigger distribution.

1. Open **FeePool → Write Contract** and call **distributeFees()**.

## Claim Rewards

Stakers withdraw accrued fees from the same contract.

1. In **FeePool → Write Contract**, execute **claimRewards()**.

## Token Conversion Reference

- `1.0 AGIALPHA = 1_000_000 units`
- `0.5 AGIALPHA = 500_000 units`
- `25 AGIALPHA = 25_000_000 units`

Always enter values in base units on Etherscan.
