// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IJobRegistry} from "../interfaces/IJobRegistry.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IValidationModule} from "../interfaces/IValidationModule.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and resolves them after a
/// dispute window.
/// @dev Maintains tax neutrality by rejecting ether and escrowing only token
///      based dispute fees via the StakeManager. Assumes all token amounts use
///      6 decimals (`1 token == 1e6` units).
contract DisputeModule is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    IJobRegistry public jobRegistry;
    IStakeManager public stakeManager;

    /// @notice Fee required to initiate a dispute, in token units (6 decimals).
    /// @dev Defaults to 1 token (1e6 units) if zero is provided to the constructor.
    uint256 public disputeFee;

    /// @notice Time that must elapse before a dispute can be resolved.
    /// @dev Defaults to 1 day if zero is provided to the constructor.
    uint256 public disputeWindow;

    /// @notice Voting weight allocated to each moderator.
    mapping(address => uint256) public moderatorWeights;

    /// @notice Sum of all moderator voting weights.
    uint256 public totalModeratorWeight;

    struct Dispute {
        address claimant;
        uint256 raisedAt;
        bool resolved;
        uint256 fee;
        bytes32 evidenceHash;
    }

    /// @dev Tracks active disputes by jobId.
    mapping(uint256 => Dispute) public disputes;

    event DisputeRaised(
        uint256 indexed jobId,
        address indexed claimant,
        bytes32 indexed evidenceHash,
        string evidence
    );
    event DisputeResolved(
        uint256 indexed jobId,
        address indexed resolver,
        bool employerWins
    );
    event ModeratorUpdated(address moderator, uint256 weight);
    event DisputeFeeUpdated(uint256 fee);
    event DisputeWindowUpdated(uint256 window);
    event JobRegistryUpdated(IJobRegistry newRegistry);
    event StakeManagerUpdated(IStakeManager newManager);
    event ModulesUpdated(address indexed jobRegistry, address indexed stakeManager);

    /// @param _jobRegistry Address of the JobRegistry contract.
    /// @param _disputeFee Initial dispute fee in token units (6 decimals); defaults to 1e6.
    /// @param _disputeWindow Minimum time in seconds before resolution; defaults to 1 day.
    /// @param _moderator Optional moderator address; defaults to the deployer.
    constructor(
        IJobRegistry _jobRegistry,
        uint256 _disputeFee,
        uint256 _disputeWindow,
        address _moderator
    ) Ownable(msg.sender) {
        if (address(_jobRegistry) != address(0)) {
            jobRegistry = _jobRegistry;
            emit JobRegistryUpdated(_jobRegistry);
        }
        emit ModulesUpdated(address(_jobRegistry), address(0));

        disputeFee = _disputeFee > 0 ? _disputeFee : 1e6;
        emit DisputeFeeUpdated(disputeFee);

        disputeWindow = _disputeWindow > 0 ? _disputeWindow : 1 days;
        emit DisputeWindowUpdated(disputeWindow);

        address initialModerator =
            _moderator != address(0) ? _moderator : msg.sender;
        moderatorWeights[initialModerator] = 1;
        totalModeratorWeight = 1;
        emit ModeratorUpdated(initialModerator, 1);
    }

    /// @notice Restrict functions to the JobRegistry.
    modifier onlyJobRegistry() {
        require(msg.sender == address(jobRegistry), "not registry");
        _;
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Update the JobRegistry reference.
    /// @param newRegistry New JobRegistry contract implementing IJobRegistry.
    function setJobRegistry(IJobRegistry newRegistry) external onlyOwner {
        jobRegistry = newRegistry;
        emit JobRegistryUpdated(newRegistry);
        emit ModulesUpdated(address(newRegistry), address(stakeManager));
    }

    /// @notice Update the StakeManager reference.
    /// @param newManager New StakeManager contract implementing IStakeManager.
    function setStakeManager(IStakeManager newManager) external onlyOwner {
        stakeManager = newManager;
        emit StakeManagerUpdated(newManager);
        emit ModulesUpdated(address(jobRegistry), address(newManager));
    }

    /// @notice Add or update a moderator with a specific voting weight.
    /// @param _moderator Address granted moderator rights.
    /// @param weight Voting weight assigned to the moderator.
    function addModerator(address _moderator, uint256 weight) external onlyOwner {
        require(_moderator != address(0), "moderator");
        require(weight > 0, "weight");
        uint256 previous = moderatorWeights[_moderator];
        totalModeratorWeight = totalModeratorWeight - previous + weight;
        moderatorWeights[_moderator] = weight;
        emit ModeratorUpdated(_moderator, weight);
    }

    /// @notice Remove a moderator and its voting weight.
    /// @param _moderator Address to revoke moderator rights from.
    function removeModerator(address _moderator) external onlyOwner {
        uint256 weight = moderatorWeights[_moderator];
        require(weight > 0, "not moderator");
        totalModeratorWeight -= weight;
        delete moderatorWeights[_moderator];
        emit ModeratorUpdated(_moderator, 0);
    }

    /// @notice Configure the dispute fee in token units (6 decimals).
    /// @param fee New dispute fee; 0 disables the fee.
    function setDisputeFee(uint256 fee) external onlyOwner {
        disputeFee = fee;
        emit DisputeFeeUpdated(fee);
    }

    /// @notice Configure the dispute resolution window in seconds.
    /// @param window Minimum time before a dispute can be resolved.
    function setDisputeWindow(uint256 window) external onlyOwner {
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    /// @notice Raise a dispute by posting the dispute fee.
    /// @param jobId Identifier of the job being disputed.
    /// @param claimant Address of the participant raising the dispute.
    /// @param evidence Supporting evidence or reason for the dispute. The
    /// full string is emitted while only its hash is stored on-chain.
    function raiseDispute(
        uint256 jobId,
        address claimant,
        string calldata evidence
    ) external onlyJobRegistry {
        Dispute storage d = disputes[jobId];
        require(d.raisedAt == 0, "disputed");

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            claimant == job.agent || claimant == job.employer,
            "not participant"
        );

        IStakeManager sm = _stakeManager();
        if (address(sm) != address(0) && disputeFee > 0) {
            sm.lockDisputeFee(claimant, disputeFee);
        }

        bytes32 evidenceHash = keccak256(bytes(evidence));

        disputes[jobId] =
            Dispute({
                claimant: claimant,
                raisedAt: block.timestamp,
                resolved: false,
                fee: disputeFee,
                evidenceHash: evidenceHash
            });

        emit DisputeRaised(jobId, claimant, evidenceHash, evidence);
    }

    /// @notice Resolve an existing dispute after the dispute window elapses.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer prevails.
    /// @param signatures Moderator approvals supporting the resolution.
    function resolve(
        uint256 jobId,
        bool employerWins,
        bytes[] calldata signatures
    ) external {
        Dispute storage d = disputes[jobId];
        require(d.raisedAt != 0 && !d.resolved, "no dispute");
        require(block.timestamp >= d.raisedAt + disputeWindow, "window");
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);

        uint256 weight = _verifySignatures(jobId, employerWins, signatures);
        require(weight * 2 > totalModeratorWeight, "insufficient weight");

        d.resolved = true;

        address employer = job.employer;
        address recipient = employerWins ? employer : d.claimant;
        uint256 fee = d.fee;
        delete disputes[jobId];

        jobRegistry.resolveDispute(jobId, employerWins);

        IStakeManager sm = _stakeManager();
        if (fee > 0 && address(sm) != address(0)) {
            sm.payDisputeFee(recipient, fee);
        }

        if (!employerWins && address(sm) != address(0)) {
            address valMod = address(jobRegistry.validationModule());
            if (valMod != address(0)) {
                address[] memory validators = IValidationModule(valMod).validators(jobId);
                for (uint256 i; i < validators.length; ++i) {
                    if (!IValidationModule(valMod).votes(jobId, validators[i])) {
                        sm.slash(validators[i], fee, employer);
                    }
                }
            }
        }

        emit DisputeResolved(jobId, msg.sender, employerWins);
    }

    function _verifySignatures(
        uint256 jobId,
        bool employerWins,
        bytes[] calldata signatures
    ) internal view returns (uint256 weight) {
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encodePacked(address(this), jobId, employerWins))
        );
        address[] memory seen = new address[](signatures.length);
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(hash, signatures[i]);
            uint256 w = moderatorWeights[signer];
            require(w > 0, "bad sig");
            for (uint256 j; j < i; ++j) {
                require(seen[j] != signer, "dup sig");
            }
            seen[i] = signer;
            weight += w;
        }
    }

    function _stakeManager() internal view returns (IStakeManager) {
        if (address(stakeManager) != address(0)) {
            return stakeManager;
        }
        return IStakeManager(jobRegistry.stakeManager());
    }

    /// @notice Confirms the module and its owner cannot accrue tax liabilities.
    /// @return Always true, signalling perpetual tax exemption.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }
    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers; all fees are handled in tokens.
    receive() external payable {
        revert("DisputeModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("DisputeModule: no ether");
    }
}

