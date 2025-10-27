// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Validator Constellation Demo
/// @notice Reference implementation showcasing commit-reveal validation with VRF-style randomness,
/// batched ZK attestations, sentinel guardrails, ENS-gated participation and domain-scoped pausing.
interface IZkAttestor {
    function verifyBatch(
        bytes32 jobsRoot,
        uint256 jobCount,
        bytes calldata proof,
        bytes calldata publicSignals
    ) external view returns (bool);
}

interface ISentinel {
    function recordAlert(
        bytes32 domainId,
        string calldata reason,
        uint256 severity,
        bytes calldata context
    ) external;
}

contract ValidatorConstellationDemo is Ownable, Pausable {

    struct ValidatorInfo {
        bool active;
        uint256 stake;
        bytes32 ensNode;
        string ensName;
        uint256 lastParticipationBlock;
    }

    struct DomainConfig {
        bool paused;
        uint256 pauseTimestamp;
        string reason;
    }

    enum VoteChoice {
        Undecided,
        Approve,
        Reject
    }

    struct VoteRecord {
        VoteChoice choice;
        bool revealed;
        bytes32 commitment;
    }

    struct CommitteeRound {
        bytes32 domainId;
        bytes32 jobsRoot;
        uint256 jobCount;
        uint256 commitDeadline;
        uint256 revealDeadline;
        bytes32 entropy;
        bool finalised;
        bool proofAccepted;
        VoteChoice finalOutcome;
        address[] committee;
        mapping(address => VoteRecord) votes;
        uint256 approvals;
        uint256 rejections;
    }

    event ValidatorRegistered(address indexed validator, string ensName, bytes32 ensNode, uint256 stake);
    event ValidatorUnregistered(address indexed validator);
    event StakeDeposited(address indexed validator, uint256 amount);
    event StakeWithdrawn(address indexed validator, uint256 amount);
    event RoundStarted(uint256 indexed roundId, bytes32 indexed domainId, bytes32 jobsRoot, uint256 jobCount, bytes32 entropy);
    event VoteCommitted(uint256 indexed roundId, address indexed validator, bytes32 commitment);
    event VoteRevealed(uint256 indexed roundId, address indexed validator, VoteChoice choice);
    event RoundFinalised(uint256 indexed roundId, VoteChoice finalOutcome, uint256 approvals, uint256 rejections);
    event ValidatorSlashed(address indexed validator, uint256 penalty, string reason);
    event DomainPaused(bytes32 indexed domainId, string reason);
    event DomainResumed(bytes32 indexed domainId);
    event SentinelAlert(bytes32 indexed domainId, string reason, uint256 severity, address indexed reporter);
    event ZkAttestorUpdated(address indexed attestor);
    event SentinelUpdated(address indexed sentinel);
    event CommitRevealWindowUpdated(uint256 commitWindow, uint256 revealWindow);
    event EnsRootsUpdated(bytes32 validatorRoot, bytes32 validatorAlphaRoot, bytes32 agentRoot, bytes32 agentAlphaRoot);

    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public constant SLASH_NON_REVEAL = 0.1 ether;
    uint256 public constant SLASH_BAD_VOTE = 0.5 ether;

    uint256 public commitWindow = 20;
    uint256 public revealWindow = 20;

    bytes32 public validatorRoot;
    bytes32 public validatorAlphaRoot;
    bytes32 public agentRoot;
    bytes32 public agentAlphaRoot;

    IZkAttestor public zkAttestor;
    ISentinel public sentinel;

    address[] public validatorIndex;
    mapping(address => ValidatorInfo) public validators;
    mapping(bytes32 => DomainConfig) public domainConfigs;
    mapping(uint256 => CommitteeRound) private _rounds;
    uint256 public roundCount;

    modifier onlyActiveValidator() {
        require(validators[msg.sender].active, "Validator not active");
        _;
    }

    constructor(address owner_) Ownable(owner_) {}

    // --- Registry controls ---

    function setAttestor(address attestor) external onlyOwner {
        zkAttestor = IZkAttestor(attestor);
        emit ZkAttestorUpdated(attestor);
    }

    function setSentinel(address sentinel_) external onlyOwner {
        sentinel = ISentinel(sentinel_);
        emit SentinelUpdated(sentinel_);
    }

    function setCommitRevealWindows(uint256 commitWindow_, uint256 revealWindow_) external onlyOwner {
        require(commitWindow_ > 0 && revealWindow_ > 0, "invalid windows");
        commitWindow = commitWindow_;
        revealWindow = revealWindow_;
        emit CommitRevealWindowUpdated(commitWindow_, revealWindow_);
    }

    function setEnsRoots(
        bytes32 validatorRoot_,
        bytes32 validatorAlphaRoot_,
        bytes32 agentRoot_,
        bytes32 agentAlphaRoot_
    ) external onlyOwner {
        validatorRoot = validatorRoot_;
        validatorAlphaRoot = validatorAlphaRoot_;
        agentRoot = agentRoot_;
        agentAlphaRoot = agentAlphaRoot_;
        emit EnsRootsUpdated(validatorRoot_, validatorAlphaRoot_, agentRoot_, agentAlphaRoot_);
    }

    // --- Validator lifecycle ---

    function registerValidator(
        address validator,
        string calldata ensName,
        bytes32 ensNode,
        bytes32[] calldata proof,
        bool isAlphaDomain
    ) external onlyOwner {
        require(!validators[validator].active, "already active");
        bytes32 root = isAlphaDomain ? validatorAlphaRoot : validatorRoot;
        require(root != bytes32(0), "root unset");
        bytes32 leaf = keccak256(abi.encodePacked(validator, ensNode));
        require(MerkleProof.verify(proof, root, leaf), "invalid proof");
        validators[validator] = ValidatorInfo({
            active: true,
            stake: 0,
            ensNode: ensNode,
            ensName: ensName,
            lastParticipationBlock: block.number
        });
        validatorIndex.push(validator);
        emit ValidatorRegistered(validator, ensName, ensNode, 0);
    }

    function unregisterValidator(address validator) external onlyOwner {
        require(validators[validator].active, "not active");
        validators[validator].active = false;
        emit ValidatorUnregistered(validator);
    }

    function depositStake() external payable onlyActiveValidator {
        require(msg.value >= MIN_STAKE, "insufficient stake");
        validators[msg.sender].stake += msg.value;
        emit StakeDeposited(msg.sender, msg.value);
    }

    function withdrawStake(uint256 amount) external onlyActiveValidator {
        ValidatorInfo storage info = validators[msg.sender];
        require(info.stake >= amount, "insufficient balance");
        require(info.lastParticipationBlock + commitWindow + revealWindow < block.number, "cooldown");
        info.stake -= amount;
        (bool success, ) = msg.sender.call{value: amount}('');
        require(success, "transfer failed");
        emit StakeWithdrawn(msg.sender, amount);
    }

    // --- Round lifecycle ---

    function _domainIsActive(bytes32 domainId) internal view returns (bool) {
        DomainConfig storage cfg = domainConfigs[domainId];
        return !cfg.paused;
    }

    function _assertActiveDomain(bytes32 domainId) internal view {
        require(_domainIsActive(domainId), "domain paused");
    }

    function startRound(bytes32 domainId, bytes32 jobsRoot, uint256 jobCount) external onlyOwner whenNotPaused returns (uint256) {
        _assertActiveDomain(domainId);
        require(jobCount > 0, "empty batch");
        require(address(zkAttestor) != address(0), "attestor missing");

        uint256 roundId = ++roundCount;
        CommitteeRound storage round = _rounds[roundId];
        round.domainId = domainId;
        round.jobsRoot = jobsRoot;
        round.jobCount = jobCount;
        round.commitDeadline = block.number + commitWindow;
        round.revealDeadline = round.commitDeadline + revealWindow;
        round.entropy = keccak256(abi.encodePacked(block.prevrandao, blockhash(block.number - 1), domainId, jobsRoot, roundId));

        round.committee = _selectCommittee(round.entropy, jobCount);

        emit RoundStarted(roundId, domainId, jobsRoot, jobCount, round.entropy);
        return roundId;
    }

    function _selectCommittee(bytes32 entropy, uint256 jobCount) internal view returns (address[] memory committee) {
        uint256 activeCount;
        for (uint256 i = 0; i < validatorIndex.length; i++) {
            address candidate = validatorIndex[i];
            if (validators[candidate].active && validators[candidate].stake >= MIN_STAKE) {
                activeCount++;
            }
        }
        require(activeCount > 0, "no validators");
        uint256 committeeSize = activeCount < 5 ? activeCount : 5 + (jobCount / 200);
        if (committeeSize > activeCount) {
            committeeSize = activeCount;
        }
        committee = new address[](committeeSize);
        uint256 start = uint256(entropy) % validatorIndex.length;
        uint256 slot = 0;
        for (uint256 offset = 0; offset < validatorIndex.length && slot < committeeSize; offset++) {
            address candidate = validatorIndex[(start + offset) % validatorIndex.length];
            ValidatorInfo storage info = validators[candidate];
            if (!info.active || info.stake < MIN_STAKE) {
                continue;
            }
            bool alreadyIncluded = false;
            for (uint256 j = 0; j < slot; j++) {
                if (committee[j] == candidate) {
                    alreadyIncluded = true;
                    break;
                }
            }
            if (alreadyIncluded) {
                continue;
            }
            committee[slot] = candidate;
            slot++;
        }
        require(slot == committeeSize, "committee shortfall");
    }

    function _addressInSet(address[] memory set, uint256 length, address candidate) private pure returns (bool) {
        for (uint256 i = 0; i < length; i++) {
            if (set[i] == candidate) {
                return true;
            }
        }
        return false;
    }

    function commitVote(uint256 roundId, bytes32 commitment) external onlyActiveValidator whenNotPaused {
        CommitteeRound storage round = _rounds[roundId];
        require(round.commitDeadline != 0, "round missing");
        require(block.number <= round.commitDeadline, "commit window closed");
        require(_isCommitteeMember(roundId, msg.sender), "not selected");
        VoteRecord storage vote = round.votes[msg.sender];
        require(vote.commitment == bytes32(0), "already committed");
        vote.commitment = commitment;
        emit VoteCommitted(roundId, msg.sender, commitment);
    }

    function revealVote(uint256 roundId, VoteChoice choice, bytes32 salt) external onlyActiveValidator whenNotPaused {
        CommitteeRound storage round = _rounds[roundId];
        require(round.revealDeadline != 0, "round missing");
        require(block.number > round.commitDeadline && block.number <= round.revealDeadline, "reveal window invalid");
        require(_isCommitteeMember(roundId, msg.sender), "not selected");
        VoteRecord storage vote = round.votes[msg.sender];
        require(vote.commitment != bytes32(0), "no commit");
        require(!vote.revealed, "already revealed");
        require(choice != VoteChoice.Undecided, "invalid choice");
        bytes32 computed = keccak256(abi.encodePacked(choice, salt));
        require(computed == vote.commitment, "invalid reveal");
        vote.choice = choice;
        vote.revealed = true;
        if (choice == VoteChoice.Approve) {
            round.approvals++;
        } else if (choice == VoteChoice.Reject) {
            round.rejections++;
        }
        validators[msg.sender].lastParticipationBlock = block.number;
        emit VoteRevealed(roundId, msg.sender, choice);
    }

    function finalizeRound(
        uint256 roundId,
        VoteChoice expectedOutcome,
        bytes calldata zkProof,
        bytes calldata publicSignals
    ) external onlyOwner {
        CommitteeRound storage round = _rounds[roundId];
        require(!round.finalised, "finalised");
        require(round.revealDeadline != 0 && block.number > round.revealDeadline, "reveal not ended");
        require(address(zkAttestor) != address(0), "attestor missing");
        require(zkAttestor.verifyBatch(round.jobsRoot, round.jobCount, zkProof, publicSignals), "invalid proof");

        round.proofAccepted = true;
        round.finalOutcome = expectedOutcome;
        round.finalised = true;

        for (uint256 i = 0; i < round.committee.length; i++) {
            address member = round.committee[i];
            VoteRecord storage vote = round.votes[member];
            if (!vote.revealed) {
                _slash(member, SLASH_NON_REVEAL, "no reveal");
                continue;
            }
            if (vote.choice != expectedOutcome) {
                _slash(member, SLASH_BAD_VOTE, "bad vote");
            }
        }

        emit RoundFinalised(roundId, expectedOutcome, round.approvals, round.rejections);
    }

    function _slash(address validator, uint256 amount, string memory reason) internal {
        ValidatorInfo storage info = validators[validator];
        if (!info.active || info.stake < amount) {
            emit ValidatorSlashed(validator, 0, reason);
            return;
        }
        info.stake -= amount;
        emit ValidatorSlashed(validator, amount, reason);
    }

    function _isCommitteeMember(uint256 roundId, address validator) internal view returns (bool) {
        CommitteeRound storage round = _rounds[roundId];
        for (uint256 i = 0; i < round.committee.length; i++) {
            if (round.committee[i] == validator) {
                return true;
            }
        }
        return false;
    }

    function getCommittee(uint256 roundId) external view returns (address[] memory) {
        return _rounds[roundId].committee;
    }

    function getVote(uint256 roundId, address validator)
        external
        view
        returns (VoteChoice choice, bool revealed, bytes32 commitment)
    {
        VoteRecord storage vote = _rounds[roundId].votes[validator];
        return (vote.choice, vote.revealed, vote.commitment);
    }

    function getRound(uint256 roundId)
        external
        view
        returns (
            bytes32 domainId,
            bytes32 jobsRoot,
            uint256 jobCount,
            uint256 commitDeadline,
            uint256 revealDeadline,
            bytes32 entropy,
            bool finalised,
            bool proofAccepted,
            VoteChoice finalOutcome,
            uint256 approvals,
            uint256 rejections
        )
    {
        CommitteeRound storage round = _rounds[roundId];
        return (
            round.domainId,
            round.jobsRoot,
            round.jobCount,
            round.commitDeadline,
            round.revealDeadline,
            round.entropy,
            round.finalised,
            round.proofAccepted,
            round.finalOutcome,
            round.approvals,
            round.rejections
        );
    }

    // --- Sentinel integration ---

    function sentinelPause(
        bytes32 domainId,
        string calldata reason,
        uint256 severity,
        bytes calldata context
    ) external {
        require(msg.sender == address(sentinel), "only sentinel");
        DomainConfig storage cfg = domainConfigs[domainId];
        cfg.paused = true;
        cfg.pauseTimestamp = block.timestamp;
        cfg.reason = reason;
        emit DomainPaused(domainId, reason);
        emit SentinelAlert(domainId, reason, severity, msg.sender);
    }

    function resumeDomain(bytes32 domainId) external onlyOwner {
        DomainConfig storage cfg = domainConfigs[domainId];
        cfg.paused = false;
        cfg.reason = '';
        emit DomainResumed(domainId);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // --- Agent identity verification helper ---

    function verifyAgent(address agent, bytes32 ensNode, bytes32[] calldata proof, bool isAlphaDomain)
        external
        view
        returns (bool)
    {
        bytes32 root = isAlphaDomain ? agentAlphaRoot : agentRoot;
        if (root == bytes32(0)) {
            return false;
        }
        bytes32 leaf = keccak256(abi.encodePacked(agent, ensNode));
        return MerkleProof.verify(proof, root, leaf);
    }
}
