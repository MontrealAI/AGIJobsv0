# AGIJob Manager
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![CI](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml/badge.svg)](https://github.com/MontrealAI/AGIJobsv0/actions/workflows/ci.yml)

AGIJob Manager is an experimental suite of Ethereum smart contracts and tooling for coordinating trustless labor markets among autonomous agents using the $AGI token. This repository hosts the immutable mainnet deployment (v0) and an unaudited v1 prototype under active development. Treat every address as unverified until you confirm it on-chain and through official AGI.eth channels.

> **Critical Security Notice:** `AGIJobManagerv0.sol` in `legacy/` is the exact source for the mainnet contract at [`0x0178…ba477`](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477). It is immutable and must never be altered. Any future releases will appear as new files (for example, `contracts/AGIJobManagerv1.sol`) and will be announced only through official AGI.eth channels. Always cross‑check contract addresses and bytecode on multiple explorers before sending funds or interacting with a deployment.

## Quick Links

- [AGIJobManager v0 on Etherscan](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477#code) – verify the 0x0178… address independently before interacting.
- [AGIJobManager v0 on Blockscout](https://blockscout.com/eth/mainnet/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477/contracts)
- [AGIJobs NFT Collection on OpenSea](https://opensea.io/collection/agijobs) – confirm the collection contract on a block explorer before trading.
- [AGIJobs NFT contract on Etherscan](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477#code) / [Blockscout](https://blockscout.com/eth/mainnet/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477/contracts) – cross-check the address on multiple explorers before trading.
- [$AGI token contract on Etherscan](https://etherscan.io/address/0xf0780F43b86c13B3d0681B1Cf6DaeB1499e7f14D#code) / [Blockscout](https://eth.blockscout.com/address/0xf0780F43b86c13B3d0681B1Cf6DaeB1499e7f14D?tab=contract) – cross-verify the token address before transacting.
- [AGIJobManager v0 Source](legacy/AGIJobManagerv0.sol)
- [AGIJobManager v1 Source](contracts/AGIJobManagerv1.sol) – experimental upgrade using Solidity 0.8.21; includes an automatic token burn on final validation via the `JobFinalizedAndBurned` event and configurable burn parameters. Not deployed; treat any address claiming to be v1 as unverified until announced through official channels.

> **Warning**: Links above are provided for reference only. Always validate contract addresses and metadata on multiple block explorers before interacting.

## Disclaimer

- Verify every address independently before sending transactions. Cross-check on multiple block explorers (e.g., Etherscan, Blockscout) and official channels.
- **Audit Status:** Unaudited – use at your own risk.
- **Security Notice:** This repository is research code. Confirm contract addresses, compiled bytecode, and deployment parameters yourself and experiment on public testnets before interacting with real assets.
- **Validator Risk:** Validators must lock stake before voting. Incorrect votes are slashed and stakes remain locked until all of the validator's jobs finalize; review the slashing and withdrawal rules before committing funds.

## Safety Checklist

Follow these steps before trusting any address or artifact:

- Verify contract and token addresses on at least two explorers (e.g., Etherscan and Blockscout).
- Ensure the verified source code matches the compiled bytecode.
- Exercise new code on public testnets prior to mainnet usage.
- Reproduce builds locally with pinned compiler and dependency versions to confirm bytecode.
- Avoid links or addresses from untrusted third parties.
- Verify repository integrity (`git tag --verify` / `git log --show-signature`) before relying on published code.
- Understand that tokens are burned instantly upon the final validator approval, irreversibly sending `burnPercentage` of escrow to `burnAddress`. Both parameters remain `onlyOwner` configurable.
- All percentage parameters use basis points (1 bp = 0.01%); double‑check values before submitting transactions.
- Jobs finalize only after the agent calls `requestJobCompletion`; even moderator resolutions in favor of the agent revert otherwise.
- Confirm the current `stakeRequirement` before staking and plan for withdrawals; `withdrawStake` only succeeds once all of your jobs are finalized without disputes.
- Monitor `*Updated` events for changes to burn rates, slashing percentages, reward splits, minimum reputation, the slashed‑stake recipient, or validator pool resets via `ValidatorPoolSet`.
- Validators that fall below `minValidatorReputation` are automatically blacklisted; the restriction lifts once their reputation rises back above the threshold.
- If no validator votes correctly, only slashed stake goes to `slashedStakeRecipient` while the reserved validator reward portion returns to the job's agent or employer; verify this recipient and watch for updates before staking.

## Overview

AGIJob Manager orchestrates trustless labor markets for autonomous agents. When a job is validated and its NFT is minted, a configurable portion of the escrowed payout is burned. The project
contains two smart‑contract generations:

- **v0** – the immutable mainnet release, permanently deployed at
  [0x0178b6bad606aaf908f72135b8ec32fc1d5ba477](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477).
- **v1** – an in‑development upgrade tracking best practices and modern tooling.

All addresses should be independently verified before use.

## Versions

- **v0 – Legacy:** Immutable code deployed at [0x0178b6bad606aaf908f72135b8ec32fc1d5ba477](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477).
- **v1 – Development:** Uses Solidity 0.8.21 (pinned) with custom errors and gas‑optimized loops; deployment address: _TBA_. Any contract advertised as v1 prior to an official release should be regarded as untrusted.

> **Caution:** v0 is frozen and must not be modified. All new work should target v1.

For version details, see the [changelog](CHANGELOG.md).

## Repository Structure

- **legacy/AGIJobManagerv0.sol** – immutable contract deployed on Ethereum mainnet.
- **contracts/AGIJobManagerv1.sol** – forward-looking upgrade under active development.
- **scripts/** – helper utilities like [deploy.ts](scripts/deploy.ts) for network deployment.
- Project metadata: configuration, changelog, and documentation.

## Project Purpose
Aims to coordinate trustless labor markets for autonomous agents using the $AGI token. See the full narrative and diagram in [docs/project-purpose.md](docs/project-purpose.md).

## Features

- **On-chain job board** – employers escrow $AGI and assign tasks to approved agents.
- **Reputation system** – agents and validators earn points that unlock premium capabilities.
- **NFT marketplace** – completed jobs mint NFTs that can be listed, purchased, or delisted; marketplace calls are pausable and guarded by `ReentrancyGuard`.
- **ENS & Merkle verification** – subdomain ownership and allowlists guard access to jobs and validation.
- **Pausable and owner‑controlled** – emergency stop, moderator management, and tunable parameters.
- **Transparent moderation** – emits `AgentBlacklisted`, `ValidatorBlacklisted`, `ModeratorAdded`, and `ModeratorRemoved` events for on-chain auditability.
- **Gas-efficient validations** – v1 replaces string `require` messages with custom errors and unchecked prefix increments.
- **Enum-based dispute resolution** – moderators settle conflicts with a typed `DisputeOutcome` enum instead of fragile string comparisons.
- **Unified job status** – a `JobStatus` enum (`Open`, `CompletionRequested`, `Disputed`, `Completed`) replaces multiple booleans and is emitted with state-change events like `JobCreated`, `JobCompletionRequested`, `JobDisputed`, and `JobCompleted`.
- **Stake-based validator incentives**
  - Validators must stake $AGI and maintain a minimum reputation.
  - Rewards accrue only to validators whose votes match the final outcome; others are excluded.
  - Misaligned votes are slashed and lose reputation; correct validators share the slashed stake.
  - `validatorsPerJob` defaults to three and can never fall below the approval or disapproval thresholds, preventing owner misconfiguration.
  - If no validator votes correctly, slashed stakes go to `slashedStakeRecipient` and the reserved reward portion refunds to the agent or employer.
  - Default timing uses a one-hour commit phase and one-hour reveal phase with a two-hour review window, all adjustable by the owner.
  - Validator reputation gains use a separate `validatorReputationPercentage` so reputation rewards can differ from token rewards.
  - All validator parameters (reward %, reputation %, slashing %, stake requirement,
    approval thresholds, commit/reveal/review windows, validator count, slashed-stake recipient, etc.) are owner-configurable via `onlyOwner` functions.
  - The contract owner may add or remove validators from the selection pool with `addAdditionalValidator` and `removeAdditionalValidator`; removed validators emit `ValidatorRemoved` and become ineligible for future jobs.
  - Setting the stake requirement or slashing percentage to `0` disables those mechanisms.
- **Basis-point standardization** – percentage parameters like burns, slashing, and rewards are expressed in basis points for deterministic math.
- **Configurable slashed stake recipient** – if no validator votes correctly, all slashed stake is sent to `slashedStakeRecipient` (initially the owner but adjustable, e.g. to the burn address) while the validator reward portion reverts to the agent or employer.
- **Automatic finalization & configurable token burn** – the last validator approval triggers `_finalizeJobAndBurn`, minting the completion NFT, releasing the payout, and burning the configured portion of escrow. The `JobFinalizedAndBurned` event records agent payouts and burn amounts.

### NFT Bonus

Agents holding qualifying AGI NFTs receive a payout boost. Each bonus is specified in basis points (1 bp = 0.01%) when calling `addAGIType`, and the highest applicable bonus is applied to the agent's payout.

### Burn Mechanism

The v1 prototype destroys a slice of each finalized job's escrow, permanently reducing total supply. Burning occurs automatically when the last validator approval triggers `_finalizeJobAndBurn` to mint the NFT, release payment and burn tokens—no separate call is required.

- **BURN_ADDRESS / burnAddress** – `BURN_ADDRESS` is the canonical dead wallet (`0x000000000000000000000000000000000000dEaD`). The mutable `burnAddress` variable starts at this value but the owner may redirect burns via `setBurnAddress(newAddress)`, emitting `BurnAddressUpdated(newAddress)`.
- **BURN_PERCENTAGE / burnPercentage** – `BURN_PERCENTAGE` (500 basis points) seeds the mutable `burnPercentage` variable. The owner may change or disable burning with `setBurnPercentage(newBps)`; setting `0` halts burning. Each update emits `BurnPercentageUpdated(newBps)`.
- **setBurnConfig(newAddress, newBps)** – convenience method for owners to update both settings atomically. Emits `BurnAddressUpdated(newAddress)` and `BurnPercentageUpdated(newBps)` in a single transaction.
- **Automatic finalization** – the final validator approval executes `_finalizeJobAndBurn`, minting the completion NFT, releasing payment and burning `burnPercentage` of the escrow to `burnAddress`. `JobFinalizedAndBurned(jobId, agent, employer, payoutToAgent, tokensBurned)` records the transfer.
- **Caution:** Tokens sent to the burn address are irrecoverable; monitor `BurnPercentageUpdated` and `BurnAddressUpdated` events when changing parameters.

**Execution flow**

1. The employer escrows `$AGI` when posting the job.
2. When completion is requested, validators enter the commit phase and submit hashed votes via `commitValidation`.
3. After the commit phase, validators reveal their votes with `revealValidation`.
4. After the commit and reveal windows **and** the review window have all closed, validators call `validateJob` or `disapproveJob`; the final approval triggers `_finalizeJobAndBurn`.
5. The contract computes `burnAmount = payout * burnPercentage / 10_000` and sends it to `burnAddress`.
6. Validator rewards and the remaining payout are transferred to participants.
7. The completion NFT is minted and sent to the employer.

### Security & Marketplace Updates

- **`jobExists` requirement** – The new [`jobExists`](contracts/AGIJobManagerv1.sol#L391-L394) modifier guards functions and reverts when an unknown job ID is supplied.
- **Checks–effects–interactions** – job cancellation and marketplace functions such as [`cancelJob`](contracts/AGIJobManagerv1.sol#L1260-L1277), [`delistJob`](contracts/AGIJobManagerv1.sol#L822-L838), [`listNFT`](contracts/AGIJobManagerv1.sol#L1480-L1488), [`purchaseNFT`](contracts/AGIJobManagerv1.sol#L1491-L1498), and [`delistNFT`](contracts/AGIJobManagerv1.sol#L1504-L1508) update internal state before token transfers to prevent reentrancy and respect the pause modifier.
- **Safe minting and transfers** – Completion NFTs are minted with [`_safeMint`](contracts/AGIJobManagerv1.sol#L1358) and traded with [`_safeTransfer`](contracts/AGIJobManagerv1.sol#L1384), ensuring recipients implement ERC-721.
- **Verifiable randomness roadmap** – Validators are presently chosen with blockhash entropy via [`_selectValidators`](contracts/AGIJobManagerv1.sol#L454-L468); future versions will integrate verifiable randomness (e.g., VRF) for stronger guarantees.
- **Owner-controlled parameters** – Only the contract owner may adjust validator or burn settings through [`setValidatorConfig`](contracts/AGIJobManagerv1.sol#L1033-L1089), emitting [`ValidatorConfigUpdated`](contracts/AGIJobManagerv1.sol#L336-L349), and [`setBurnConfig`](contracts/AGIJobManagerv1.sol#L942-L951), emitting [`BurnAddressUpdated`](contracts/AGIJobManagerv1.sol#L313) and [`BurnPercentageUpdated`](contracts/AGIJobManagerv1.sol#L317).

**Setup checklist**

1. `setBurnConfig(newAddress, newBps)` – set burn destination and rate in one call, or use `setBurnAddress`/`setBurnPercentage` individually.
2. Ensure each validator has staked at least `stakeRequirement` before validating.
3. Curate the validator set with `addAdditionalValidator` and `removeAdditionalValidator`; listen for `ValidatorRemoved` when pruning the pool.
4. Validators may call `withdrawStake` only after all of their jobs finalize without disputes.
5. Monitor `StakeRequirementUpdated`, `SlashingPercentageUpdated`, `ValidationRewardPercentageUpdated`, `MinValidatorReputationUpdated`, `ValidatorsPerJobUpdated` (always ≥ the approval/disapproval thresholds), `CommitRevealWindowsUpdated`, `ReviewWindowUpdated` (must remain ≥ `commitDuration + revealDuration`), and `SlashedStakeRecipientUpdated` for configuration changes.
6. On final validator approval, watch for `JobFinalizedAndBurned` to confirm payout and burn amounts.

**Example finalization**

```javascript
// commit during the commit phase
await manager
  .connect(validator)
  .commitValidation(jobId, commitment, "", []);

// reveal during the reveal phase
await manager.connect(validator).revealValidation(jobId, true, salt);

// finalize after the review window
await manager.connect(validator).validateJob(jobId, "", []);
// burnPercentage (in basis points) of escrow is sent to burnAddress
// employer receives the completion NFT
```

### Validator Workflow

  - **Staking requirement** – bond $AGI via [`stake`](contracts/AGIJobManagerv1.sol#L1400-L1408) and exit with [`withdrawStake`](contracts/AGIJobManagerv1.sol#L1411-L1429), emitting [`StakeDeposited`](contracts/AGIJobManagerv1.sol#L320) and [`StakeWithdrawn`](contracts/AGIJobManagerv1.sol#L321).
  - **Commit → reveal → finalize** – submit a hashed vote with [`commitValidation`](contracts/AGIJobManagerv1.sol#L461-L495), disclose it via [`revealValidation`](contracts/AGIJobManagerv1.sol#L497-L529), then call [`validateJob`](contracts/AGIJobManagerv1.sol#L532-L561) or [`disapproveJob`](contracts/AGIJobManagerv1.sol#L567-L596) once the review window closes. These steps emit [`ValidationCommitted`](contracts/AGIJobManagerv1.sol#L260), [`ValidationRevealed`](contracts/AGIJobManagerv1.sol#L261), [`JobValidated`](contracts/AGIJobManagerv1.sol#L257), and [`JobDisapproved`](contracts/AGIJobManagerv1.sol#L258).
  - **Slashing & rewards** – correct validators split [`validationRewardPercentage`](contracts/AGIJobManagerv1.sol#L822-L826) of escrow plus any slashed stake, while incorrect votes lose [`slashingPercentage`](contracts/AGIJobManagerv1.sol#L898-L902) and may trigger `StakeSlashed`. Final approval emits [`JobFinalizedAndBurned`](contracts/AGIJobManagerv1.sol#L265-L272).
  - **Random validator selection** – the contract owner can replace the entire validator list with [`setValidatorPool`](contracts/AGIJobManagerv1.sol#L1347-L1362); each job draws validators pseudo‑randomly from this pool to mitigate race conditions and collusion.
  - **Owner controls** – validator settings are adjustable via [`setValidatorConfig`](contracts/AGIJobManagerv1.sol#L956-L993) or individual setters like [`setStakeRequirement`](contracts/AGIJobManagerv1.sol#L890-L893), [`setSlashingPercentage`](contracts/AGIJobManagerv1.sol#L895-L902), [`setValidationRewardPercentage`](contracts/AGIJobManagerv1.sol#L838-L842), [`setMinValidatorReputation`](contracts/AGIJobManagerv1.sol#L904-L907), and [`setSlashedStakeRecipient`](contracts/AGIJobManagerv1.sol#L882-L886), each emitting their respective `*Updated` events. `setValidatorConfig` additionally sets commit, reveal, and review windows plus the number of validators per job.

**Commit, reveal, finalize**

```ts
await agiJobManager.connect(validator).stake(ethers.parseUnits("100", 18));
const commitment = ethers.solidityPackedKeccak256(
  ["address", "uint256", "bool", "bytes32"],
  [validator.address, jobId, true, salt]
);
await agiJobManager
  .connect(validator)
  .commitValidation(jobId, commitment, "", []);
await agiJobManager.connect(validator).revealValidation(jobId, true, salt);
await agiJobManager.connect(validator).validateJob(jobId, "", []);
// JobFinalizedAndBurned(jobId, ...) records payout and burn
```

### Allowlist and ENS Management

Owners can refresh allowlists and name-service references without redeploying the contract.

- `setValidatorMerkleRoot(bytes32 newValidatorMerkleRoot)` – rotates the validator allowlist and emits `ValidatorMerkleRootUpdated`.
- `setAgentMerkleRoot(bytes32 newAgentMerkleRoot)` – updates the agent allowlist and emits `AgentMerkleRootUpdated`.
- `setClubRootNode(bytes32 newClubRootNode)` – changes the ENS root node used for validator proofs, emitting `ClubRootNodeUpdated`.
- `setAgentRootNode(bytes32 newAgentRootNode)` – replaces the agent ENS root node and emits `AgentRootNodeUpdated`.
- `setENS(address newEnsAddress)` / `setNameWrapper(address newNameWrapperAddress)` – refresh external contract references and emit `ENSAddressUpdated` / `NameWrapperAddressUpdated`.

**When to update**

Rotate Merkle roots when membership changes or an allowlist leak is suspected. Update ENS or NameWrapper addresses if the registry or wrapper contracts are redeployed. After each change, monitor the emitted events to confirm the new values.

**Security considerations**

Control these owner functions with a multisig or timelock, and watch the event logs for unexpected modifications. Continuous monitoring helps detect unauthorized updates before they affect job flow.

### Configuration Change Events

Several operational parameters are adjustable by the owner. Every update emits a dedicated event so off‑chain services can react to new values:

- `updateAGITokenAddress(address newToken)` → `AGITokenAddressUpdated` (reverts if `newToken` is the zero address)
- `setBaseIpfsUrl(string newUrl)` → `BaseIpfsUrlUpdated`
- `setRequiredValidatorApprovals(uint256 count)` → `RequiredValidatorApprovalsUpdated`
- `setRequiredValidatorDisapprovals(uint256 count)` → `RequiredValidatorDisapprovalsUpdated`
- `setPremiumReputationThreshold(uint256 newThreshold)` → `PremiumReputationThresholdUpdated`
- `setMaxJobPayout(uint256 newMax)` → `MaxJobPayoutUpdated`
- `setJobDurationLimit(uint256 newLimit)` → `JobDurationLimitUpdated`
- `setCommitRevealWindows(uint256 commitWindow, uint256 revealWindow)` → `CommitRevealWindowsUpdated` – controls how long validators have to commit and reveal votes; the existing `reviewWindow` must be at least `commitWindow + revealWindow`.
- `setReviewWindow(uint256 newWindow)` → `ReviewWindowUpdated` – defines the mandatory wait after completion requests and must be greater than or equal to `commitDuration + revealDuration`.
- `updateTermsAndConditionsIpfsHash(string newHash)` → `TermsAndConditionsIpfsHashUpdated`
- `updateContactEmail(string newEmail)` → `ContactEmailUpdated`
- `updateAdditionalText1(string newText)` → `AdditionalText1Updated`
- `updateAdditionalText2(string newText)` → `AdditionalText2Updated`
- `updateAdditionalText3(string newText)` → `AdditionalText3Updated`

### Enum-Based Dispute Resolution

Disputes between agents and employers are settled by moderators using a strongly typed `DisputeOutcome` enum with `AgentWin` and `EmployerWin` values. This removes ambiguity from string-based resolutions and simplifies client handling.

### Reputation Threshold Gating and Automatic Suspension

Validators must maintain reputation above `minValidatorReputation`. When slashing or penalties drop a validator below this threshold, the contract automatically blacklists them and prevents further validations until their reputation climbs back above the threshold.

### Basis-Point Standardization

All tunable percentages—such as `burnPercentage`, `validationRewardPercentage`, and `slashingPercentage`—are supplied in basis points (1 basis point = 0.01%). This consistent unit avoids rounding issues and clarifies configuration.

### Handling of Slashed Stake

Incorrect validator votes lose stake according to `slashingPercentage`. Slashed tokens are pooled and distributed to validators whose votes matched the outcome. If none were correct, slashed tokens go to `slashedStakeRecipient` and the escrowed validator reward returns to the agent or employer, depending on the final outcome.

### Validator Incentives
Validators follow a commit–reveal process and can finalize their vote only after the review window closes.
- **Quick-start:**
  1. **Stake tokens** – deposit the required $AGI before voting.

     ```ts
     await agiJobManager.connect(validator).stake(ethers.parseUnits("100", 18));
     ```

 2. **Commit vote** – during the commit phase, submit a hashed vote with `commitValidation`.

     ```ts
     await agiJobManager
       .connect(validator)
       .commitValidation(jobId, commitment, "", []);
     ```

 3. **Reveal vote** – after the commit phase ends, disclose your vote with `revealValidation`.

     ```ts
     await agiJobManager.connect(validator).revealValidation(jobId, true, salt);
     ```

 4. **Approve or disapprove** – once the review window elapses, finalize with `validateJob` or `disapproveJob`.

     ```ts
     await agiJobManager.connect(validator).validateJob(jobId, "", []);
     // or
     await agiJobManager.connect(validator).disapproveJob(jobId, "", []);
     ```

  5. **Rewards & slashing** – when required approvals/disapprovals are met, correct validators split `validationRewardPercentage` of escrow plus any slashed stake. Incorrect votes lose `slashingPercentage` of their bonded tokens.

     ```ts
     await agiJobManager.connect(v1).commitValidation(jobId, commit1, "", []);
     await agiJobManager.connect(v1).revealValidation(jobId, true, salt1);
     await agiJobManager.connect(v2).commitValidation(jobId, commit2, "", []);
     await agiJobManager.connect(v2).revealValidation(jobId, false, salt2);
     await agiJobManager.connect(v1).validateJob(jobId, "", []);
     await agiJobManager.connect(v2).disapproveJob(jobId, "", []);
     // finalization distributes rewards and applies slashing
     ```

  6. **Withdraw stake** – succeeds only after every job you've voted on is finalized without disputes.

     ```ts
     await agiJobManager.connect(validator).withdrawStake(ethers.parseUnits("100", 18));
     ```

- **Owner‑configurable parameters:** [setValidatorConfig](contracts/AGIJobManagerv1.sol#L956-L993), [setStakeRequirement](contracts/AGIJobManagerv1.sol#L890-L893), [setSlashingPercentage](contracts/AGIJobManagerv1.sol#L895-L902), [setValidationRewardPercentage](contracts/AGIJobManagerv1.sol#L838-L842), [setMinValidatorReputation](contracts/AGIJobManagerv1.sol#L904-L907), and [setSlashedStakeRecipient](contracts/AGIJobManagerv1.sol#L882-L886).
- Validators must maintain an on-chain stake and reputation before voting. `stakeRequirement` defines the minimum bonded $AGI, while `slashingPercentage` dictates how much of that stake is forfeited on an incorrect vote. When a job concludes, validators whose votes match the outcome split `validationRewardPercentage` of the remaining escrow plus any slashed stake; others lose the slashed amount. The owner may set `validationRewardPercentage` to `0` to disable rewards entirely.

- **Staking & withdrawals** – validators deposit $AGI via `stake()` and may top up incrementally. Validation is only permitted once their total stake meets `stakeRequirement`. Stakes can be withdrawn with `withdrawStake` only after all participated jobs are finalized and undisputed.
- **Aligned rewards** – when a job finalizes, only validators whose votes match the outcome split `validationRewardPercentage` basis points of the remaining escrow along with any slashed stake. If no votes are correct, slashed tokens go to `slashedStakeRecipient` and the reserved validator reward portion is returned to the job's agent or employer.
- **Slashing & reputation penalties** – incorrect votes lose `slashingPercentage` basis points of staked tokens and incur a reputation deduction.
- **Remainder handling** – integer division leftovers from reward or slashed-stake calculations are paid to the first validator on the winning side. If no validator votes correctly, all slashed stake goes to `slashedStakeRecipient` and the validator reward pool returns to the agent or employer as appropriate.
- **Owner‑tunable parameters** – the contract owner can adjust `stakeRequirement` (must be greater than zero), `slashingPercentage` (basis points), `validationRewardPercentage` (basis points), `minValidatorReputation`, `slashedStakeRecipient`, and approval/disapproval thresholds. All of these values can be updated atomically via `setValidatorConfig`, which also sets `slashedStakeRecipient`; each `onlyOwner` update emits a dedicated event.
- **Dispute lock** – once a job is disputed, no additional validator votes are accepted until a moderator resolves the dispute.
- **Single-shot voting** – validators cannot change their vote once cast; a validator address may approve *or* disapprove a job, but never both. Attempts to vote twice revert.

#### Employer-Win Dispute Path

When validators disapprove a job and the employer prevails:

- Disapproving validators split `validationRewardPercentage` basis points of the escrow along with any slashed stake. If none disapprove correctly, slashed tokens go to `slashedStakeRecipient` and the reward portion returns to the employer.
- Approving validators are slashed and receive no reward.
- The remaining escrow returns to the employer.

**Example employer-win dispute**

```ts
await agiJobManager.connect(v1).commitValidation(jobId, commitA, "", []);
await agiJobManager.connect(v1).revealValidation(jobId, true, saltA);
await agiJobManager.connect(v2).commitValidation(jobId, commitB, "", []);
await agiJobManager.connect(v2).revealValidation(jobId, false, saltB);
await agiJobManager.connect(v3).commitValidation(jobId, commitC, "", []);
await agiJobManager.connect(v3).revealValidation(jobId, false, saltC);
await agiJobManager.connect(v1).validateJob(jobId); // incorrect approval; slashed and may trigger auto-blacklist
await agiJobManager.connect(v2).disapproveJob(jobId, "", []); // correct disapproval
await agiJobManager.connect(v3).disapproveJob(jobId, "", []); // employer wins, v2 & v3 split rewards and slashed stake
await agiJobManager.resolveDispute(jobId, AGIJobManager.DisputeOutcome.EmployerWin);
```

## Validator Incentives

Validators must lock stake before participating in job approvals. Each vote carries slashing risk: incorrect votes forfeit a portion of the bonded stake while correct votes earn outcome‑aligned rewards from the job's escrow and any slashed tokens. During disputes, validator rewards come exclusively from the stakes lost by misaligned validators.

### Workflow

1. `stake` – deposit at least `stakeRequirement` of $AGI before voting.
2. `commitValidation` – submit a hashed vote during the commit phase.
3. `revealValidation` – disclose your vote when the reveal window opens.
4. `validateJob` / `disapproveJob` – finalize the vote after the review window.
5. `withdrawStake` – reclaim bonded tokens once all jobs you touched are finalized without dispute.

### Owner Controls

Only the contract owner may tune validator economics via:

- `setValidatorConfig`
- `setValidationRewardPercentage`
- `setStakeRequirement`
- `setSlashingPercentage`
- `setMinValidatorReputation`
- `setSlashedStakeRecipient`

These `onlyOwner` functions define stake requirements, reward shares, slashing rates, reputation floors, and where forfeited stake is sent.

## Table of Contents
- [Quick Links](#quick-links)
- [Disclaimer](#disclaimer)
- [Safety Checklist](#safety-checklist)
- [Overview](#overview)
- [Versions](#versions)
- [Repository Structure](#repository-structure)
- [Project Purpose](#project-purpose)
- [Features](#features)
- [Burn Mechanism](#burn-mechanism)
- [Validator Workflow](#validator-workflow)
- [Allowlist and ENS Management](#allowlist-and-ens-management)
- [Configuration Change Events](#configuration-change-events)
- [Validator Incentives](#validator-incentives)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Quick Start](#quick-start)
- [Deployment](#deployment)
- [Deployed Contracts](#deployed-contracts)
- [Contract Verification](#contract-verification)
- [Example Interactions](#example-interactions)
- [Testing](#testing)
- [Linting](#linting)
- [AGIJobManagerv0.sol Capabilities](#agijobmanagerv0sol-capabilities)
- [The Economy of AGI](#the-economy-of-agi)
- [Legal & Regulatory](#legal--regulatory)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [References](#references)
- [Changelog](#changelog)
- [License](#license)

## Prerequisites
- **Node.js & npm** – Node.js ≥ 20.x LTS (tested with v20.19.4; check with `node --version`).
- **Hardhat 2.26.1** or **Foundry** – choose either development toolkit and use its respective commands (`npx hardhat` or `forge`).
- **Solidity Compiler** – version 0.8.21 (pinned).
- **OpenZeppelin Contracts** – version 5.4.0 with `SafeERC20` for secure token transfers.

Confirm toolchain versions:

```bash
node --version
npm --version
npm view hardhat version
npm view @openzeppelin/contracts version
hardhat --version
```

## Installation
1. **Clone the repository and install pinned dependencies**

   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   npm ci
   ```

2. **Install Node.js 20.x LTS and npm**
   Using [`nvm`](https://github.com/nvm-sh/nvm):

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
   source ~/.nvm/nvm.sh
   nvm install 20
   ```

   > For platform-specific installation details or newer LTS releases (e.g., Node 22 when available), see the [official Node.js documentation](https://nodejs.org/en/download/package-manager).
3. **Set up a development framework**
   - Hardhat
     ```bash
     npm install --save-dev hardhat@2.26.1
     npm install --save-dev @nomicfoundation/hardhat-toolbox@6.1.0
     npx hardhat init
     ```
     *`@nomicfoundation/hardhat-toolbox` bundles the `hardhat-ethers` plugin required by [`scripts/deploy.ts`](scripts/deploy.ts).*
   - Foundry
     ```bash
     curl -L https://foundry.paradigm.xyz | bash
     foundryup
     forge init
     ```

## Configuration
Set the following environment variables in a local `.env` file so deployment tools can access your RPC endpoint and signer:

```bash
API_URL="https://your.rpc.provider"      # RPC endpoint for the target chain
PRIVATE_KEY="0xabc123..."                # Private key of the deploying wallet
# optional: only needed for contract verification
ETHERSCAN_API_KEY="your-etherscan-api-key"
```

Remember to add `.env` to your `.gitignore` and never commit private keys.

```gitignore
.env
```

### Hardhat
Load these variables in `hardhat.config.js`:

```js
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  networks: {
    sepolia: {
      url: process.env.API_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  solidity: {
    version: "0.8.21",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  paths: { sources: "./contracts" },
};
```

### Foundry
Example `foundry.toml` network configuration:

```toml
[rpc_endpoints]
sepolia = "${API_URL}"

[profile.default]
private_key = "${PRIVATE_KEY}"
```


## Quick Start

1. **Clone & install**
   ```bash
   git clone https://github.com/MontrealAI/AGIJobsv0.git
   cd AGIJobsv0
   npm ci
   ```
2. **Compile**
   ```bash
   npm run compile
   ```
3. **Lint & test**
   ```bash
   npm run lint
   npm run test
   ```
4. **Deploy**
   ```bash
   # Hardhat (deploys AGIJobManagerV1)
   npx hardhat run scripts/deploy.ts --network sepolia

   # Foundry
   forge create contracts/AGIJobManagerv1.sol:AGIJobManagerV1 --rpc-url $API_URL --private-key $PRIVATE_KEY
   ```
   Configure your preferred public test network such as [Ethereum Sepolia](https://sepolia.etherscan.io) (chain ID 11155111) or [Base Sepolia](https://sepolia.basescan.org) (chain ID 84532) in your Hardhat or Foundry configuration files.

5. **Verify on a block explorer**
   ```bash
   npx hardhat verify --network sepolia <DEPLOYED_CONTRACT_ADDRESS>
   ```
   Replace `<DEPLOYED_CONTRACT_ADDRESS>` with the address returned from deployment and ensure `ETHERSCAN_API_KEY` is set in your environment.

#### Foundry

```bash
forge verify-contract <DEPLOYED_CONTRACT_ADDRESS> AGIJobManagerV1 --chain sepolia --etherscan-api-key $ETHERSCAN_API_KEY
```

Set the `ETHERSCAN_API_KEY` (or a network-specific variant such as `SEPOLIA_ETHERSCAN_API_KEY`) as described in the [Foundry verification documentation](https://book.getfoundry.sh/reference/forge/verify-contract) to allow Foundry to authenticate with the block explorer API.

6. **Stake & validate (example)**
   ```ts
   await agiJobManager.stake(ethers.parseUnits("100", 18)); // deposit required stake
   await agiJobManager.commitValidation(jobId, commitment, "", []);
   await agiJobManager.revealValidation(jobId, true, salt);
   await agiJobManager.validateJob(jobId); // cast a vote after the review window
   await agiJobManager.withdrawStake(ethers.parseUnits("100", 18)); // withdraw after finalization
   ```

## Deployment

The `scripts/deploy.ts` helper reads its configuration from environment variables. Define them before running the script:

| Variable | Description |
|----------|-------------|
| `AGI_TOKEN_ADDRESS` | Address of the $AGI ERC‑20 token used for payments |
| `BASE_IPFS_URL` | Base URI for job metadata stored on IPFS |
| `ENS_ADDRESS` | ENS registry contract |
| `NAME_WRAPPER_ADDRESS` | ENS NameWrapper contract address |
| `CLUB_ROOT_NODE` | `bytes32` ENS node for AGI club names |
| `AGENT_ROOT_NODE` | `bytes32` ENS node for agent subdomains |
| `VALIDATOR_MERKLE_ROOT` | Merkle root governing validator allowlists |
| `AGENT_MERKLE_ROOT` | Merkle root governing agent allowlists |

Example (Sepolia):

```bash
export AGI_TOKEN_ADDRESS=0xYourAGIToken
export BASE_IPFS_URL="ipfs://"
export ENS_ADDRESS=0xYourENSRegistry
export NAME_WRAPPER_ADDRESS=0xYourNameWrapper
export CLUB_ROOT_NODE=0xYourClubRoot
export AGENT_ROOT_NODE=0xYourAgentRoot
export VALIDATOR_MERKLE_ROOT=0xValidatorRoot
export AGENT_MERKLE_ROOT=0xAgentRoot
npx hardhat run scripts/deploy.ts --network sepolia
```

After deployment the contract owner may adjust these values if needed:

```ts
await agiJobManager.setClubRootNode(0xNewClubRoot);
await agiJobManager.setAgentRootNode(0xNewAgentRoot);
await agiJobManager.setValidatorMerkleRoot(0xNewValidatorRoot);
await agiJobManager.setAgentMerkleRoot(0xNewAgentMerkleRoot);
await agiJobManager.setENS(0xNewEnsRegistry);
await agiJobManager.setNameWrapper(0xNewNameWrapper);
```

Each setter emits a corresponding `*Updated` event for off‑chain tracking.

Always deploy to a public test network first and independently verify the resulting address on at least one block explorer before handling real assets.

### Deployed Contracts

| Version | Network | Address | Status |
|---------|---------|---------|--------|
| v0 | Ethereum mainnet | [0x0178…ba477](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477) | Immutable |
| v1 | _TBA_ | _TBA_ | In development |

> Cross-check the address on an official block explorer before interacting. No mainnet address exists for v1 at this time.

## Contract Verification

The **v0** contract is verified on [Etherscan](https://etherscan.io/address/0x0178b6bad606aaf908f72135b8ec32fc1d5ba477#code) for transparency. To reproduce the verification yourself:

```bash
export ETHERSCAN_API_KEY="your-etherscan-api-key"
npx hardhat verify --network mainnet 0x0178b6bad606aaf908f72135b8ec32fc1d5ba477
```

Using Foundry:

```bash
export ETHERSCAN_API_KEY="your-etherscan-api-key"
forge verify-contract 0x0178b6bad606aaf908f72135b8ec32fc1d5ba477 AGIJobManagerv0 ./legacy/AGIJobManagerv0.sol --chain mainnet
```

Double-check the bytecode from more than one RPC endpoint:

```bash
cast code --rpc-url https://rpc.ankr.com/eth 0x0178b6bad606aaf908f72135b8ec32fc1d5ba477
```

Compare the compiler settings and bytecode against the deployed address on multiple explorers before interacting with any contract instance.

### Example Interactions

- **List a job**
  ```ts
  await agiJobManager.createJob(
    "ipfs://Qm...",
    ethers.parseUnits("10", 18),
    7 * 24 * 60 * 60,
    "Translate article"
  );
  ```
- **Submit work**
  ```ts
  await agiJobManager.requestJobCompletion(jobId, "ipfs://Qm...result");
  ```
- **Verify ownership when applying**
  ```ts
  await agiJobManager.applyForJob(jobId, "alice", proof); // emits OwnershipVerified
  ```
- **Manage NFTs**
  ```ts
  await agiJobManager.listNFT(tokenId, ethers.parseUnits("50", 18));
  await agiJobManager.purchaseNFT(tokenId);
  await agiJobManager.delistNFT(tokenId);
  ```

#### Validator Staking & Flow

Validators stake tokens before voting. Correct votes share rewards, while incorrect votes are slashed and lose reputation. The final approval releases payment, burns tokens, and mints the completion NFT.
Validators whose reputation falls below the owner-set `minValidatorReputation` threshold are prevented from validating and may be automatically blacklisted, but they regain validation privileges automatically once their reputation exceeds the threshold again.

```ts
await agiJobManager.connect(v1).stake(ethers.parseUnits("100", 18));
await agiJobManager.connect(v2).stake(ethers.parseUnits("100", 18));
await agiJobManager.connect(v1).commitValidation(jobId, commit1, "", []);
await agiJobManager.connect(v2).commitValidation(jobId, commit2, "", []);
await agiJobManager.connect(v1).revealValidation(jobId, true, salt1);
await agiJobManager.connect(v2).revealValidation(jobId, true, salt2);
await agiJobManager.connect(v1).validateJob(jobId); // 1/2 approvals
await agiJobManager.connect(v2).validateJob(jobId); // 2/2 approvals triggers burn, slashing logic, and payout
await agiJobManager.connect(v1).withdrawStake(ethers.parseUnits("100", 18)); // after job finalization
```

CLI example using `cast`:

```bash
cast send $AGI_JOB_MANAGER "commitValidation(uint256,bytes32,string,bytes32[])" $JOB_ID $COMMIT_V1 "" [] --from $V1
cast send $AGI_JOB_MANAGER "revealValidation(uint256,bool,bytes32)" $JOB_ID true $SALT_V1 --from $V1
cast send $AGI_JOB_MANAGER "commitValidation(uint256,bytes32,string,bytes32[])" $JOB_ID $COMMIT_V2 "" [] --from $V2
cast send $AGI_JOB_MANAGER "revealValidation(uint256,bool,bytes32)" $JOB_ID true $SALT_V2 --from $V2
cast send $AGI_JOB_MANAGER "validateJob(uint256)" $JOB_ID --from $V1
cast send $AGI_JOB_MANAGER "validateJob(uint256)" $JOB_ID --from $V2 # finalizes and burns
```

### Owner Controls for Validators

The contract owner can tune validator requirements and incentives. Each update emits an event so indexers can track new values:

- `setValidatorConfig(uint256 rewardPct, uint256 repPct, uint256 stakeReq, uint256 slashPct, uint256 minRep, uint256 approvals, uint256 disapprovals, address slashRecipient, uint256 commitWindow, uint256 revealWindow, uint256 reviewWin, uint256 validatorsCount)` – update all validator parameters in one transaction; emits `ValidatorConfigUpdated`.
- `setValidationRewardPercentage(uint256 percentage)` – define the token reward share for validators in basis points (set to `0` to disable); emits `ValidationRewardPercentageUpdated`.
- `setValidatorReputationPercentage(uint256 percentage)` – set the fraction of agent reputation awarded to correct validators; emits `ValidatorReputationPercentageUpdated`.
- `setSlashingPercentage(uint256 percentage)` – adjust how much stake is slashed for incorrect votes (basis points); emits `SlashingPercentageUpdated`.
- `setMinValidatorReputation(uint256 minimum)` – set the reputation floor validators must maintain; emits `MinValidatorReputationUpdated`.
- `setSlashedStakeRecipient(address newRecipient)` – designate the beneficiary of slashed stake when no validator votes correctly; emits `SlashedStakeRecipientUpdated`.

Example updating multiple parameters at once:

```ts
await agiJobManager.setValidatorConfig(
  800,                     // rewardPct = 8%
  800,                     // repPct = 8%
  ethers.parseUnits("100", 18), // stakeReq = 100 AGI
  500,                     // slashPct = 5%
  50,                      // minRep
  2,                       // approvals
  1,                       // disapprovals
  "0x1234567890abcdef1234567890ABCDEF12345678", // slashRecipient
  3600,                   // commitWindow = 1h
  3600,                   // revealWindow = 1h
  7200,                   // reviewWin = 2h
  3                        // validatorsCount
);
```

`ValidatorConfigUpdated` fires with the new settings, enabling off-chain services to monitor validator policy changes.

## Testing

Run the test suite with either Hardhat or Foundry:

```bash
npx hardhat test
forge test
```

## Linting

Ensure code quality with linting tools:

- `solhint` for Solidity contracts
- `eslint` for TypeScript or JavaScript

```bash
npx solhint 'contracts/**/*.sol'
npx eslint .
```

## AGIJobManagerv0.sol Capabilities
- **Job assignments** – employers post jobs, Agents apply, validators confirm completion, and payouts are released.
- **Reputation tracking** – Agents build reputation from finished work which unlocks premium features and influences future opportunities.
- **NFT marketplace** – completed jobs can mint NFTs that are listed, purchased, or delisted using $AGI tokens.
- **Reward pool contributions** – participants can contribute $AGI to a communal pool; custom AGI types and payout percentages enable flexible reward schemes.

## The Economy of AGI
How jobs, reputation, and value circulate within the AGI ecosystem. Read the expanded discussion in [docs/economy-of-agi.md](docs/economy-of-agi.md).

## Legal & Regulatory
Explains the utility-token nature of $AGI and related considerations. See [docs/legal-regulatory.md](docs/legal-regulatory.md) for full details.

## Roadmap
A snapshot of planned enhancements and future directions is available in [docs/roadmap.md](docs/roadmap.md).

## Contributing
Contributions are welcome! Before submitting a pull request, ensure the project compiles, lints, and tests successfully:

```bash
npm run compile
npm run lint
npm run test
```

To contribute:
1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Run the above scripts and fix any issues.
4. Commit your changes: `git commit -am 'Add new feature'`.
5. Push to your fork: `git push origin feature/your-feature`.
6. Open a pull request.
7. For each version bump, record changes in [CHANGELOG.md](CHANGELOG.md).

## Security

**Audit Status:** Unaudited – use at your own risk.

This project has not undergone a formal security audit. Before any production deployment, commission an independent third-party security review.

### Operational Best Practices

- Confirm contract addresses and bytecode on multiple block explorers before transacting.
- Prefer hardware wallets and offline signing when deploying or managing privileged roles.
- Pin dependencies and build artifacts (`npm ci`, fixed compiler versions) to avoid supply-chain surprises.
- Use multisig or time-locked accounts for owner or moderator keys.

Please report security issues responsibly. Contact **security@agi.network** or open a private issue so we can address vulnerabilities quickly.

## References

- Explore the [AGIJobs NFT collection](https://opensea.io/collection/agijobs), showcasing job NFTs minted from completed tasks in this ecosystem. Each token represents delivered work and illustrates how job outputs become tradable assets.

- [AGI.eth](https://agi.eth.limo) – official resources and updates from the AGI ecosystem.
- [Ethereum Name Service (ENS)](https://ens.domains/) – decentralized naming for wallets and contracts.
- [ERC-20 Token Standard](https://eips.ethereum.org/EIPS/eip-20) – fungible token specification.
- [ERC-721 Non-Fungible Token Standard](https://eips.ethereum.org/EIPS/eip-721) – NFT specification used for job artifacts.
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/) – audited building blocks for Ethereum development.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a summary of major changes across releases.

## License
Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

