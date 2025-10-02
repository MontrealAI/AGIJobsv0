# Anti-Collusion Validation Architecture

The v2 contracts harden validation against collusion by combining unpredictable
committee selection, sealed voting, meaningful economic penalties, layered
dispute resolution, and Sybil resistance. Operators configure the
tunable parameters through existing setter functions without redeploying the
system.

## 1. Randomized Validator Selection

* The `ValidationModule` derives committees from the validator pool using a mix
  of participant-supplied entropy, block randomness, and optional external
  beacons. Each round accumulates caller entropy in `pendingEntropy` until a
  future block hash finalises the seed, ensuring validators cannot predict or
  bias the final draw. 【F:contracts/v2/ValidationModule.sol†L137-L195】【F:contracts/v2/ValidationModule.sol†L820-L979】
* Governance can plug in an on-chain RANDAO/VRF coordinator via
  `setRandaoCoordinator`, letting the module XOR `block.prevrandao` with the
  coordinator output for additional entropy. This keeps selection unbiased even
  if a block producer withholds block hashes. 【F:contracts/v2/ValidationModule.sol†L482-L487】【F:contracts/v2/ValidationModule.sol†L932-L943】
* Committee sizes are bounded by `minValidators`, `maxValidators`, and
  `validatorsPerJob`. These parameters scale with job value and cap the number of
  validators per round, making it infeasible for a cartel to occupy enough seats
  to guarantee an outcome. 【F:contracts/v2/ValidationModule.sol†L94-L123】【F:contracts/v2/ValidationModule.sol†L1208-L1267】

## 2. Commit–Reveal Voting Protocol

* Validators authenticate through the `IdentityRegistry` and lock stake before
  they can submit a vote. During the commit window they publish hashed votes via
  `commitValidation`, which stores the commitment keyed by job nonce. 【F:contracts/v2/ValidationModule.sol†L1232-L1341】【F:contracts/v2/IdentityRegistry.sol†L1-L120】
* Reveals only succeed when the submitted approval flag and burn evidence hash
  reproduce the committed digest, preventing validators from changing their vote
  after seeing peers. Commit and reveal windows enforce strict timing for both
  phases so sealed votes stay secret until every validator has committed.
  【F:contracts/v2/ValidationModule.sol†L137-L195】【F:contracts/v2/ValidationModule.sol†L1343-L1488】
* Any mismatch between commitment and reveal reverts, guaranteeing that bribers
  cannot verify compliance before the reveal phase completes. Validators that
  skip the reveal incur automatic stake penalties and temporary bans, further
deterring collusive holdouts. 【F:contracts/v2/ValidationModule.sol†L1624-L1728】

## 3. Stake Slashing & Penalties

* The module slashes validators who either vote against the truthful outcome or
  fail to reveal. `validatorSlashingPercentage` sets the stake loss for incorrect
  votes, while `nonRevealPenaltyBps` governs partial slashes and ban durations
  for missed reveals. 【F:contracts/v2/ValidationModule.sol†L104-L123】【F:contracts/v2/ValidationModule.sol†L1624-L1728】
* Slashing routes through the `StakeManager`, which emits `StakeSlashed` events
  and redistributes funds to employers, the treasury, and other validators per
  governance-configured percentages. Because penalties are automatic and on-chain,
  colluding validators face immediate losses that outweigh any short-term gain.
  【F:contracts/v2/StakeManager.sol†L65-L140】【F:contracts/v2/StakeManager.sol†L2466-L2709】

## 4. Hierarchical Dispute Resolution

* Owners can trigger a failover that escalates suspicious rounds directly into
the dispute flow, clearing the existing committee and letting the
`DisputeModule` assemble a fresh jury or arbitrator panel. 【F:contracts/v2/ValidationModule.sol†L300-L347】
* The `DisputeModule` manages appeal windows, moderator quorums, and optional
  `ArbitratorCommittee` reviews via its commit–reveal process. During disputes it
  can slash validators found negligent or collusive, unwind payouts, and finalise
  the job per the majority decision of the expanded jury. 【F:contracts/v2/modules/DisputeModule.sol†L1-L200】【F:contracts/v2/modules/DisputeModule.sol†L200-L400】

## 5. Anti-Sybil Identity Controls

* Every validator must pass the `IdentityRegistry`’s ENS, wrapper, and
  attestation checks before participating, guaranteeing that each seat corresponds
  to a unique, reputationally anchored identity. 【F:contracts/v2/IdentityRegistry.sol†L1-L200】【F:contracts/v2/ValidationModule.sol†L1285-L1341】
* Governance can extend the registry with soulbound AgentID/ValidatorID tokens
  and reputation engine integration, making it prohibitively expensive for a
  single actor to register enough identities to mount a Sybil attack. The
  registry already tracks additional allowlists, agent metadata, and blacklist
  hooks to block detected colluders. 【F:contracts/v2/IdentityRegistry.sol†L1-L200】【F:contracts/v2/IdentityRegistry.sol†L200-L360】

Together, these layers ensure that every job’s reviewers are a random, sealed
jury with meaningful financial and reputational consequences for collusion. Any
attempt to bribe or sybil the system triggers transparent on-chain penalties and
can be appealed to a broader, more independent panel.
