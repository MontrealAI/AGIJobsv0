// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {ENSAuthorizer} from "./ENSAuthorizer.sol";
import {StakeManager} from "./StakeManager.sol";
import {DomainAccessController} from "./DomainAccessController.sol";
import {ZkBatchVerifier} from "./ZkBatchVerifier.sol";

/**
 * @title ValidatorConstellation
 * @notice Coordinates commit-reveal validation rounds, Sentinel guardrails and zk-batched attestations.
 */
contract ValidatorConstellation is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    enum ValidatorStatus {
        None,
        Active,
        Suspended
    }

    struct ValidatorInfo {
        string ensName;
        bytes32 namehash;
        bool isAlphaNamespace;
        ValidatorStatus status;
        bool exists;
    }

    struct Vote {
        bytes32 commitHash;
        bool revealed;
        bool support;
        bytes32 salt;
    }

    struct Round {
        bytes32 domain;
        bytes32 jobBatchId;
        bytes32 jobsRoot;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 finalisedAt;
        uint32 yesVotes;
        uint32 noVotes;
        uint32 totalRevealed;
        bool finalised;
        bool zkVerified;
        bytes32 proofHash;
    }

    struct Config {
        uint64 commitWindow;
        uint64 revealWindow;
        uint16 quorumBps;
        uint16 incorrectVotePenaltyBps;
        uint16 missedRevealPenaltyBps;
        uint32 defaultCommitteeSize;
        bytes32 entropySalt;
        bytes32 zkSalt;
    }

    StakeManager public immutable stakeManager;
    ENSAuthorizer public immutable ensAuthorizer;
    DomainAccessController public immutable domainController;
    ZkBatchVerifier public immutable zkVerifier;

    Config public config;

    EnumerableSet.AddressSet private _activeValidators;
    mapping(address => ValidatorInfo) private _validators;

    mapping(uint256 => Round) private _rounds;
    mapping(uint256 => mapping(address => Vote)) private _votes;
    mapping(uint256 => address[]) private _roundCommittees;
    mapping(uint256 => mapping(address => bool)) private _committeeMembership;

    mapping(address => bool) public coordinators;

    uint256 public nextRoundId = 1;

    event CoordinatorUpdated(address indexed coordinator, bool enabled);
    event ValidatorRegistered(address indexed validator, string ensName, bool isAlphaNamespace);
    event ValidatorStatusChanged(address indexed validator, ValidatorStatus status);
    event ValidationRoundStarted(
        uint256 indexed roundId,
        bytes32 indexed domain,
        bytes32 indexed jobBatchId,
        bytes32 jobsRoot,
        address[] committee,
        uint64 commitDeadline,
        uint64 revealDeadline
    );
    event VoteCommitted(uint256 indexed roundId, address indexed validator, bytes32 commitment);
    event VoteRevealed(uint256 indexed roundId, address indexed validator, bool support, bytes32 salt);
    event RoundFinalised(
        uint256 indexed roundId,
        bool truth,
        uint32 yesVotes,
        uint32 noVotes,
        bytes32 proofHash,
        uint64 finalisedAt
    );
    event ValidatorPenaltyApplied(
        uint256 indexed roundId,
        address indexed validator,
        bytes32 indexed reason,
        uint256 penalty
    );
    event ConfigUpdated(Config newConfig);

    error NotCoordinator(address caller);
    error ValidatorNotActive(address validator);
    error InvalidCommitteeSize(uint256 size, uint256 availableValidators);
    error RoundNotFound(uint256 roundId);
    error CommitWindowClosed(uint256 roundId);
    error RevealWindowClosed(uint256 roundId);
    error NotInCommittee(address validator, uint256 roundId);
    error AlreadyCommitted(address validator, uint256 roundId);
    error AlreadyRevealed(address validator, uint256 roundId);
    error NoCommitment(address validator, uint256 roundId);
    error CommitmentMismatch();
    error RoundStillOngoing(uint256 roundId);
    error QuorumNotMet(uint256 roundId, uint256 quorum, uint256 actual);

    modifier onlyCoordinator() {
        if (msg.sender != owner() && !coordinators[msg.sender]) {
            revert NotCoordinator(msg.sender);
        }
        _;
    }

    constructor(
        StakeManager stakeManager_,
        ENSAuthorizer ensAuthorizer_,
        DomainAccessController domainController_,
        ZkBatchVerifier zkVerifier_,
        Config memory config_
    ) Ownable(msg.sender) {
        stakeManager = stakeManager_;
        ensAuthorizer = ensAuthorizer_;
        domainController = domainController_;
        zkVerifier = zkVerifier_;
        config = config_;
    }

    function updateConfig(Config calldata newConfig) external onlyOwner {
        config = newConfig;
        emit ConfigUpdated(newConfig);
    }

    function setCoordinator(address coordinator, bool enabled) external onlyOwner {
        coordinators[coordinator] = enabled;
        emit CoordinatorUpdated(coordinator, enabled);
    }

    function registerValidator(
        string calldata ensName,
        bytes32 namehash,
        bool isAlphaNamespace,
        bytes32[] calldata proof
    ) external {
        ensAuthorizer.verify(msg.sender, namehash, ENSAuthorizer.Role.Validator, isAlphaNamespace, proof);
        uint256 stakeBalance = stakeManager.stakeOf(msg.sender);
        if (stakeBalance < stakeManager.minimumStake()) {
            revert ValidatorNotActive(msg.sender);
        }
        ValidatorInfo storage info = _validators[msg.sender];
        info.ensName = ensName;
        info.namehash = namehash;
        info.isAlphaNamespace = isAlphaNamespace;
        info.status = ValidatorStatus.Active;
        info.exists = true;
        _activeValidators.add(msg.sender);
        emit ValidatorRegistered(msg.sender, ensName, isAlphaNamespace);
        emit ValidatorStatusChanged(msg.sender, ValidatorStatus.Active);
    }

    function setValidatorStatus(address validator, ValidatorStatus status) external onlyOwner {
        ValidatorInfo storage info = _validators[validator];
        info.status = status;
        if (status == ValidatorStatus.Active) {
            _activeValidators.add(validator);
        } else {
            _activeValidators.remove(validator);
        }
        emit ValidatorStatusChanged(validator, status);
    }

    function activeValidators() external view returns (address[] memory) {
        return _activeValidators.values();
    }

    function roundCommittee(uint256 roundId) external view returns (address[] memory) {
        return _roundCommittees[roundId];
    }

    function roundState(uint256 roundId) external view returns (Round memory) {
        Round memory round = _rounds[roundId];
        if (round.commitDeadline == 0) {
            revert RoundNotFound(roundId);
        }
        return round;
    }

    function startValidationRound(
        bytes32 domain,
        bytes32 jobBatchId,
        bytes32 jobsRoot,
        uint256 committeeSize,
        bytes32 externalEntropy
    ) external onlyCoordinator returns (uint256 roundId) {
        domainController.ensureDomainActive(domain);
        uint256 validatorCount = _activeValidators.length();
        uint256 size = committeeSize == 0 ? config.defaultCommitteeSize : committeeSize;
        if (validatorCount < size) {
            revert InvalidCommitteeSize(size, validatorCount);
        }
        roundId = nextRoundId++;
        bytes32 entropy = _deriveEntropy(domain, jobBatchId, externalEntropy, roundId);
        address[] memory committee = _selectCommittee(entropy, size);
        uint64 commitDeadline = uint64(block.timestamp + config.commitWindow);
        uint64 revealDeadline = uint64(commitDeadline + config.revealWindow);

        Round storage round = _rounds[roundId];
        round.domain = domain;
        round.jobBatchId = jobBatchId;
        round.jobsRoot = jobsRoot;
        round.commitDeadline = commitDeadline;
        round.revealDeadline = revealDeadline;

        address[] storage storedCommittee = _roundCommittees[roundId];
        for (uint256 i = 0; i < committee.length; i++) {
            storedCommittee.push(committee[i]);
            _committeeMembership[roundId][committee[i]] = true;
        }

        emit ValidationRoundStarted(
            roundId,
            domain,
            jobBatchId,
            jobsRoot,
            committee,
            commitDeadline,
            revealDeadline
        );
    }

    function commitVote(uint256 roundId, bytes32 commitment) external {
        Round storage round = _rounds[roundId];
        if (round.commitDeadline == 0) {
            revert RoundNotFound(roundId);
        }
        domainController.ensureDomainActive(round.domain);
        if (block.timestamp > round.commitDeadline) {
            revert CommitWindowClosed(roundId);
        }
        if (!_committeeMembership[roundId][msg.sender]) {
            revert NotInCommittee(msg.sender, roundId);
        }
        Vote storage vote = _votes[roundId][msg.sender];
        if (vote.commitHash != bytes32(0)) {
            revert AlreadyCommitted(msg.sender, roundId);
        }
        vote.commitHash = commitment;
        emit VoteCommitted(roundId, msg.sender, commitment);
    }

    function revealVote(
        uint256 roundId,
        bytes32 salt,
        bool support
    ) external {
        Round storage round = _rounds[roundId];
        if (round.commitDeadline == 0) {
            revert RoundNotFound(roundId);
        }
        if (block.timestamp <= round.commitDeadline) {
            revert CommitWindowClosed(roundId);
        }
        if (block.timestamp > round.revealDeadline) {
            revert RevealWindowClosed(roundId);
        }
        if (!_committeeMembership[roundId][msg.sender]) {
            revert NotInCommittee(msg.sender, roundId);
        }
        Vote storage vote = _votes[roundId][msg.sender];
        if (vote.commitHash == bytes32(0)) {
            revert NoCommitment(msg.sender, roundId);
        }
        if (vote.revealed) {
            revert AlreadyRevealed(msg.sender, roundId);
        }
        bytes32 recalculated = keccak256(
            abi.encodePacked(roundId, msg.sender, support, salt, round.jobsRoot)
        );
        if (recalculated != vote.commitHash) {
            revert CommitmentMismatch();
        }
        vote.revealed = true;
        vote.support = support;
        vote.salt = salt;
        if (support) {
            round.yesVotes += 1;
        } else {
            round.noVotes += 1;
        }
        round.totalRevealed += 1;
        emit VoteRevealed(roundId, msg.sender, support, salt);
    }

    function finalizeRound(
        uint256 roundId,
        bytes calldata zkProof,
        uint256 jobsCount
    ) external nonReentrant onlyCoordinator {
        Round storage round = _rounds[roundId];
        if (round.commitDeadline == 0) {
            revert RoundNotFound(roundId);
        }
        if (round.finalised) {
            revert RoundStillOngoing(roundId);
        }
        if (block.timestamp <= round.revealDeadline) {
            revert RoundStillOngoing(roundId);
        }
        uint256 committeeSize = _roundCommittees[roundId].length;
        uint256 requiredVotes = (committeeSize * config.quorumBps + 9_999) / 10_000;
        if (round.totalRevealed < requiredVotes) {
            revert QuorumNotMet(roundId, requiredVotes, round.totalRevealed);
        }
        bool truth = round.yesVotes >= round.noVotes;
        address[] storage committee = _roundCommittees[roundId];
        for (uint256 i = 0; i < committee.length; i++) {
            address validator = committee[i];
            Vote storage vote = _votes[roundId][validator];
            if (!vote.revealed) {
                _applyPenalty(roundId, validator, config.missedRevealPenaltyBps, "MISSED_REVEAL");
            } else if (vote.support != truth) {
                _applyPenalty(roundId, validator, config.incorrectVotePenaltyBps, "INCORRECT_VOTE");
            }
        }
        bytes32 expectedHash = keccak256(
            abi.encodePacked(roundId, round.jobBatchId, round.jobsRoot, jobsCount, config.zkSalt)
        );
        zkVerifier.verifyAndEmit(zkProof, expectedHash, round.domain, round.jobBatchId, round.jobsRoot, jobsCount);
        round.finalised = true;
        round.zkVerified = true;
        round.proofHash = keccak256(zkProof);
        round.finalisedAt = uint64(block.timestamp);
        emit RoundFinalised(roundId, truth, round.yesVotes, round.noVotes, round.proofHash, round.finalisedAt);
    }

    function voteFor(uint256 roundId, address validator) external view returns (Vote memory) {
        return _votes[roundId][validator];
    }

    function validatorInfo(address validator) external view returns (ValidatorInfo memory) {
        return _validators[validator];
    }

    function _applyPenalty(
        uint256 roundId,
        address validator,
        uint16 penaltyBps,
        bytes32 reason
    ) internal {
        if (penaltyBps == 0) {
            return;
        }
        uint256 penalty = stakeManager.slash(validator, penaltyBps, reason);
        if (penalty > 0) {
            emit ValidatorPenaltyApplied(roundId, validator, reason, penalty);
            if (stakeManager.stakeOf(validator) < stakeManager.minimumStake()) {
                _validators[validator].status = ValidatorStatus.Suspended;
                _activeValidators.remove(validator);
                emit ValidatorStatusChanged(validator, ValidatorStatus.Suspended);
            }
        }
    }

    function _deriveEntropy(
        bytes32 domain,
        bytes32 jobBatchId,
        bytes32 externalEntropy,
        uint256 roundId
    ) internal view returns (bytes32) {
        bytes32 recentBlockhash = block.number > 1 ? blockhash(block.number - 1) : bytes32(0);
        bytes32 prevrandao = bytes32(block.prevrandao);
        return keccak256(
            abi.encodePacked(
                recentBlockhash,
                prevrandao,
                config.entropySalt,
                externalEntropy,
                domain,
                jobBatchId,
                address(this),
                roundId
            )
        );
    }

    function _selectCommittee(bytes32 entropy, uint256 size) internal view returns (address[] memory committee) {
        committee = new address[](size);
        uint256 validatorPoolSize = _activeValidators.length();
        bool[] memory consumed = new bool[](validatorPoolSize);
        uint256 selected;
        bytes32 cursor = entropy;
        while (selected < size) {
            cursor = keccak256(abi.encodePacked(cursor, selected));
            uint256 index = uint256(cursor) % validatorPoolSize;
            if (consumed[index]) {
                continue;
            }
            address candidate = _activeValidators.at(index);
            ValidatorInfo storage info = _validators[candidate];
            if (info.status != ValidatorStatus.Active) {
                consumed[index] = true;
                continue;
            }
            consumed[index] = true;
            committee[selected] = candidate;
            selected += 1;
        }
    }
}
