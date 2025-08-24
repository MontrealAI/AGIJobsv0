// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IJobRegistry} from "./interfaces/IJobRegistry.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";

/// @title DisputeModule
/// @notice Allows job participants to raise disputes and enables a moderator
/// to resolve them by finalising outcomes in the JobRegistry.
/// @dev Dispute claimants may optionally stake an appeal fee via the
/// StakeManager which is paid out to the winner.
contract DisputeModule is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 1;

    /// @notice Registry coordinating job lifecycle state.
    IJobRegistry public immutable jobRegistry;

    /// @notice Contract managing stake and dispute fees.
    IStakeManager public immutable stakeManager;

    /// @notice Registered moderator addresses allowed to approve resolutions.
    mapping(address => bool) public moderators;

    /// @notice Total number of active moderators.
    uint256 public moderatorCount;

    /// @notice Fixed appeal fee in token units (6 decimals) required to raise a
    /// dispute. A value of 0 disables the fee.
    uint256 public appealFee;

    struct Dispute {
        address claimant;
        bool resolved;
    }

    /// @dev Active disputes keyed by job identifier.
    mapping(uint256 => Dispute) public disputes;

    /// @notice Emitted when a participant raises a dispute.
    event DisputeRaised(uint256 indexed jobId, address indexed claimant);

    /// @notice Emitted when a dispute is resolved.
    event DisputeResolved(
        uint256 indexed jobId,
        address indexed resolver,
        bool employerWins
    );

    /// @notice Emitted when moderator membership changes.
    event ModeratorUpdated(address indexed moderator, bool active);

    constructor(
        IJobRegistry _jobRegistry,
        IStakeManager _stakeManager,
        address _moderator,
        uint256 _appealFee
    ) Ownable(msg.sender) {
        require(address(_jobRegistry) != address(0), "registry");
        require(address(_stakeManager) != address(0), "stake mgr");
        jobRegistry = _jobRegistry;
        stakeManager = _stakeManager;
        appealFee = _appealFee;

        if (_moderator != address(0)) {
            moderators[_moderator] = true;
            moderatorCount = 1;
            emit ModeratorUpdated(_moderator, true);
        }
    }

    /// @notice Add a new moderator.
    /// @param _moderator Address to grant moderator status.
    function addModerator(address _moderator) external onlyOwner {
        require(_moderator != address(0), "moderator");
        require(!moderators[_moderator], "exists");
        moderators[_moderator] = true;
        moderatorCount += 1;
        emit ModeratorUpdated(_moderator, true);
    }

    /// @notice Remove an existing moderator.
    /// @param _moderator Address to revoke moderator status from.
    function removeModerator(address _moderator) external onlyOwner {
        require(moderators[_moderator], "not moderator");
        delete moderators[_moderator];
        moderatorCount -= 1;
        emit ModeratorUpdated(_moderator, false);
    }

    /// @notice Raise a dispute for a given job.
    /// @param jobId Identifier of the disputed job.
    function raiseDispute(uint256 jobId) external {
        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        require(
            msg.sender == job.employer || msg.sender == job.agent,
            "not participant"
        );
        Dispute storage d = disputes[jobId];
        require(d.claimant == address(0), "disputed");

        if (appealFee > 0) {
            stakeManager.lockDisputeFee(msg.sender, appealFee);
        }

        disputes[jobId] = Dispute({claimant: msg.sender, resolved: false});
        emit DisputeRaised(jobId, msg.sender);
    }

    /// @notice Resolve a previously raised dispute after collecting moderator approvals.
    /// @param jobId Identifier of the disputed job.
    /// @param employerWins True if the employer prevails.
    /// @param signatures Moderator signatures authorising the resolution.
    function resolve(
        uint256 jobId,
        bool employerWins,
        bytes[] calldata signatures
    ) external {
        Dispute storage d = disputes[jobId];
        require(d.claimant != address(0) && !d.resolved, "no dispute");

        uint256 approvals = _verifySignatures(jobId, employerWins, signatures);
        require(approvals * 2 > moderatorCount, "insufficient approvals");

        d.resolved = true;

        // Forward outcome to JobRegistry for fund distribution.
        jobRegistry.resolveDispute(jobId, employerWins);

        if (appealFee > 0) {
            address winner = employerWins
                ? jobRegistry.jobs(jobId).employer
                : jobRegistry.jobs(jobId).agent;
            stakeManager.payDisputeFee(winner, appealFee);
        }

        delete disputes[jobId];
        emit DisputeResolved(jobId, msg.sender, employerWins);
    }

    function _verifySignatures(
        uint256 jobId,
        bool employerWins,
        bytes[] calldata signatures
    ) internal view returns (uint256 count) {
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encodePacked(address(this), jobId, employerWins))
        );
        address[] memory seen = new address[](signatures.length);
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(hash, signatures[i]);
            require(moderators[signer], "bad sig");
            for (uint256 j; j < i; ++j) {
                require(seen[j] != signer, "dup sig");
            }
            seen[i] = signer;
            count++;
        }
    }
}

