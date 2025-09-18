# JobRegistry API

Coordinates job posting, assignment and dispute resolution.

## Functions

- `createJob(uint256 reward, uint64 deadline, bytes32 specHash, string uri)` – employer escrows reward, sets a deadline and spec hash, and posts IPFS metadata.
- `createJobWithAgentTypes(uint256 reward, uint64 deadline, uint8 agentTypes, bytes32 specHash, string uri)` – variant that restricts which agent types can apply.
- `submitBurnReceipt(uint256 jobId, bytes32 burnTxHash, uint256 amount, uint256 blockNumber)` – employer records proof of the protocol fee and burn payment for a completed job.
- `confirmEmployerBurn(uint256 jobId, bytes32 burnTxHash)` – employer confirms the burn evidence and records the paid amount required before non-governance finalization can settle funds.
- `applyForJob(uint256 jobId, string subdomain, bytes32[] proof)` – agent applies using ENS subdomain and Merkle proof validation.
- `submit(uint256 jobId, bytes32 resultHash, string resultURI, string subdomain, bytes32[] proof)` – agent submits work after re-verifying their identity against the registry.
- `finalize(uint256 jobId)` – employer (or governance) finalizes a completed job. Employers must have a confirmed burn receipt when protocol fees or burns apply.
- `dispute(uint256 jobId, bytes32 evidenceHash)` / `raiseDispute(uint256 jobId, bytes32 evidenceHash)` – escalate to the dispute module with hashed evidence payloads.
- `setModules(IValidationModule validationModule, IStakeManager stakeManager, IReputationEngine reputationEngine, IDisputeModule disputeModule, ICertificateNFT certificateNFT, IFeePool feePool, address[] ackModules)` – governance wires core modules and authorised acknowledgement helpers.
- `setTaxPolicy(ITaxPolicy policy)` / `acknowledgeTaxPolicy()` – configure the tax policy contract and record participant acknowledgements.
- `setAgentRootNode(bytes32 node)` / `setAgentMerkleRoot(bytes32 root)` – load ENS allowlists for agent verification.
- `setIdentityRegistry(IIdentityRegistry registry)` – swap the on-chain identity registry and refresh cached authorizations.
- `setMinAgentStake(uint256 stake)` – require agents to maintain a minimum stake balance before applying.

## Events

- `JobFunded(uint256 indexed jobId, address indexed employer, uint256 reward, uint256 fee)`
- `JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)`
- `AgentIdentityVerified(address indexed agent, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle)`
- `ApplicationSubmitted(uint256 indexed jobId, address indexed applicant, string subdomain)`
- `AgentAssigned(uint256 indexed jobId, address indexed agent, string subdomain)`
- `ResultSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI, string subdomain)`
- `JobApplied(uint256 indexed jobId, address indexed agent, string subdomain)` (legacy alias of `AgentAssigned`)
- `JobSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI, string subdomain)` (legacy alias of `ResultSubmitted`)
- `JobCompleted(uint256 indexed jobId, bool success)`
- `JobPayout(uint256 indexed jobId, address indexed worker, uint256 base, uint256 bonus, uint256 fee)`
- `JobFinalized(uint256 indexed jobId, address indexed worker)`
- `JobCancelled(uint256 indexed jobId)`
- `JobExpired(uint256 indexed jobId, address indexed caller)`
- `JobDisputed(uint256 indexed jobId, address indexed caller)`
- `DisputeResolved(uint256 indexed jobId, bool employerWins)`
- `JobParametersUpdated(uint256 reward, uint256 stake, uint256 maxJobReward, uint256 maxJobDuration, uint256 minAgentStake)`
- `BurnReceiptSubmitted(uint256 indexed jobId, bytes32 indexed burnTxHash, uint256 amount, uint256 blockNumber)`
- `BurnConfirmed(uint256 indexed jobId, bytes32 indexed burnTxHash)`
- `BurnDiscrepancy(uint256 indexed jobId, uint256 receiptAmount, uint256 expectedAmount)`
- `GovernanceFinalized(uint256 indexed jobId, address indexed caller, bool fundsRedirected)`
- `ModuleUpdated(string module, address indexed newAddress)`
- `ValidationModuleUpdated(address module)`
- `StakeManagerUpdated(address manager)`
- `ReputationEngineUpdated(address engine)`
- `DisputeModuleUpdated(address module)`
- `CertificateNFTUpdated(address nft)`
- `IdentityRegistryUpdated(address identityRegistry)`
- `AgentRootNodeUpdated(bytes32 node)`
- `AgentMerkleRootUpdated(bytes32 root)`
- `ValidatorRootNodeUpdated(bytes32 node)`
- `ValidatorMerkleRootUpdated(bytes32 root)`
- `AgentAuthCacheUpdated(address indexed agent, bool authorized)`
- `AgentAuthCacheDurationUpdated(uint256 duration)`
- `AgentAuthCacheVersionBumped(uint256 version)`
- `TaxPolicyUpdated(address policy, uint256 version)`
- `TaxAcknowledged(address indexed user, uint256 version, string acknowledgement)`
- `AcknowledgerUpdated(address indexed acknowledger, bool allowed)`
- `FeePoolUpdated(address pool)`
- `FeePctUpdated(uint256 feePct)`
- `ValidatorRewardPctUpdated(uint256 pct)`
- `ExpirationGracePeriodUpdated(uint256 period)`
- `PauserUpdated(address indexed pauser)`
- `TreasuryUpdated(address treasury)`
