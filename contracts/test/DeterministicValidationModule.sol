// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Deterministic validation module used in localnet end-to-end tests.
/// @dev The contract intentionally keeps the state minimal while providing
///      deterministic outputs for commit, reveal, and finalize flows so the
///      TypeScript tests can assert behaviour without relying on randomness.
contract DeterministicValidationModule {
    struct CommitRecord {
        bytes32 commitHash;
        string subdomain;
        uint256 nonce;
        uint256 committedAt;
        bool exists;
    }

    struct RevealRecord {
        bool approve;
        bytes32 salt;
        string subdomain;
        uint256 revealedAt;
        bool exists;
    }

    struct RoundConfig {
        uint256 commitDeadline;
        uint256 revealDeadline;
    }

    mapping(uint256 => uint256) private nonces;
    mapping(uint256 => bool) private tallied;
    mapping(uint256 => RoundConfig) private roundConfig;

    mapping(uint256 => mapping(address => CommitRecord)) private commits;
    mapping(uint256 => mapping(address => RevealRecord)) private reveals;

    mapping(uint256 => uint256) private approvals;
    mapping(uint256 => uint256) private rejections;

    address[] private validatorSet;
    bool public result = true;

    event CommitRecorded(
        uint256 indexed jobId,
        address indexed validator,
        bytes32 commitHash,
        string subdomain
    );

    event RevealRecorded(
        uint256 indexed jobId,
        address indexed validator,
        bool approve,
        bytes32 salt,
        string subdomain
    );

    event Finalized(uint256 indexed jobId, bool result);

    function setValidators(address[] calldata newValidators) external {
        delete validatorSet;
        for (uint256 i = 0; i < newValidators.length; i++) {
            validatorSet.push(newValidators[i]);
        }
    }

    function setResult(bool newResult) external {
        result = newResult;
    }

    function setDeadlines(
        uint256 jobId,
        uint256 commitDeadline,
        uint256 revealDeadline
    ) external {
        roundConfig[jobId] = RoundConfig({
            commitDeadline: commitDeadline,
            revealDeadline: revealDeadline
        });
    }

    function jobNonce(uint256 jobId) external view returns (uint256) {
        return nonces[jobId];
    }

    function commitValidation(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata /* proof */
    ) external {
        CommitRecord storage record = commits[jobId][msg.sender];
        record.commitHash = commitHash;
        record.subdomain = subdomain;
        record.nonce = nonces[jobId];
        record.committedAt = block.timestamp;
        record.exists = true;
        emit CommitRecorded(jobId, msg.sender, commitHash, subdomain);
    }

    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata /* proof */
    ) external {
        CommitRecord storage commitRecord = commits[jobId][msg.sender];
        require(commitRecord.exists, "commit required");

        RevealRecord storage record = reveals[jobId][msg.sender];
        record.approve = approve;
        record.salt = salt;
        record.subdomain = subdomain;
        record.revealedAt = block.timestamp;
        record.exists = true;

        if (approve) {
            approvals[jobId] += 1;
        } else {
            rejections[jobId] += 1;
        }

        emit RevealRecorded(jobId, msg.sender, approve, salt, subdomain);
    }

    function _finalize(uint256 jobId) internal returns (bool success) {
        require(!tallied[jobId], "finalized");
        tallied[jobId] = true;
        nonces[jobId] += 1;
        success = result;
        emit Finalized(jobId, success);
    }

    function finalize(uint256 jobId) public returns (bool success) {
        return _finalize(jobId);
    }

    function finalizeValidation(uint256 jobId) external returns (bool success) {
        return _finalize(jobId);
    }

    function forceFinalize(uint256 jobId) external returns (bool success) {
        return _finalize(jobId);
    }

    function getCommitRecord(
        uint256 jobId,
        address validator
    ) external view returns (CommitRecord memory) {
        return commits[jobId][validator];
    }

    function getRevealRecord(
        uint256 jobId,
        address validator
    ) external view returns (RevealRecord memory) {
        return reveals[jobId][validator];
    }

    function finalized(uint256 jobId) external view returns (bool) {
        return tallied[jobId];
    }

    function rounds(
        uint256 jobId
    )
        external
        view
        returns (
            address[] memory validators,
            address[] memory participants,
            uint256 commitDeadline,
            uint256 revealDeadline,
            uint256 approvalsCount,
            uint256 rejectionsCount,
            bool isTallied,
            uint256 committeeSize
        )
    {
        RoundConfig storage config = roundConfig[jobId];
        validators = validatorSet;
        participants = validatorSet;
        commitDeadline = config.commitDeadline;
        revealDeadline = config.revealDeadline;
        approvalsCount = approvals[jobId];
        rejectionsCount = rejections[jobId];
        isTallied = tallied[jobId];
        committeeSize = validatorSet.length;
    }

    function validators(uint256) external view returns (address[] memory vals) {
        vals = validatorSet;
    }

    function votes(
        uint256 jobId,
        address validator
    ) external view returns (bool approved) {
        RevealRecord storage record = reveals[jobId][validator];
        approved = record.exists && record.approve;
    }
}
