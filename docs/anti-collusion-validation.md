# Anti-Collusion Validation Architecture

The v2 contracts harden validation against collusion by combining unpredictable
committee selection, sealed voting, meaningful economic penalties, layered
dispute resolution, and Sybil resistance. Operators configure the
tunable parameters through existing setter functions without redeploying the
system.

## 1. Randomized Validator Selection

* The `ValidationModule` derives committees from the validator pool using a mix
  of participant-supplied entropy, future block hashes, and optional external
  beacons. Each `selectValidators` call before the anchor block is mined XORs
  caller entropy into `pendingEntropy`, then finalises the seed with
  `blockhash`, `block.prevrandao`, and the optional coordinator output so no
  validator can predict or bias the draw. 【F:contracts/v2/ValidationModule.sol†L820-L947】
* Governance can plug in an on-chain RANDAO/VRF coordinator via
  `setRandaoCoordinator`, letting the module combine the coordinator value with
  `block.prevrandao`. Even if a proposer withholds a block hash, the extra
  entropy source keeps the draw unbiased. 【F:contracts/v2/ValidationModule.sol†L476-L485】【F:contracts/v2/ValidationModule.sol†L931-L945】
* Weighted sampling prefers high-stake, reputation-clean validators while still
  rotating through the pool. The module filters banned or unverified addresses
  and weights the final reservoir sample by stake, making it statistically
  prohibitive for a cartel to capture the whole committee. 【F:contracts/v2/ValidationModule.sol†L980-L1160】
* Committee sizes are bounded by `minValidators`, `maxValidators`, and
  `validatorsPerJob`. These parameters scale with job value and cap how many
  seats a round exposes, further reducing the odds of a colluding majority.
  【F:contracts/v2/ValidationModule.sol†L85-L123】【F:contracts/v2/ValidationModule.sol†L592-L605】

## 2. Commit–Reveal Voting Protocol

* Validators authenticate through the `IdentityRegistry` and lock stake before
  they can submit a vote. During the commit window they publish hashed votes via
  `commitValidation`, which stores the commitment keyed by the job nonce so it
  cannot be replayed. 【F:contracts/v2/ValidationModule.sol†L1239-L1314】【F:contracts/v2/IdentityRegistry.sol†L991-L1068】
* Reveals only succeed when the submitted approval flag, burn evidence hash, and
  salt recreate the committed digest. Commit and reveal windows enforce sealed
  voting until every validator has committed, so peers cannot adapt their votes
  mid-round. 【F:contracts/v2/ValidationModule.sol†L1320-L1427】
* Any mismatch between commitment and reveal reverts, guaranteeing that bribers
  cannot verify compliance before the reveal phase completes. Validators that
  skip the reveal incur automatic stake penalties and temporary bans, further
  deterring collusive holdouts. 【F:contracts/v2/ValidationModule.sol†L1698-L1729】

## 3. Stake Slashing & Penalties

* The module slashes validators who either vote against the truthful outcome or
  fail to reveal. `validatorSlashingPercentage` sets the loss for incorrect
  votes, while `nonRevealPenaltyBps` and `nonRevealBanBlocks` enforce partial
  slashes plus temporary suspensions for missed reveals. 【F:contracts/v2/ValidationModule.sol†L85-L123】【F:contracts/v2/ValidationModule.sol†L1698-L1729】
* Slashing routes through the `StakeManager`, which emits `StakeSlashed` events
  and redistributes funds to employers, the treasury, operator pool, and other
  validators according to governance-set splits. Automated enforcement makes
  collusion economically irrational. 【F:contracts/v2/StakeManager.sol†L60-L142】【F:contracts/v2/StakeManager.sol†L2466-L2681】

## 4. Hierarchical Dispute Resolution

* Owners can trigger a failover that escalates suspicious rounds directly into
  the dispute flow, clearing the existing committee and letting the
  `DisputeModule` assemble a fresh jury or arbitrator panel. 【F:contracts/v2/ValidationModule.sol†L301-L344】
* The `DisputeModule` manages appeal windows, moderator quorums, and optional
  `ArbitratorCommittee` reviews via its commit–reveal process. During disputes it
  can slash validators found negligent or collusive, unwind payouts, and finalise
  the job per the majority decision of the expanded jury. 【F:contracts/v2/modules/DisputeModule.sol†L1-L544】

## 5. Anti-Sybil Identity Controls

* Every validator must pass the `IdentityRegistry`’s ENS, wrapper, attestation,
  and blacklist checks before participating, ensuring each seat maps to a
  traceable identity. 【F:contracts/v2/IdentityRegistry.sol†L991-L1068】【F:contracts/v2/ValidationModule.sol†L1239-L1349】
* Governance can extend the registry with ENS aliasing, attestation registries,
  and additional validator allowlists, making large-scale Sybil registration
  prohibitively expensive and easy to audit. 【F:contracts/v2/IdentityRegistry.sol†L200-L360】【F:contracts/v2/IdentityRegistry.sol†L991-L1068】

Together, these layers ensure that every job’s reviewers are a random, sealed
jury with meaningful financial and reputational consequences for collusion. Any
attempt to bribe or sybil the system triggers transparent on-chain penalties and
can be appealed to a broader, more independent panel.
