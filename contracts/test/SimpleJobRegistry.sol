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
        Job storage storedJob = jobStore[jobId];
        employer = storedJob.employer;
        agent = storedJob.agent;
        reward = uint128(storedJob.reward);
        stake = 0;
        feePct = 0;
        state = storedJob.finalized
            ? 5
            : (storedJob.submitted ? 3 : (storedJob.agent == address(0) ? 1 : 2));
        success = storedJob.finalized;
        agentTypes = 0;
        deadline = storedJob.deadline;
        assignedAt = storedJob.agent == address(0) ? 0 : uint64(block.timestamp);
        uriHash = storedJob.specHash;
        resultHash = storedJob.resultHash;
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
        Job storage storedJob = jobStore[jobId];
        require(storedJob.employer != address(0), "job missing");
        require(storedJob.agent == address(0), "already assigned");
        storedJob.agent = msg.sender;
        storedJob.subdomain = subdomain;
        emit AgentAssigned(jobId, msg.sender, subdomain);
    }

    function submit(
        uint256 jobId,
        bytes32 resultHash,
        string calldata resultURI,
        string calldata /* subdomain */,
        bytes calldata /* proof */
    ) external {
        Job storage storedJob = jobStore[jobId];
        require(storedJob.agent == msg.sender, "not agent");
        storedJob.submitted = true;
        storedJob.resultHash = resultHash;
        storedJob.resultURI = resultURI;
        emit ResultSubmitted(jobId, msg.sender, resultHash, resultURI, storedJob.subdomain);
    }

    function finalizeJob(uint256 jobId, string calldata resultRef) external {
        Job storage storedJob = jobStore[jobId];
        require(storedJob.submitted, "not submitted");
        require(!storedJob.finalized, "finalized");
        require(
            msg.sender == storedJob.agent || msg.sender == storedJob.employer,
            "unauthorized"
        );
        storedJob.finalized = true;
        token.transfer(storedJob.agent, storedJob.reward);
        emit JobFinalized(jobId, resultRef);
    }

    function job(uint256 jobId) external view returns (Job memory) {
        return jobStore[jobId];
    }
}
