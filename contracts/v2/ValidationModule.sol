// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IJobRegistryTax} from "./interfaces/IJobRegistryTax.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IReputationEngine} from "./interfaces/IReputationEngine.sol";
import {IValidationModule} from "./interfaces/IValidationModule.sol";
import {IVRF} from "./interfaces/IVRF.sol";
import {INameWrapper} from "./interfaces/INameWrapper.sol";
import {ENSOwnershipVerifier} from "./modules/ENSOwnershipVerifier.sol";

/// @title ValidationModule
/// @notice Handles validator selection and commit–reveal voting for jobs.
/// @dev Holds no ether and keeps the owner and contract tax neutral; only
///      participating validators and job parties bear tax obligations.
contract ValidationModule is IValidationModule, Ownable {
    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;

    // timing configuration
    uint256 public commitWindow;
    uint256 public revealWindow;

    // validator bounds per job
    uint256 public minValidators;
    uint256 public maxValidators;

    uint256 public constant DEFAULT_COMMIT_WINDOW = 1 days;
    uint256 public constant DEFAULT_REVEAL_WINDOW = 1 days;
    uint256 public constant DEFAULT_MIN_VALIDATORS = 1;
    uint256 public constant DEFAULT_MAX_VALIDATORS = 3;

    // slashing percentage applied to validator stake for incorrect votes
    uint256 public validatorSlashingPercentage = 50;
    // percentage of total stake required for approval
    uint256 public approvalThreshold = 50;

    // pool of validators
    address[] public validatorPool;
    // optional VRF provider for future randomness upgrades
    IVRF public vrf;

    // ENS identity references
    bytes32 public clubRootNode;
    bytes32 public validatorMerkleRoot;
    bytes32 public agentMerkleRoot;
    INameWrapper public nameWrapper;
    ENSOwnershipVerifier public ensOwnershipVerifier;

    // optional override for validators without ENS identity
    mapping(address => bool) public additionalValidators;

    struct Round {
        address[] validators;
        uint256 commitDeadline;
        uint256 revealDeadline;
        uint256 approvals;
        uint256 rejections;
        bool tallied;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => mapping(uint256 => bytes32))) public commitments;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => bool)) public votes;
    mapping(uint256 => mapping(address => uint256)) public validatorStakes;
    mapping(uint256 => uint256) public jobNonce;

    event ValidatorsUpdated(address[] validators);
    event ReputationEngineUpdated(address engine);
    event VRFUpdated(address vrf);
    event TimingUpdated(uint256 commitWindow, uint256 revealWindow);
    event ValidatorBoundsUpdated(uint256 minValidators, uint256 maxValidators);
    event ValidatorSlashingPctUpdated(uint256 pct);
    event ApprovalThresholdUpdated(uint256 pct);
    event JobRegistryUpdated(address registry);
    event StakeManagerUpdated(address manager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);
    event JobNonceReset(uint256 indexed jobId);
    event ENSIdentityUpdated(
        bytes32 clubRootNode,
        bytes32 validatorMerkleRoot,
        address nameWrapper
    );
    /// @notice Emitted when an additional validator is added or removed.
    /// @param validator Address being updated.
    /// @param allowed True if the validator is whitelisted, false if removed.
    event AdditionalValidatorUpdated(address indexed validator, bool allowed);
    /// @notice Emitted when an ENS root node is updated.
    /// @param node Identifier for the root node being modified.
    /// @param newRoot The new ENS root node hash.
    event RootNodeUpdated(string node, bytes32 newRoot);
    /// @notice Emitted when a Merkle root is updated.
    /// @param root Identifier for the Merkle root being modified.
    /// @param newRoot The new Merkle root hash.
    event MerkleRootUpdated(string root, bytes32 newRoot);

    /// @notice Require caller to acknowledge current tax policy via JobRegistry.
    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner()) {
            address registry = address(jobRegistry);
            require(registry != address(0), "job registry");
            IJobRegistryTax j = IJobRegistryTax(registry);
            require(
                j.taxAcknowledgedVersion(msg.sender) == j.taxPolicyVersion(),
                "acknowledge tax policy"
            );
        }
        _;
    }

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        uint256 _commitWindow,
        uint256 _revealWindow,
        uint256 _minValidators,
        uint256 _maxValidators,
        address[] memory _validatorPool
    ) Ownable(msg.sender) {
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(address(_jobRegistry));
        }
        if (address(_stakeManager) != address(0)) {
            stakeManager = _stakeManager;
            emit StakeManagerUpdated(address(_stakeManager));
        }
        if (
            address(_jobRegistry) != address(0) ||
            address(_stakeManager) != address(0)
        ) {
            emit ModulesUpdated(
                address(_jobRegistry),
                address(_stakeManager)
            );
        }
        commitWindow =
            _commitWindow == 0 ? DEFAULT_COMMIT_WINDOW : _commitWindow;
        revealWindow =
            _revealWindow == 0 ? DEFAULT_REVEAL_WINDOW : _revealWindow;
        emit TimingUpdated(commitWindow, revealWindow);

        minValidators =
            _minValidators == 0 ? DEFAULT_MIN_VALIDATORS : _minValidators;
        maxValidators =
            _maxValidators == 0 ? DEFAULT_MAX_VALIDATORS : _maxValidators;
        emit ValidatorBoundsUpdated(minValidators, maxValidators);

        emit ApprovalThresholdUpdated(approvalThreshold);

        require(commitWindow > 0 && revealWindow > 0, "windows");
        require(maxValidators >= minValidators, "bounds");
        if (_validatorPool.length != 0) {
            validatorPool = _validatorPool;
            emit ValidatorsUpdated(_validatorPool);
        }
    }

    /// @notice Update the list of eligible validators.
    /// @param validators Addresses of validators.
    function setValidatorPool(address[] calldata validators)
        external
        onlyOwner
    {
        validatorPool = validators;
        emit ValidatorsUpdated(validators);
    }

    /// @notice Update the reputation engine used for validator feedback.
    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Update the JobRegistry reference.
    function setJobRegistry(IJobRegistry registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(address(registry));
        emit ModulesUpdated(address(registry), address(stakeManager));
    }

    /// @notice Update the StakeManager reference.
    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
        emit ModulesUpdated(address(jobRegistry), address(manager));
    }

    /// @notice Set the optional VRF provider for future upgrades.
    function setVRF(IVRF provider) external onlyOwner {
        vrf = provider;
        emit VRFUpdated(address(provider));
    }

    /// @notice Update the ENS ownership verifier contract.
    function setENSOwnershipVerifier(ENSOwnershipVerifier verifier) external onlyOwner {
        ensOwnershipVerifier = verifier;
    }

    /// @notice Return validators selected for a job
    /// @param jobId Identifier of the job
    /// @return validators_ Array of validator addresses
    function validators(uint256 jobId) external view override returns (address[] memory validators_) {
        validators_ = rounds[jobId].validators;
    }

    /// @notice Configure additional validators that bypass ENS checks.
    function setAdditionalValidators(
        address[] calldata validators,
        bool[] calldata allowed
    ) external onlyOwner {
        require(validators.length == allowed.length, "length");
        for (uint256 i; i < validators.length; ++i) {
            additionalValidators[validators[i]] = allowed[i];
            emit AdditionalValidatorUpdated(validators[i], allowed[i]);
        }
    }

    /// @notice Manually allow a validator to bypass ENS checks.
    /// @param validator Address to whitelist.
    function addAdditionalValidator(address validator) external onlyOwner {
        require(validator != address(0), "validator");
        additionalValidators[validator] = true;
        emit AdditionalValidatorUpdated(validator, true);
    }

    /// @notice Remove a validator from the manual allowlist.
    /// @param validator Address to remove.
    function removeAdditionalValidator(address validator) external onlyOwner {
        additionalValidators[validator] = false;
        emit AdditionalValidatorUpdated(validator, false);
    }

    /// @notice Set validator Merkle root for identity checks.
    function setValidatorMerkleRoot(bytes32 root) external onlyOwner {
        validatorMerkleRoot = root;
        ensOwnershipVerifier.setValidatorMerkleRoot(root);
        emit MerkleRootUpdated("validator", root);
        emit ENSIdentityUpdated(clubRootNode, root, address(nameWrapper));
    }

    /// @notice Set agent Merkle root for identity checks.
    function setAgentMerkleRoot(bytes32 root) external onlyOwner {
        agentMerkleRoot = root;
        ensOwnershipVerifier.setAgentMerkleRoot(root);
        emit MerkleRootUpdated("agent", root);
    }

    /// @notice Set ENS NameWrapper contract reference.
    function setNameWrapper(INameWrapper wrapper) external onlyOwner {
        nameWrapper = wrapper;
        emit ENSIdentityUpdated(clubRootNode, validatorMerkleRoot, address(wrapper));
    }

    /// @notice Set club root node for validator ENS subdomains.
    function setClubRootNode(bytes32 node) external onlyOwner {
        clubRootNode = node;
        ensOwnershipVerifier.setClubRootNode(node);
        emit RootNodeUpdated("club", node);
        emit ENSIdentityUpdated(node, validatorMerkleRoot, address(nameWrapper));
    }

    /// @notice Update the commit and reveal windows.
    function setCommitRevealWindows(uint256 commitDur, uint256 revealDur)
        external
        override
        onlyOwner
    {
        require(commitDur > 0 && revealDur > 0, "windows");
        commitWindow = commitDur;
        revealWindow = revealDur;
        emit TimingUpdated(commitDur, revealDur);
    }

    /// @notice Set minimum and maximum validators per round.
    function setValidatorBounds(uint256 minVals, uint256 maxVals) external override onlyOwner {
        require(minVals > 0 && maxVals >= minVals, "bounds");
        minValidators = minVals;
        maxValidators = maxVals;
        emit ValidatorBoundsUpdated(minVals, maxVals);
    }

    function setValidatorSlashingPct(uint256 pct) external onlyOwner {
        require(pct <= 100, "pct");
        validatorSlashingPercentage = pct;
        emit ValidatorSlashingPctUpdated(pct);
    }

    /// @notice Update approval threshold percentage.
    function setApprovalThreshold(uint256 pct) external onlyOwner {
        require(pct > 0 && pct <= 100, "pct");
        approvalThreshold = pct;
        emit ApprovalThresholdUpdated(pct);
    }

    /// @inheritdoc IValidationModule
    function selectValidators(uint256 jobId) external override returns (address[] memory selected) {
        Round storage r = rounds[jobId];
        require(r.validators.length == 0, "already selected");
        jobNonce[jobId] += 1;

        address[] memory pool = validatorPool;
        uint256 n = pool.length;
        uint256[] memory stakes = new uint256[](n);
        uint256 totalStake;
        uint256 m;

        for (uint256 i; i < n; ++i) {
            uint256 stake = stakeManager.stakeOf(pool[i], IStakeManager.Role.Validator);
            if (address(reputationEngine) != address(0)) {
                if (reputationEngine.isBlacklisted(pool[i])) continue;
            }
            if (stake > 0) {
                stakes[m] = stake;
                pool[m] = pool[i];
                totalStake += stake;
                m++;
            }
        }

        require(m >= minValidators, "insufficient validators");
        uint256 count = m < maxValidators ? m : maxValidators;

        bytes32 seed = keccak256(
            abi.encodePacked(blockhash(block.number - 1), jobId, block.timestamp)
        );

        selected = new address[](count);
        uint256 remaining = m;
        for (uint256 i; i < count; ++i) {
            seed = keccak256(abi.encodePacked(seed, i));
            uint256 rnum = uint256(seed) % totalStake;
            uint256 cumulative;
            uint256 idx;
            for (uint256 j; j < remaining; ++j) {
                cumulative += stakes[j];
                if (rnum < cumulative) {
                    idx = j;
                    break;
                }
            }
            address val = pool[idx];
            selected[i] = val;
            validatorStakes[jobId][val] = stakes[idx];

            totalStake -= stakes[idx];
            pool[idx] = pool[remaining - 1];
            stakes[idx] = stakes[remaining - 1];
            remaining--;
        }

        r.validators = selected;
        r.commitDeadline = block.timestamp + commitWindow;
        r.revealDeadline = r.commitDeadline + revealWindow;

        emit ValidatorsSelected(jobId, selected);
        return selected;
    }

    /// @notice Commit a validation hash for a job.
    function commitValidation(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public override requiresTaxAcknowledgement {
        Round storage r = rounds[jobId];
        require(
            jobRegistry.jobs(jobId).status == IJobRegistry.Status.Submitted,
            "not submitted"
        );
        require(
            r.commitDeadline != 0 && block.timestamp <= r.commitDeadline,
            "commit closed"
        );
        require(_isValidator(jobId, msg.sender), "not validator");
        require(
            ensOwnershipVerifier.verifyOwnership(
                msg.sender,
                subdomain,
                proof,
                clubRootNode
            ) || additionalValidators[msg.sender],
            "Not authorized validator"
        );
        require(
            !reputationEngine.isBlacklisted(msg.sender),
            "Blacklisted validator"
        );
        require(validatorStakes[jobId][msg.sender] > 0, "stake");
        uint256 nonce = jobNonce[jobId];
        require(
            commitments[jobId][msg.sender][nonce] == bytes32(0),
            "already committed"
        );

        commitments[jobId][msg.sender][nonce] = commitHash;
        emit VoteCommitted(jobId, msg.sender, commitHash);
    }

    /// @notice Reveal a previously committed validation vote.
    function revealValidation(
        uint256 jobId,
        bool approve,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) public override requiresTaxAcknowledgement {
        Round storage r = rounds[jobId];
        require(block.timestamp > r.commitDeadline, "commit phase");
        require(block.timestamp <= r.revealDeadline, "reveal closed");
        require(
            ensOwnershipVerifier.verifyOwnership(
                msg.sender,
                subdomain,
                proof,
                clubRootNode
            ) || additionalValidators[msg.sender],
            "Not authorized validator"
        );
        require(
            !reputationEngine.isBlacklisted(msg.sender),
            "Blacklisted validator"
        );
        uint256 nonce = jobNonce[jobId];
        bytes32 commitHash = commitments[jobId][msg.sender][nonce];
        require(commitHash != bytes32(0), "no commit");
        require(!revealed[jobId][msg.sender], "already revealed");
        require(
            keccak256(abi.encodePacked(jobId, nonce, approve, salt)) == commitHash,
            "invalid reveal"
        );

        uint256 stake = validatorStakes[jobId][msg.sender];
        require(stake > 0, "stake");
        revealed[jobId][msg.sender] = true;
        votes[jobId][msg.sender] = approve;
        if (approve) r.approvals += stake; else r.rejections += stake;

        emit VoteRevealed(jobId, msg.sender, approve);
    }

    /// @notice Backwards-compatible wrapper for commitValidation.
    function commitVote(
        uint256 jobId,
        bytes32 commitHash,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external requiresTaxAcknowledgement {
        commitValidation(jobId, commitHash, subdomain, proof);
    }

    /// @notice Backwards-compatible wrapper for revealValidation.
    function revealVote(
        uint256 jobId,
        bool approve,
        bytes32 salt,
        string calldata subdomain,
        bytes32[] calldata proof
    ) external requiresTaxAcknowledgement {
        revealValidation(jobId, approve, salt, subdomain, proof);
    }

    /// @notice Tally revealed votes and apply slashing/rewards.
    function finalize(uint256 jobId) external override returns (bool success) {
        Round storage r = rounds[jobId];
        require(!r.tallied, "tallied");
        require(block.timestamp > r.revealDeadline, "reveal pending");

        uint256 total;
        for (uint256 i; i < r.validators.length; ++i) {
            total += validatorStakes[jobId][r.validators[i]];
        }
        if (total > 0) {
            success = (r.approvals * 100) >= (total * approvalThreshold);
        }
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

        for (uint256 i; i < r.validators.length; ++i) {
            address val = r.validators[i];
            uint256 stake = validatorStakes[jobId][val];
            uint256 slashAmount = (stake * validatorSlashingPercentage) / 100;
            if (!revealed[jobId][val] || votes[jobId][val] != success) {
                if (slashAmount > 0) {
                    stakeManager.slash(
                        val,
                        IStakeManager.Role.Validator,
                        slashAmount,
                        job.employer
                    );
                }
                if (address(reputationEngine) != address(0)) {
                    reputationEngine.subtract(val, 1);
                }
            } else if (address(reputationEngine) != address(0)) {
                reputationEngine.add(val, 1);
            }
        }

        r.tallied = true;
        emit ValidationFinalized(jobId, success, r.approvals, r.rejections);
        return success;
    }

    /// @notice Reset the validation nonce for a job after finalization or dispute resolution.
    /// @param jobId Identifier of the job
    function resetJobNonce(uint256 jobId) external override {
        require(
            msg.sender == owner() || msg.sender == address(jobRegistry),
            "not authorized"
        );
        uint256 nonce = jobNonce[jobId];
        address[] storage vals = rounds[jobId].validators;
        for (uint256 i; i < vals.length; ++i) {
            address val = vals[i];
            delete commitments[jobId][val][nonce];
            delete revealed[jobId][val];
            delete votes[jobId][val];
            delete validatorStakes[jobId][val];
        }
        delete rounds[jobId];
        delete jobNonce[jobId];
        emit JobNonceReset(jobId);
    }

    function _isValidator(uint256 jobId, address val) internal view returns (bool) {
        address[] storage list = rounds[jobId].validators;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == val) return true;
        }
        return false;
    }

    /// @notice Confirms the contract and its owner can never accrue tax obligations.
    /// @return Always true to signal perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Prevent accidental ETH deposits; the module never holds funds.
    receive() external payable {
        revert("ValidationModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ValidationModule: no ether");
    }
}

