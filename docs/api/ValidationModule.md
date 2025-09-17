# ValidationModule API

Manages commit‑reveal voting for submitted jobs.

## Functions

- `setValidatorPool(address[] newPool)` – owner sets initial validator set.
- `setJobRegistry(address registry)` / `setStakeManager(address manager)` – wire core modules.
- `setCommitRevealWindows(uint256 commitDur, uint256 revealDur)` – configure timing.
- `setValidatorBounds(uint256 minVals, uint256 maxVals)` / `setValidatorsPerJob(uint256 count)` – configure validator bounds and default committee size.
- `setValidatorSlashingPct(uint256 pct)` / `setApprovalThreshold(uint256 pct)` / `setRequiredValidatorApprovals(uint256 count)` – configure slashing and thresholds.
- `setSelectionStrategy(SelectionStrategy strategy)` – choose between a rotating window or reservoir sampling. Governance can adjust this to balance gas cost and fairness.
- `start(uint256 jobId, uint256 entropy)` – select validators and open the commit window.
- `selectValidators(uint256 jobId, uint256 entropy)` – pick validators using on-chain randomness; mixes `block.prevrandao` or, if unavailable, recent block hashes with `msg.sender` so no off-chain randomness provider is required.
- `commitValidation(uint256 jobId, bytes32 commitHash, string subdomain, bytes32[] proof)` – commit to a vote (ENS parameters required).
- `revealValidation(uint256 jobId, bool approve, bytes32 salt, string subdomain, bytes32[] proof)` – reveal vote (ENS parameters required).
  For both, `subdomain` is the validator's label under `club.agi.eth`.
- `finalize(uint256 jobId)` – tally reveals and trigger payout.
- `resetJobNonce(uint256 jobId)` – clear validator commitments for a job.

## Events

- `ValidatorsUpdated(address[] validators)`
- `TimingUpdated(uint256 commitWindow, uint256 revealWindow)`
- `ValidatorBoundsUpdated(uint256 minValidators, uint256 maxValidators)`
- `ValidatorSlashingPctUpdated(uint256 pct)`
- `ApprovalThresholdUpdated(uint256 pct)`
- `ValidatorsPerJobUpdated(uint256 count)`
- `CommitWindowUpdated(uint256 window)` / `RevealWindowUpdated(uint256 window)`
- `RequiredValidatorApprovalsUpdated(uint256 count)`
- `JobRegistryUpdated(address registry)` / `StakeManagerUpdated(address manager)` / `IdentityRegistryUpdated(address registry)`
- `JobNonceReset(uint256 jobId)`
- `SelectionStrategyUpdated(SelectionStrategy strategy)`
- `ValidatorIdentityVerified(address indexed validator, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle)`
- `ValidationCommitted(uint256 jobId, address validator, bytes32 commitHash, string subdomain)`
- `ValidationRevealed(uint256 jobId, address validator, bool approve, bytes32 burnTxHash, string subdomain)`
- `ValidationTallied(uint256 jobId, bool success, uint256 approvals, uint256 rejections)`
- `ValidationResult(uint256 jobId, bool success)`
