// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title SimpleJobRegistry
/// @notice Minimal job lifecycle registry used for local agent gateway E2E tests.
contract SimpleJobRegistry {
    struct Job {
        address employer;
        address agent;
        uint256 reward;
        uint64 deadline;
        bytes32 specHash;
        string uri;
        string subdomain;
        bool submitted;
        bool finalized;
        bytes32 resultHash;
        string resultURI;
    }

    IERC20 public immutable token;
    uint256 public nextJobId = 1;

    mapping(uint256 => Job) private jobStore;

    event JobCreated(
        uint256 indexed jobId,
        address indexed employer,
        address indexed agent,
        uint256 reward,
        uint256 stake,
        uint256 fee,
        bytes32 specHash,
        string uri
    );

    event AgentAssigned(uint256 indexed jobId, address indexed agent, string subdomain);

    event ResultSubmitted(
        uint256 indexed jobId,
        address indexed worker,
        bytes32 resultHash,
        string resultURI,
        string subdomain
    );

    event JobFinalized(uint256 indexed jobId, string resultRef);

    constructor(IERC20 stakingToken) {
        token = stakingToken;
    }

    function jobs(uint256 jobId)
        external
        view
        returns (
            address employer,
            address agent,
            uint128 reward,
            uint96 stake,
            uint32 feePct,
            uint8 state,
            bool success,
            uint8 agentTypes,
            uint64 deadline,
            uint64 assignedAt,
            bytes32 uriHash,
            bytes32 resultHash
        )
    {
        Job storage job = jobStore[jobId];
        employer = job.employer;
        agent = job.agent;
        reward = uint128(job.reward);
        stake = 0;
        feePct = 0;
        state = job.finalized ? 5 : (job.submitted ? 3 : (job.agent == address(0) ? 1 : 2));
        success = job.finalized;
        agentTypes = 0;
        deadline = job.deadline;
        assignedAt = job.agent == address(0) ? 0 : uint64(block.timestamp);
        uriHash = job.specHash;
        resultHash = job.resultHash;
    }

    function taxPolicy() external pure returns (address) {
        return address(0);
    }

    function createJob(
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        jobId = nextJobId++;
        token.transferFrom(msg.sender, address(this), reward);
        jobStore[jobId] = Job({
            employer: msg.sender,
            agent: address(0),
            reward: reward,
            deadline: deadline,
            specHash: specHash,
            uri: uri,
            subdomain: "",
            submitted: false,
            finalized: false,
            resultHash: bytes32(0),
            resultURI: ""
        });
        emit JobCreated(jobId, msg.sender, address(0), reward, 0, 0, specHash, uri);
    }

    function applyForJob(
        uint256 jobId,
        string calldata subdomain,
        bytes calldata /* proof */
    ) external {
        Job storage job = jobStore[jobId];
        require(job.employer != address(0), "job missing");
        require(job.agent == address(0), "already assigned");
        job.agent = msg.sender;
        job.subdomain = subdomain;
        emit AgentAssigned(jobId, msg.sender, subdomain);
    }

    function submit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata /* subdomain */,
        bytes calldata /* proof */
    ) external {
        Job storage job = jobStore[jobId];
        require(job.agent == msg.sender, "not agent");
        job.submitted = true;
        job.resultHash = resultHash;
        job.resultURI = resultURI;
        emit ResultSubmitted(jobId, msg.sender, resultHash, resultURI, job.subdomain);
    }

    function finalizeJob(uint256 jobId, string calldata resultRef) external {
        Job storage job = jobStore[jobId];
        require(job.submitted, "not submitted");
        require(!job.finalized, "finalized");
        require(msg.sender == job.agent || msg.sender == job.employer, "unauthorized");
        job.finalized = true;
        token.transfer(job.agent, job.reward);
        emit JobFinalized(jobId, resultRef);
    }

    function job(uint256 jobId) external view returns (Job memory) {
        return jobStore[jobId];
    }
}
