# AGI Jobs v2 Deployment Guide (Production)

This guide walks a non-technical operator through deploying the **AGI Jobs v2** smart-contract suite on Ethereum using only a browser and Etherscan. It also highlights key best practices such as true token burning and owner updatability.

## Key Best Practices in AGI Jobs v2

- **True token burning:** Both the `StakeManager` and `FeePool` call the `$AGIALPHA` token's `burn` function whenever a burn percentage is configured. This permanently reduces total supply instead of sending tokens to a dead address.
- **Owner updatability:** Each module inherits access control so the contract owner can adjust parameters (fees, stake limits, time windows, etc.) without redeploying. For production, transfer ownership to a multisig or timelock once setup is confirmed.

## 1. Prerequisites

- **Ethereum wallet** (e.g. MetaMask) with enough ETH for gas; it becomes the owner of all contracts.
- **$AGIALPHA token address** (canonical mainnet: `0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA`).
- **ENS details** if restricting access (namehashes for `agent.agi.eth` and `club.agi.eth`, ENS registry `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`, and name wrapper `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`).
- **Contract sources** from this repository for verification.
- **Basic familiarity with the “Contract → Deploy” and “Write Contract” tabs** on Etherscan.

Keep a text file or spreadsheet open to record every contract address as you deploy.

## 2. Deploy Modules in Order

Deploy each contract via **Contract → Deploy** on Etherscan, supplying constructor parameters shown below. After each deployment, copy the resulting address to your notes.

1. **StakeManager**
   - `token`: `$AGIALPHA` token address (or `0x0` to use the baked‑in default).
   - `minStake`: minimum agent stake; `0` accepts the contract default.
   - `employerPct` / `treasuryPct`: distribution of slashed stake in basis points; use `0,0` to send 100% to the treasury.
   - `treasury`: address to receive protocol fees and slashed funds.
   - Any module addresses requested by the constructor can be `0x0` placeholders for now.
2. **ReputationEngine** – pass the StakeManager address from step 1.
3. **IdentityRegistry** _(optional)_
   - `_ensAddress`: ENS registry (mainnet `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`).
   - `_nameWrapperAddress`: ENS name wrapper (mainnet `0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401`).
   - `_reputationEngine`: ReputationEngine address.
   - `_agentRootNode` / `_clubRootNode`: namehashes for `agent.agi.eth` and `club.agi.eth` or `0x00..00` for open access.
4. **ValidationModule**
   - `_jobRegistry`: `0x0` (set later).
   - `_stakeManager`: StakeManager address.
   - `_commitWindow`: seconds for the commit phase, e.g. `86400` (24h) or `0` for default.
   - `_revealWindow`: seconds for the reveal phase, e.g. `86400` (24h) or `0` for default.
   - `_minValidators`: usually `1`.
   - `_maxValidators`: typically `3`.
   - `_validatorPool`: preset validator addresses or `[]` for open participation.
5. **DisputeModule**
   - `_jobRegistry`: `0x0` (set later).
   - `_disputeFee`: fee in wei of `$AGIALPHA`; `0` for none.
   - `_disputeWindow`: seconds allowed for disputes; `0` to accept default.
   - `_moderator`: optional address with authority to resolve disputes (use your own or `0x0`).
6. **CertificateNFT** – provide NFT collection `name` (e.g. "AGI Jobs Certificate") and `symbol` (e.g. "AGIJOB").
7. **FeePool**
   - `_token`: `$AGIALPHA` address or `0x0` for default.
   - `_stakeManager`: StakeManager address.
   - `_burnPct`: basis points of each fee to burn (e.g. `500` = 5%, `0` for none).
   - `_treasury`: destination for remaining fees.
8. **PlatformRegistry** _(optional)_ – parameters: `_stakeManager`, `_reputationEngine`, and `_minStake` (`0` for no minimum).
9. **JobRouter** _(optional)_ – parameter: `_platformRegistry`.
10. **PlatformIncentives** _(optional)_ – parameters: `_stakeManager`, `_platformRegistry`, `_jobRouter`.
11. **TaxPolicy** _(optional)_ – parameter: `uri` or text users must acknowledge.
12. **JobRegistry** – constructor requires
    - `_validationModule`, `_stakeManager`, `_reputationEngine`, `_disputeModule`, `_certificateNFT`,
    - `_identityRegistry` (`0x0` if unused) and `_taxPolicy` (`0x0` if none),
    - `_feePct` (basis points, e.g. `500` for 5%), `_jobStake` (usually `0`), `_ackModules` (normally `[]`),
    - optional `_owner` address (defaults to deployer if omitted).

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
- **Owner updatability:** as the contract owner you may adjust parameters (fee percentages, stake limits, burn rate, validation windows, allowlists, etc.) through the various `set...` functions. Consider transferring ownership to a multisig for additional safety.
  - Stake parameters: `StakeManager.setMinStakeAgent`, `setMinStakeEmployer`, `setMinStakeValidator`, `setMaxStakePerAddress`.
  - Fees and burns: `JobRegistry.setFeePct`, `StakeManager.setFeePct`, `FeePool.setBurnPct`.
  - Validation timing: `ValidationModule.setCommitWindow`, `ValidationModule.setRevealWindow`.
  - Identity controls: `IdentityRegistry.setAgentRootNode`, `setClubRootNode`, `setAgentMerkleRoot`, `setValidatorMerkleRoot`.
  - Participant management: `ReputationEngine.blacklist`, `JobRegistry.addAdditionalAgent`.
  - Emergency controls: `SystemPause.pause` / `SystemPause.unpause` to stop or resume activity across modules.
- **Security features:** contracts rely on OpenZeppelin libraries (`Ownable`, `ReentrancyGuard`, `SafeERC20`, etc.) and a modular design so faulty modules can be replaced. A dedicated pause mechanism (`docs/system-pause.md`) lets you halt the system if needed.
- **Security checks:** test a small job end‑to‑end, monitor emitted events, and keep the pause mechanism ready.
- **Trial run:** walk through posting a job, staking, validation, finalization and a dispute with small amounts or on a testnet to confirm module interactions.
- **Final verification:** confirm stored addresses in each module's _Read_ tab or run `npm run wire:verify -- --network <network>` locally against `config/agialpha.<network>.json` and `config/ens.<network>.json`.
- **Record keeping:** maintain an admin log of parameter changes and update `docs/deployment-addresses.json` whenever addresses change.
- **Legal compliance:** consult professionals to ensure the platform operates within your jurisdiction's regulations.

### Post‑Deployment Checklist

- [ ] Verify all contracts on Etherscan.
- [ ] Record and log every deployed address.
- [ ] Transfer ownership to a secure governance account.
- [ ] Configure and document the current burn rate.

## 5. Updating Repository Documentation

After a successful deployment:

1. Add the final contract addresses to `docs/deployment-addresses.json`.
2. Commit this guide and the updated addresses so future operators can replicate the setup.

Following these steps will allow you to launch AGI Jobs v2 on Ethereum with minimal technical overhead while retaining full control over platform parameters and ensuring tokens are truly burned when configured.
