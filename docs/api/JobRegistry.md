# JobRegistry API

Coordinates job posting, assignment and dispute resolution.

## Functions

- `createJob(uint256 reward, string uri)` – employer escrows reward and posts IPFS job metadata.
- `applyForJob(uint256 jobId, bytes32 label, bytes32[] proof)` – agent applies using ENS label and Merkle proof.
- `submit(uint256 jobId, bytes32 resultHash, string resultURI)` – agent submits work.
- `finalize(uint256 jobId)` – releases rewards after validation succeeds.
- `raiseDispute(uint256 jobId, string evidence)` – escalate to the dispute module.
- `setModules(address stakeManager, address validationModule, address disputeModule, address certificateNFT, address reputationEngine, address feePool)` – owner wires modules.
- `setTaxPolicy(address policy)` / `acknowledgeTaxPolicy()` – configure tax policy and acknowledge.
- `setAgentRootNode(bytes32 node)` / `setAgentMerkleRoot(bytes32 root)` – load ENS allowlists.

## Events

- `JobFunded(uint256 indexed jobId, address indexed employer, uint256 reward, uint256 fee)`
- `JobCreated(uint256 indexed jobId, address indexed employer, address indexed agent, uint256 reward, uint256 stake, uint256 fee, bytes32 specHash, string uri)`
- `AgentIdentityVerified(address indexed agent, bytes32 indexed node, string label, bool viaWrapper, bool viaMerkle)`
- `JobApplied(uint256 indexed jobId, address indexed agent, string subdomain)`
- `JobSubmitted(uint256 indexed jobId, address indexed worker, bytes32 resultHash, string resultURI, string subdomain)`
- `JobCompleted(uint256 indexed jobId, bool success)`
- `JobPayout(uint256 indexed jobId, address indexed worker, uint256 netPaid, uint256 fee)`
- `JobFinalized(uint256 indexed jobId, address indexed worker)`
- `JobCancelled(uint256 indexed jobId)`
- `JobExpired(uint256 indexed jobId, address caller)`
- `JobDisputed(uint256 indexed jobId, address caller)`
- `DisputeResolved(uint256 indexed jobId, bool employerWins)`
