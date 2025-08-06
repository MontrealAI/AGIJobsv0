# Glossary

- **Agent**: Worker who accepts a job, completes the task, and requests payout.
- **Employer**: User who creates a job and escrows AGI tokens for payment.
- **Validator**: Participant who stakes AGI and votes on whether job results are acceptable.
- **Commit Phase**: Period when selected validators submit hashed votes without revealing their decision.
- **Reveal Phase**: Period following the commit phase when validators disclose their votes so results can be tallied.
- **Review Window**: Delay between an agent's completion request and the start of validation, allowing participants to examine the submitted work.
- **Stake Requirement**: Minimum AGI a validator must lock to participate in the pool.
- **Slashing**: Penalty where a portion of a validator's stake is forfeited for incorrect or missing votes.
- **Agent Stake Requirement**: Minimum AGI an agent must lock before applying for jobs. Agents can read `agentStakeRequirement()` and check their deposited amount with `agentStake(address)`.
- **Verifiable Random Function (VRF)**: Cryptographic randomness used to select validators. Requires configuring a VRF coordinator address, key hash, and subscription.
