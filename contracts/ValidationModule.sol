// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IStakeManager {
    function lockReward(address from, uint256 amount) external;
    function stakes(address user) external view returns (uint256);
}

interface IReputationEngine {
    function isBlacklisted(address user) external view returns (bool);
}

/// @title ValidationModule
/// @notice Returns predetermined validation outcomes and supports result challenges.
contract ValidationModule is Ownable {
    mapping(uint256 => bool) public outcomes;

    /// @notice stake manager used to lock dispute bonds and verify stake
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    bytes32 public clubRootNode;
    bytes32 public validatorMerkleRoot;
    /// @notice bond required to challenge a result
    uint256 public disputeBond;
    /// @notice period during which challenges are accepted
    uint256 public challengeWindow;
    /// @notice address allowed to clear challenges
    address public disputeResolution;

    /// @dev challenge deadline per job
    mapping(uint256 => uint256) public challengeDeadline;
    /// @dev challenger per job
    mapping(uint256 => address) public challenger;

    // ------------------------------------------------------------------
    // commit–reveal validation storage
    // ------------------------------------------------------------------

    /// @notice number of validators selected per job
    uint256 public validatorsPerJob = 1;
    /// @notice duration of the commit phase in seconds
    uint256 public commitWindow = 1 days;
    /// @notice duration of the reveal phase in seconds
    uint256 public revealWindow = 1 days;

    /// @notice global pool of potential validators
    address[] public validatorPool;

    /// @dev selected validators for a job
    mapping(uint256 => address[]) public jobValidators;
    /// @dev quick lookup of whether an address is selected for a job
    mapping(uint256 => mapping(address => bool)) public isValidator;
    /// @dev commit deadline per job
    mapping(uint256 => uint256) public commitDeadline;
    /// @dev reveal deadline per job
    mapping(uint256 => uint256) public revealDeadline;
    /// @dev stored commitments per job and validator
    mapping(uint256 => mapping(address => bytes32)) public commitments;
    /// @dev whether a validator revealed their vote
    mapping(uint256 => mapping(address => bool)) public revealed;
    /// @dev approvals count per job
    mapping(uint256 => uint256) public approvals;
    /// @dev total revealed votes per job
    mapping(uint256 => uint256) public totalReveals;

    event OutcomeSet(uint256 indexed jobId, bool success);
    event OutcomeChallenged(uint256 indexed jobId, address indexed challenger);
    event StakeManagerUpdated(address manager);
    event DisputeBondUpdated(uint256 bond);
    event ChallengeWindowUpdated(uint256 window);
    event DisputeResolutionUpdated(address resolver);
    event ReputationEngineUpdated(address engine);
    /// @notice Emitted when the ENS root node for validators changes.
    /// @param node The new ENS root node.
    event ClubRootNodeUpdated(bytes32 node);
    /// @notice Emitted when the validator allowlist Merkle root changes.
    /// @param root The new Merkle root.
    event ValidatorMerkleRootUpdated(bytes32 root);

    // events for commit–reveal validation
    event ValidatorsPerJobUpdated(uint256 count);
    event CommitWindowUpdated(uint256 window);
    event RevealWindowUpdated(uint256 window);
    event ValidatorPoolUpdated(address[] pool);
    event ValidatorsSelected(uint256 indexed jobId, address[] validators);
    event ValidationCommitted(
        uint256 indexed jobId,
        address indexed validator,
        bytes32 commitHash
    );
    event ValidationRevealed(
        uint256 indexed jobId,
        address indexed validator,
        bool approve
    );
    event ValidationResult(
        uint256 indexed jobId,
        bool success,
        address[] validators
    );

    constructor() Ownable(msg.sender) {}

    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    function setDisputeBond(uint256 bond) external onlyOwner {
        disputeBond = bond;
        emit DisputeBondUpdated(bond);
    }

    function setChallengeWindow(uint256 window) external onlyOwner {
        challengeWindow = window;
        emit ChallengeWindowUpdated(window);
    }

    function setDisputeResolution(address resolver) external onlyOwner {
        disputeResolution = resolver;
        emit DisputeResolutionUpdated(resolver);
    }

    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Update the ENS root node for validator clubs.
    /// @param node Namehash of the validator parent node (e.g. `club.agi.eth`).
    function setClubRootNode(bytes32 node) external onlyOwner {
        clubRootNode = node;
        emit ClubRootNodeUpdated(node);
    }

    /// @notice Update the Merkle root for the validator allowlist.
    /// @param root Merkle root of approved validator addresses.
    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        validatorMerkleRoot = root;
        emit ValidatorMerkleRootUpdated(root);
    }

    /// @notice Set number of validators selected per job.
    function setValidatorsPerJob(uint256 count) external onlyOwner {
        validatorsPerJob = count;
        emit ValidatorsPerJobUpdated(count);
    }

    /// @notice Set the commit phase duration.
    function setCommitWindow(uint256 window) external onlyOwner {
        commitWindow = window;
        emit CommitWindowUpdated(window);
    }

    /// @notice Set the reveal phase duration.
    function setRevealWindow(uint256 window) external onlyOwner {
        revealWindow = window;
        emit RevealWindowUpdated(window);
    }

    /// @notice Update the pool of potential validators.
    function setValidatorPool(address[] calldata pool) external onlyOwner {
        validatorPool = pool;
        emit ValidatorPoolUpdated(pool);
    }

    /// @notice Set the validation outcome for a job.
    function setOutcome(uint256 jobId, bool success) external onlyOwner {
        outcomes[jobId] = success;
        challengeDeadline[jobId] = block.timestamp + challengeWindow;
        delete challenger[jobId];
        emit OutcomeSet(jobId, success);
    }

    /// @notice Validate a job and return the preset outcome.
    function validate(uint256 jobId) external view returns (bool) {
        return outcomes[jobId];
    }

    /// @notice Challenge a validation result by locking a dispute bond.
    function challenge(uint256 jobId) external {
        require(block.timestamp <= challengeDeadline[jobId], "expired");
        require(challenger[jobId] == address(0), "challenged");
        if (address(reputationEngine) != address(0)) {
            require(!reputationEngine.isBlacklisted(msg.sender), "blacklisted");
        }
        stakeManager.lockReward(msg.sender, disputeBond);
        challenger[jobId] = msg.sender;
        emit OutcomeChallenged(jobId, msg.sender);
    }

    /// @notice Clear challenge data after resolution.
    function clearChallenge(uint256 jobId) external {
        require(
            msg.sender == disputeResolution || msg.sender == owner(),
            "not authorized"
        );
        delete challenger[jobId];
        delete challengeDeadline[jobId];
    }

    // ------------------------------------------------------------------
    // Commit–reveal validation logic
    // ------------------------------------------------------------------

    /// @notice Select validators for a job filtering by stake and identity.
    /// @dev Uses pseudo-random sampling from the validator pool.
    function selectValidators(uint256 jobId)
        external
        onlyOwner
        returns (address[] memory selected)
    {
        uint256 poolLength = validatorPool.length;
        address[] memory pool = new address[](poolLength);
        uint256 eligible;
        for (uint256 i; i < poolLength; ) {
            address v = validatorPool[i];
            bool ok = stakeManager.stakes(v) > 0;
            if (ok && address(reputationEngine) != address(0)) {
                ok = !reputationEngine.isBlacklisted(v);
            }
            if (ok) {
                pool[eligible] = v;
                unchecked {
                    ++eligible;
                }
            }
            unchecked {
                ++i;
            }
        }
        require(eligible >= validatorsPerJob, "not enough validators");
        assembly {
            mstore(pool, eligible)
        }
        selected = new address[](validatorsPerJob);
        bytes32 seed = keccak256(
            abi.encodePacked(block.timestamp, block.prevrandao, jobId)
        );
        uint256 remaining = eligible;
        for (uint256 i; i < validatorsPerJob; ) {
            seed = keccak256(abi.encodePacked(seed, i));
            uint256 index = uint256(seed) % remaining;
            address val = pool[index];
            selected[i] = val;
            jobValidators[jobId].push(val);
            isValidator[jobId][val] = true;
            pool[index] = pool[--remaining];
            unchecked {
                ++i;
            }
        }

        commitDeadline[jobId] = block.timestamp + commitWindow;
        revealDeadline[jobId] = commitDeadline[jobId] + revealWindow;
        emit ValidatorsSelected(jobId, selected);
    }

    /// @notice Commit to a validation vote.
    function commitValidation(uint256 jobId, bytes32 commitHash) external {
        require(isValidator[jobId][msg.sender], "not validator");
        require(block.timestamp <= commitDeadline[jobId], "commit over");
        require(commitments[jobId][msg.sender] == bytes32(0), "committed");
        commitments[jobId][msg.sender] = commitHash;
        emit ValidationCommitted(jobId, msg.sender, commitHash);
    }

    /// @notice Reveal a previously committed vote.
    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 salt
    ) external {
        require(isValidator[jobId][msg.sender], "not validator");
        require(block.timestamp > commitDeadline[jobId], "commit phase");
        require(block.timestamp <= revealDeadline[jobId], "reveal over");
        bytes32 commitment = commitments[jobId][msg.sender];
        require(commitment != bytes32(0), "no commit");
        require(!revealed[jobId][msg.sender], "revealed");
        bytes32 expected = keccak256(
            abi.encodePacked(msg.sender, jobId, approve, salt)
        );
        require(expected == commitment, "hash mismatch");
        revealed[jobId][msg.sender] = true;
        if (approve) {
            approvals[jobId] += 1;
        }
        totalReveals[jobId] += 1;
        emit ValidationRevealed(jobId, msg.sender, approve);
    }

    /// @notice Finalize validation and compute the result.
    /// @return success True if approvals exceed rejections
    /// @return participants Validators that revealed their votes
    function finalizeValidation(uint256 jobId)
        external
        returns (bool success, address[] memory participants)
    {
        require(block.timestamp > revealDeadline[jobId], "reveal pending");
        uint256 reveals = totalReveals[jobId];
        participants = new address[](reveals);
        address[] storage vals = jobValidators[jobId];
        uint256 idx;
        for (uint256 i; i < vals.length; ++i) {
            address v = vals[i];
            if (revealed[jobId][v]) {
                participants[idx++] = v;
            }
            delete isValidator[jobId][v];
            delete commitments[jobId][v];
            delete revealed[jobId][v];
        }
        success = approvals[jobId] * 2 >= reveals && reveals > 0;
        outcomes[jobId] = success;
        delete approvals[jobId];
        delete totalReveals[jobId];
        delete jobValidators[jobId];
        emit ValidationResult(jobId, success, participants);
    }

    /// @notice Confirms the contract and owner are tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("ValidationModule: no ether");
    }

    fallback() external payable {
        revert("ValidationModule: no ether");
    }
}

