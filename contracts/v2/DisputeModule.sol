// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";

/// @notice Minimal interface for the JobRegistry used by the dispute module
interface IJobRegistry {
    struct Job {
        address agent;
        address employer;
        uint256 reward;
        uint256 stake;
        uint8 state;
    }

    function jobs(uint256 jobId) external view returns (Job memory);
    function resolveDispute(uint256 jobId, bool employerWins) external;
    function finalize(uint256 jobId) external;
}

/// @title DisputeModule
/// @notice Simple appeal layer with bond posting and moderator/jury resolution
/// @dev The owner or an appointed moderator finalises disputes. Bonds are paid
///      to the winning party. When a dispute is resolved the module calls back
///      into the JobRegistry which in turn distributes funds and slashes stakes
///      through the StakeManager. Only the `appeal` function accepts ether; all
///      other transfers are rejected so the contract and owner remain tax
///      neutral.
contract DisputeModule is IDisputeModule, Ownable {
    /// @notice Registry managing the underlying jobs
    IJobRegistry public jobRegistry;

    /// @notice Fee that must accompany an appeal. Acts as a bond returned to
    ///         the winner of the dispute.
    uint256 public appealFee;

    /// @notice Optional moderator address allowed to resolve disputes in
    ///         addition to the contract owner. This can be a multisig or a
    ///         validator committee address.
    address public moderator;

    /// @notice Optional jury address that may also resolve disputes.
    address public jury;

    /// @dev Tracks who appealed a particular job.
    mapping(uint256 => address payable) public appellants;

    /// @dev Amount of bond posted for each job appeal.
    mapping(uint256 => uint256) public bonds;

    constructor(IJobRegistry _jobRegistry, address owner) Ownable(owner) {
        jobRegistry = _jobRegistry;
        moderator = owner;
        jury = owner;
    }

    // ---------------------------------------------------------------------
    // Owner configuration
    // ---------------------------------------------------------------------

    /// @notice Set the moderator allowed to resolve disputes alongside the owner
    function setModerator(address _moderator) external override onlyOwner {
        moderator = _moderator;
        emit ModeratorUpdated(_moderator);
    }

    /// @notice Set the jury allowed to resolve disputes alongside the owner
    function setJury(address _jury) external override onlyOwner {
        jury = _jury;
        emit JuryUpdated(_jury);
    }

    /// @notice Configure the appeal bond required to escalate a job
    function setAppealFee(uint256 fee) external override onlyOwner {
        appealFee = fee;
        emit AppealFeeUpdated(fee);
    }

    // ---------------------------------------------------------------------
    // Appeals
    // ---------------------------------------------------------------------

    /// @notice Post the appeal fee to escalate a disputed job
    /// @param jobId Identifier of the job in the JobRegistry
    function appeal(uint256 jobId) external payable override {
        if (msg.value != appealFee) {
            revert IncorrectAppealFee(appealFee, msg.value);
        }
        if (bonds[jobId] != 0) {
            revert AlreadyAppealed(jobId);
        }

        IJobRegistry.Job memory job = jobRegistry.jobs(jobId);
        address caller = msg.sender == address(jobRegistry)
            ? job.agent
            : msg.sender;
        if (caller != job.agent && caller != job.employer) {
            revert NotParticipant(caller);
        }

        appellants[jobId] = payable(caller);
        bonds[jobId] = msg.value;

        emit AppealRaised(jobId, caller);
    }

    // ---------------------------------------------------------------------
    // Resolution
    // ---------------------------------------------------------------------

    /// @dev Restrict resolution to owner or designated moderator/jury address
    modifier onlyArbiter() {
        if (
            msg.sender != owner() &&
            msg.sender != moderator &&
            msg.sender != jury
        ) {
            revert NotArbiter(msg.sender);
        }
        _;
    }

    /// @notice Resolve an appealed job and finalise the associated registry
    ///         outcome. The appeal bond is paid to the prevailing party.
    /// @param jobId Identifier of the job being appealed
    /// @param employerWins True if the employer wins the dispute
    function resolve(uint256 jobId, bool employerWins)
        external
        override
        onlyArbiter
    {
        uint256 bond = bonds[jobId];
        if (bond == 0) {
            revert NoAppealBond(jobId);
        }

        // Determine bond recipient
        address payable recipient = employerWins
            ? payable(jobRegistry.jobs(jobId).employer)
            : appellants[jobId];

        // Inform the registry of the final ruling and trigger settlement
        jobRegistry.resolveDispute(jobId, employerWins);
        jobRegistry.finalize(jobId);

        // Clean up state before transferring
        delete bonds[jobId];
        delete appellants[jobId];

        (bool ok, ) = recipient.call{value: bond}("");
        require(ok, "transfer failed");

        emit AppealResolved(jobId, employerWins);
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers; only `appeal` may receive funds.
    receive() external payable {
        revert("DisputeModule: no direct ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("DisputeModule: no direct ether");
    }
}


