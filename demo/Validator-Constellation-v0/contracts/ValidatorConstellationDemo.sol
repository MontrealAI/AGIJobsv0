// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ConstellationStakeManager} from "./ConstellationStakeManager.sol";
import {ENSIdentityOracle} from "./ENSIdentityOracle.sol";
import {IZkBatchVerifier} from "./interfaces/IZkBatchVerifier.sol";

/// @title ValidatorConstellationDemo
/// @notice Fully owner-orchestrated validator network demonstrating commit–reveal
///         validation, zk-batched attestations and sentinel guardrails. The
///         module is intentionally exhaustive so that a non-technical operator
///         can direct an unstoppable validation fabric with a few high level
///         actions.
contract ValidatorConstellationDemo is Ownable, Pausable, ReentrancyGuard {
    uint256 public constant MAX_BPS = 10_000;
    uint256 public constant MAX_BATCH = 1_000;

    struct DomainState {
        bool paused;
        uint64 pausedAt;
    }

    struct ValidatorMeta {
        bool active;
        string ensName;
        uint64 joinedAt;
    }

    struct AgentMeta {
        bool active;
        string ensName;
        uint64 registeredAt;
    }

    struct Job {
        bytes32 domain;
        bytes32 specHash;
        address creator;
        uint256 budget;
        uint256 spend;
        bool expectedResult;
        bool finalResult;
        bool finalMatchesTruth;
        bool finalized;
        bool validationStarted;
        bool sentinelTripped;
        uint64 createdAt;
        uint64 commitDeadline;
        uint64 revealDeadline;
        uint64 entropyCommitDeadline;
        uint64 entropyRevealDeadline;
        uint64 finalizedAt;
        uint32 committeeSize;
        uint32 approvals;
        uint32 rejections;
        uint32 reveals;
        bytes32 randomnessBeacon;
    }

    struct VoteRecord {
        bytes32 commitment;
        bool revealed;
        bool vote;
    }

    struct OutcomePreview {
        bool decision;
        bool matchesTruth;
        uint32 approvals;
        uint32 rejections;
        uint32 reveals;
        uint32 committeeSize;
    }

    ConstellationStakeManager public stakeManager;
    ENSIdentityOracle public identityOracle;
    IZkBatchVerifier public zkVerifier;

    uint256 public committeeSize = 5;
    uint256 public commitWindow = 15 minutes;
    uint256 public revealWindow = 15 minutes;
    uint256 public entropyCommitWindow = 5 minutes;
    uint256 public entropyRevealWindow = 5 minutes;
    uint256 public revealQuorumBps = 6_700; // 67%
    uint256 public approvalThresholdBps = 6_600; // 66%
    uint256 public nonRevealPenaltyBps = 50; // 0.5%
    uint256 public falseVotePenaltyBps = 2_000; // 20%
    uint256 public minEntropyContributors = 2;

    mapping(address => ValidatorMeta) public validators;
    mapping(address => bool) public knownValidator;
    address[] public validatorDirectory;

    mapping(address => AgentMeta) public agents;

    mapping(bytes32 => DomainState) public domains;
    mapping(address => bool) public sentinelOperators;

    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public jobs;
    mapping(uint256 => address[]) internal committees;

    mapping(uint256 => mapping(address => VoteRecord)) public voteRecords;

    mapping(uint256 => mapping(address => bytes32)) public entropyCommitments;
    mapping(uint256 => mapping(address => bool)) public entropyRevealed;
    mapping(uint256 => uint256) public entropyAggregates;
    mapping(uint256 => uint256) public entropyCommitCount;
    mapping(uint256 => uint256) public entropyRevealCount;

    event ValidatorRegistered(address indexed validator, string ensName, uint256 stake);
    event ValidatorDeactivated(address indexed validator);
    event AgentRegistered(address indexed agent, string ensName);
    event AgentDeactivated(address indexed agent);
    event SentinelConfigured(address indexed operator, bool allowed);
    event DomainPaused(bytes32 indexed domain, uint256 indexed jobId, string reason);
    event DomainResumed(bytes32 indexed domain);
    event JobCreated(uint256 indexed jobId, bytes32 indexed domain, address indexed creator, uint256 budget, bool expectedResult);
    event EntropyCommitted(uint256 indexed jobId, address indexed contributor, bytes32 commitment);
    event EntropyRevealed(uint256 indexed jobId, address indexed contributor, uint256 secret);
    event CommitteeSelected(uint256 indexed jobId, bytes32 randomness, address[] committee);
    event VoteCommitted(uint256 indexed jobId, address indexed validator, bytes32 commitment);
    event VoteRevealed(uint256 indexed jobId, address indexed validator, bool approval, uint256 salt);
    event JobFinalised(uint256 indexed jobId, bool decision, bool matchesTruth, uint32 approvals, uint32 rejections, uint32 reveals);
    event SpendRecorded(uint256 indexed jobId, uint256 spend, string note);
    event SentinelAlert(address indexed sentinel, bytes32 indexed domain, uint256 indexed jobId, string reason);

    error DomainPausedError(bytes32 domain);
    error NotValidator();
    error NotAgent();
    error NotSentinel();
    error StakeBelowMinimum();
    error ValidatorInactive();
    error DuplicateCommit();
    error CommitWindowClosed();
    error CommitWindowNotClosed();
    error RevealWindowClosed();
    error RevealWindowNotOpen();
    error InvalidReveal();
    error NotInCommittee();
    error JobNotFound();
    error ValidationAlreadyStarted();
    error ValidationNotReady();
    error ValidationNotStarted();
    error JobAlreadyFinalised();
    error QuorumNotReached();
    error BatchTooLarge();
    error InvalidProof();
    error SentinelTripped();
    error BudgetExceeded(uint256 budget, uint256 spend);
    error EntropyPhaseClosed();
    error EntropyRevealPending();
    error InsufficientEntropyContributors();
    error NotJobCreator();

    modifier onlyValidator() {
        if (!validators[msg.sender].active) revert NotValidator();
        _;
    }

    modifier onlyAgent() {
        if (!agents[msg.sender].active) revert NotAgent();
        _;
    }

    modifier onlySentinel() {
        if (!sentinelOperators[msg.sender]) revert NotSentinel();
        _;
    }

    modifier domainActive(bytes32 domain) {
        if (domains[domain].paused) revert DomainPausedError(domain);
        _;
    }

    constructor(ConstellationStakeManager stakeManager_, ENSIdentityOracle identityOracle_, IZkBatchVerifier zkVerifier_)
        Ownable(msg.sender)
    {
        stakeManager = stakeManager_;
        identityOracle = identityOracle_;
        zkVerifier = zkVerifier_;
    }

    // ---------------------------------------------------------------------
    // Governance controls
    // ---------------------------------------------------------------------

    function setStakeManager(ConstellationStakeManager stakeManager_) external onlyOwner {
        stakeManager = stakeManager_;
    }

    function setIdentityOracle(ENSIdentityOracle identityOracle_) external onlyOwner {
        identityOracle = identityOracle_;
    }

    function setZkVerifier(IZkBatchVerifier zkVerifier_) external onlyOwner {
        zkVerifier = zkVerifier_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function configureCommitteeSize(uint256 committeeSize_) external onlyOwner {
        require(committeeSize_ > 0, "INVALID_COMMITTEE");
        committeeSize = committeeSize_;
    }

    function configureWindows(uint256 commitWindow_, uint256 revealWindow_, uint256 entropyCommitWindow_, uint256 entropyRevealWindow_) external onlyOwner {
        commitWindow = commitWindow_;
        revealWindow = revealWindow_;
        entropyCommitWindow = entropyCommitWindow_;
        entropyRevealWindow = entropyRevealWindow_;
    }

    function configurePenalties(uint256 nonRevealPenaltyBps_, uint256 falseVotePenaltyBps_) external onlyOwner {
        if (nonRevealPenaltyBps_ > MAX_BPS || falseVotePenaltyBps_ > MAX_BPS) revert("INVALID_PENALTY");
        nonRevealPenaltyBps = nonRevealPenaltyBps_;
        falseVotePenaltyBps = falseVotePenaltyBps_;
    }

    function configureThresholds(uint256 revealQuorumBps_, uint256 approvalThresholdBps_) external onlyOwner {
        if (revealQuorumBps_ > MAX_BPS || approvalThresholdBps_ > MAX_BPS) revert("INVALID_THRESHOLD");
        revealQuorumBps = revealQuorumBps_;
        approvalThresholdBps = approvalThresholdBps_;
    }

    function configureEntropy(uint256 minEntropyContributors_) external onlyOwner {
        require(minEntropyContributors_ >= 2, "MIN_ENTROPY");
        minEntropyContributors = minEntropyContributors_;
    }

    function configureSentinel(address sentinel, bool allowed) external onlyOwner {
        sentinelOperators[sentinel] = allowed;
        emit SentinelConfigured(sentinel, allowed);
    }

    function resumeDomain(bytes32 domain) external onlyOwner {
        DomainState storage state = domains[domain];
        if (state.paused) {
            state.paused = false;
            state.pausedAt = 0;
            emit DomainResumed(domain);
        }
    }

    // ---------------------------------------------------------------------
    // Identity lifecycle
    // ---------------------------------------------------------------------

    function registerValidator(string calldata ensName, bytes32[] calldata proof) external whenNotPaused {
        if (!identityOracle.verify(msg.sender, ensName, ENSIdentityOracle.Role.Validator, proof)) revert("INVALID_VALIDATOR");
        uint256 stake = stakeManager.stakeOf(msg.sender);
        if (stake < stakeManager.minimumStake()) revert StakeBelowMinimum();
        ValidatorMeta storage meta = validators[msg.sender];
        meta.active = true;
        meta.ensName = ensName;
        meta.joinedAt = uint64(block.timestamp);
        if (!knownValidator[msg.sender]) {
            validatorDirectory.push(msg.sender);
            knownValidator[msg.sender] = true;
        }
        emit ValidatorRegistered(msg.sender, ensName, stake);
    }

    function deactivateValidator(address validator) external onlyOwner {
        if (!validators[validator].active) revert ValidatorInactive();
        validators[validator].active = false;
        emit ValidatorDeactivated(validator);
    }

    function registerAgent(string calldata ensName, bytes32[] calldata proof) external whenNotPaused {
        if (!identityOracle.verify(msg.sender, ensName, ENSIdentityOracle.Role.Agent, proof)) revert("INVALID_AGENT");
        AgentMeta storage meta = agents[msg.sender];
        meta.active = true;
        meta.ensName = ensName;
        meta.registeredAt = uint64(block.timestamp);
        emit AgentRegistered(msg.sender, ensName);
    }

    function deactivateAgent(address agent) external onlyOwner {
        if (!agents[agent].active) revert NotAgent();
        agents[agent].active = false;
        emit AgentDeactivated(agent);
    }

    // ---------------------------------------------------------------------
    // Job lifecycle
    // ---------------------------------------------------------------------

    function createJob(bytes32 domain, bytes32 specHash, uint256 budget, bool expectedResult) external onlyAgent whenNotPaused domainActive(domain) returns (uint256 jobId) {
        jobId = nextJobId++;
        Job storage job = jobs[jobId];
        job.domain = domain;
        job.specHash = specHash;
        job.creator = msg.sender;
        job.budget = budget;
        job.expectedResult = expectedResult;
        job.createdAt = uint64(block.timestamp);
        job.entropyCommitDeadline = uint64(block.timestamp + entropyCommitWindow);
        job.entropyRevealDeadline = uint64(job.entropyCommitDeadline + entropyRevealWindow);
        emit JobCreated(jobId, domain, msg.sender, budget, expectedResult);
    }

    function commitEntropy(uint256 jobId, bytes32 commitment) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.creator == address(0)) revert JobNotFound();
        if (block.timestamp > job.entropyCommitDeadline) revert EntropyPhaseClosed();
        if (entropyCommitments[jobId][msg.sender] != bytes32(0)) revert DuplicateCommit();
        entropyCommitments[jobId][msg.sender] = commitment;
        entropyCommitCount[jobId] += 1;
        emit EntropyCommitted(jobId, msg.sender, commitment);
    }

    function revealEntropy(uint256 jobId, uint256 secret) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.creator == address(0)) revert JobNotFound();
        if (block.timestamp <= job.entropyCommitDeadline || block.timestamp > job.entropyRevealDeadline) revert EntropyPhaseClosed();
        bytes32 commitment = entropyCommitments[jobId][msg.sender];
        if (commitment == bytes32(0)) revert EntropyRevealPending();
        if (entropyRevealed[jobId][msg.sender]) revert DuplicateCommit();
        if (keccak256(abi.encodePacked(secret)) != commitment) revert InvalidReveal();
        entropyRevealed[jobId][msg.sender] = true;
        entropyAggregates[jobId] ^= secret;
        entropyRevealCount[jobId] += 1;
        emit EntropyRevealed(jobId, msg.sender, secret);
    }

    function launchValidation(uint256 jobId) external whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.creator == address(0)) revert JobNotFound();
        if (job.validationStarted) revert ValidationAlreadyStarted();
        if (block.timestamp <= job.entropyRevealDeadline) revert ValidationNotReady();
        if (entropyRevealCount[jobId] < minEntropyContributors) revert InsufficientEntropyContributors();
        if (domains[job.domain].paused) revert DomainPausedError(job.domain);

        bytes32 randomness = keccak256(
            abi.encodePacked(entropyAggregates[jobId], blockhash(block.number - 1), block.prevrandao, jobId, job.specHash)
        );

        address[] memory committee = _selectCommittee(jobId, randomness);
        job.committeeSize = uint32(committee.length);
        job.validationStarted = true;
        job.commitDeadline = uint64(block.timestamp + commitWindow);
        job.revealDeadline = uint64(job.commitDeadline + revealWindow);
        job.randomnessBeacon = randomness;

        address[] storage store = committees[jobId];
        for (uint256 i = 0; i < committee.length; i++) {
            store.push(committee[i]);
            stakeManager.lockStake(committee[i], job.revealDeadline + 1 minutes);
        }

        emit CommitteeSelected(jobId, randomness, committee);
    }

    function commitVote(uint256 jobId, bytes32 commitment) external onlyValidator whenNotPaused {
        Job storage job = jobs[jobId];
        if (!job.validationStarted) revert ValidationNotStarted();
        if (block.timestamp > job.commitDeadline) revert CommitWindowClosed();
        if (!_isInCommittee(jobId, msg.sender)) revert NotInCommittee();
        VoteRecord storage record = voteRecords[jobId][msg.sender];
        if (record.commitment != bytes32(0)) revert DuplicateCommit();
        record.commitment = commitment;
        emit VoteCommitted(jobId, msg.sender, commitment);
    }

    function revealVote(uint256 jobId, bool approval, uint256 salt) external onlyValidator whenNotPaused {
        Job storage job = jobs[jobId];
        if (!job.validationStarted) revert ValidationNotStarted();
        if (block.timestamp <= job.commitDeadline) revert RevealWindowNotOpen();
        if (block.timestamp > job.revealDeadline) revert RevealWindowClosed();
        if (!_isInCommittee(jobId, msg.sender)) revert NotInCommittee();
        VoteRecord storage record = voteRecords[jobId][msg.sender];
        if (record.commitment == bytes32(0)) revert InvalidReveal();
        if (record.revealed) revert DuplicateCommit();
        if (keccak256(abi.encodePacked(jobId, msg.sender, approval, salt)) != record.commitment) revert InvalidReveal();
        record.revealed = true;
        record.vote = approval;
        if (approval) {
            jobs[jobId].approvals += 1;
        } else {
            jobs[jobId].rejections += 1;
        }
        jobs[jobId].reveals += 1;
        emit VoteRevealed(jobId, msg.sender, approval, salt);
    }

    function recordExecution(uint256 jobId, uint256 spend, string calldata note) external onlyAgent whenNotPaused {
        Job storage job = jobs[jobId];
        if (job.creator == address(0)) revert JobNotFound();
        if (job.creator != msg.sender) revert NotJobCreator();
        job.spend = spend;
        emit SpendRecorded(jobId, spend, note);
        if (spend > job.budget && !job.sentinelTripped) {
            job.sentinelTripped = true;
            _triggerSentinel(job.domain, jobId, "BUDGET_OVERRUN");
        } else if (spend > job.budget) {
            // already tripped; no further action required
        }
    }

    function finalizeJob(uint256 jobId) external whenNotPaused {
        _finalize(jobId);
    }

    struct BatchAttestation {
        uint256[] jobIds;
        bytes32 jobsRoot;
        bytes proof;
    }

    function submitBatchProof(BatchAttestation calldata attestation) external whenNotPaused {
        uint256 length = attestation.jobIds.length;
        if (length == 0 || length > MAX_BATCH) revert BatchTooLarge();
        bytes32[] memory leaves = new bytes32[](length);
        OutcomePreview[] memory previews = new OutcomePreview[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 jobId = attestation.jobIds[i];
            Job storage job = jobs[jobId];
            if (job.creator == address(0)) revert JobNotFound();
            if (job.sentinelTripped) revert SentinelTripped();
            address[] storage committee = committees[jobId];
            if (committee.length == 0) revert ValidationNotStarted();

            if (uint256(job.reveals) * MAX_BPS < revealQuorumBps * committee.length) {
                _penalizeNonReveals(jobId, committee);
                job.sentinelTripped = true;
                _triggerSentinel(job.domain, jobId, "REVEAL_QUORUM");
                return;
            }

            (leaves[i], previews[i]) = _previewOutcome(jobId);
        }

        bytes32 root = _merkleize(leaves);
        if (root != attestation.jobsRoot) revert InvalidProof();
        bytes32 witness = keccak256(abi.encodePacked(root, length, address(this), block.chainid));
        if (!zkVerifier.verify(attestation.proof, root, witness)) revert InvalidProof();

        for (uint256 i = 0; i < length; i++) {
            _applyOutcome(attestation.jobIds[i], previews[i]);
        }
    }

    function reportSentinelAlert(bytes32 domain, uint256 jobId, string calldata reason) external onlySentinel {
        Job storage job = jobs[jobId];
        if (job.creator != address(0)) {
            job.sentinelTripped = true;
        }
        _triggerSentinel(domain, jobId, reason);
        emit SentinelAlert(msg.sender, domain, jobId, reason);
    }

    function getCommittee(uint256 jobId) external view returns (address[] memory) {
        return committees[jobId];
    }

    // ---------------------------------------------------------------------
    // Internal logic
    // ---------------------------------------------------------------------

    function _triggerSentinel(bytes32 domain, uint256 jobId, string memory reason) internal {
        DomainState storage state = domains[domain];
        state.paused = true;
        state.pausedAt = uint64(block.timestamp);
        emit DomainPaused(domain, jobId, reason);
    }

    function _previewOutcome(uint256 jobId) internal view returns (bytes32 leaf, OutcomePreview memory preview) {
        Job storage job = jobs[jobId];
        if (!job.validationStarted) revert ValidationNotStarted();
        if (job.finalized) revert JobAlreadyFinalised();
        if (block.timestamp <= job.revealDeadline && job.reveals < job.committeeSize) revert RevealWindowNotOpen();
        if (job.sentinelTripped) revert SentinelTripped();

        address[] storage committee = committees[jobId];
        uint256 committeeLength = committee.length;
        if (committeeLength == 0) revert ValidationNotStarted();

        uint32 reveals = job.reveals;
        uint32 approvals = job.approvals;
        uint32 rejections = job.rejections;

        bool decision = uint256(approvals) * MAX_BPS >= approvalThresholdBps * committeeLength;
        bool matchesTruth = decision == job.expectedResult;

        uint32 committeeSize32 = uint32(committeeLength);
        preview = OutcomePreview({
            decision: decision,
            matchesTruth: matchesTruth,
            approvals: approvals,
            rejections: rejections,
            reveals: reveals,
            committeeSize: committeeSize32
        });

        leaf = keccak256(
            abi.encodePacked(jobId, decision, matchesTruth, approvals, rejections, reveals, committeeSize32, job.expectedResult)
        );
    }

    function _applyOutcome(uint256 jobId, OutcomePreview memory preview) internal {
        Job storage job = jobs[jobId];
        if (job.finalized) revert JobAlreadyFinalised();
        address[] storage committee = committees[jobId];
        uint256 committeeLength = committee.length;
        if (committeeLength == 0) revert ValidationNotStarted();

        if (uint256(job.reveals) * MAX_BPS < revealQuorumBps * committeeLength) {
            _penalizeNonReveals(jobId, committee);
            job.sentinelTripped = true;
            _triggerSentinel(job.domain, jobId, "REVEAL_QUORUM");
            return;
        }

        _penalizeNonReveals(jobId, committee);
        _penalizeFalseVotes(jobId, committee, job.expectedResult);

        job.finalResult = preview.decision;
        job.finalMatchesTruth = preview.matchesTruth;
        job.finalized = true;
        emit JobFinalised(jobId, preview.decision, preview.matchesTruth, preview.approvals, preview.rejections, preview.reveals);
    }

    function _finalize(uint256 jobId) internal {
        Job storage job = jobs[jobId];
        if (job.creator == address(0)) revert JobNotFound();
        if (job.sentinelTripped) revert SentinelTripped();
        address[] storage committee = committees[jobId];
        if (committee.length == 0) revert ValidationNotStarted();

        if (uint256(job.reveals) * MAX_BPS < revealQuorumBps * committee.length) {
            _penalizeNonReveals(jobId, committee);
            job.sentinelTripped = true;
            _triggerSentinel(job.domain, jobId, "REVEAL_QUORUM");
            return;
        }

        (bytes32 leaf, OutcomePreview memory preview) = _previewOutcome(jobId);
        // Provide deterministic proof witness for single finalisations as well.
        bytes32 witness = keccak256(abi.encodePacked(leaf, uint256(1), address(this), block.chainid));
        bytes memory proof = abi.encodePacked(zkVerifier.verifyingKey(), leaf, witness);
        if (!zkVerifier.verify(proof, leaf, witness)) revert InvalidProof();
        _applyOutcome(jobId, preview);
    }

    function _penalizeNonReveals(uint256 jobId, address[] storage committee) internal {
        if (nonRevealPenaltyBps == 0) {
            return;
        }
        for (uint256 i = 0; i < committee.length; i++) {
            address validator = committee[i];
            VoteRecord storage record = voteRecords[jobId][validator];
            if (!record.revealed) {
                stakeManager.slash(validator, nonRevealPenaltyBps);
            }
        }
    }

    function _penalizeFalseVotes(uint256 jobId, address[] storage committee, bool expectedResult) internal {
        if (falseVotePenaltyBps == 0) {
            return;
        }
        for (uint256 i = 0; i < committee.length; i++) {
            address validator = committee[i];
            VoteRecord storage record = voteRecords[jobId][validator];
            if (record.revealed && record.vote != expectedResult) {
                stakeManager.slash(validator, falseVotePenaltyBps);
            }
        }
    }

    function _selectCommittee(uint256 jobId, bytes32 randomness) internal view returns (address[] memory) {
        uint256 active = 0;
        uint256 total = validatorDirectory.length;
        for (uint256 i = 0; i < total; i++) {
            if (validators[validatorDirectory[i]].active) {
                active++;
            }
        }
        require(active >= committeeSize, "NOT_ENOUGH_VALIDATORS");

        address[] memory committee = new address[](committeeSize);
        bool[] memory used = new bool[](total);
        uint256 nonce = 0;
        uint256 selected = 0;
        while (selected < committeeSize) {
            uint256 index = uint256(keccak256(abi.encodePacked(randomness, jobId, nonce))) % total;
            address candidate = validatorDirectory[index];
            if (!used[index] && validators[candidate].active) {
                used[index] = true;
                committee[selected] = candidate;
                selected++;
            }
            nonce++;
            require(nonce < total * 10, "SELECTION_STALLED");
        }
        return committee;
    }

    function _isInCommittee(uint256 jobId, address validator) internal view returns (bool) {
        address[] storage committee = committees[jobId];
        for (uint256 i = 0; i < committee.length; i++) {
            if (committee[i] == validator) {
                return true;
            }
        }
        return false;
    }

    function _merkleize(bytes32[] memory leaves) internal pure returns (bytes32) {
        uint256 n = leaves.length;
        if (n == 0) return bytes32(0);
        while (n > 1) {
            for (uint256 i = 0; i < n / 2; i++) {
                bytes32 left = leaves[2 * i];
                bytes32 right = leaves[2 * i + 1];
                if (right < left) {
                    (left, right) = (right, left);
                }
                leaves[i] = keccak256(abi.encodePacked(left, right));
            }
            if (n % 2 == 1) {
                leaves[n / 2] = leaves[n - 1];
                n = n / 2 + 1;
            } else {
                n = n / 2;
            }
        }
        return leaves[0];
    }
}
