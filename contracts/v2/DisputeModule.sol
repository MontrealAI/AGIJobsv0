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
    function taxPolicyVersion() external view returns (uint256);
    function taxAcknowledgedVersion(address user) external view returns (uint256);
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

    event JobRegistryUpdated(address registry);

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

    constructor(
        IJobRegistry _jobRegistry,
        uint256 _appealFee,
        address _moderator,
        address _jury
    ) Ownable(msg.sender) {
        require(address(_jobRegistry) != address(0), "registry");
        jobRegistry = _jobRegistry;
        appealFee = _appealFee;
        moderator = _moderator == address(0) ? msg.sender : _moderator;
        jury = _jury == address(0) ? msg.sender : _jury;
    }

    /// @notice Ensure participant has acknowledged current tax policy.
    modifier requiresTaxAcknowledgement(uint256 jobId) {
        address caller = msg.sender;
        if (caller == address(jobRegistry)) {
            caller = jobRegistry.jobs(jobId).agent;
        }
        require(
            jobRegistry.taxAcknowledgedVersion(caller) ==
                jobRegistry.taxPolicyVersion(),
            "acknowledge tax policy"
        );
        _;
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
    function setAppealJury(address _jury) external override onlyOwner {
        jury = _jury;
        emit AppealJuryUpdated(_jury);
    }

    /// @notice Configure the appeal bond required to escalate a job
    function setAppealFee(uint256 fee) external override onlyOwner {
        appealFee = fee;
        emit AppealFeeUpdated(fee);
    }

    /// @notice Set the job registry reference
    function setJobRegistry(IJobRegistry _jobRegistry) external onlyOwner {
        require(address(_jobRegistry) != address(0), "registry");
        jobRegistry = _jobRegistry;
        emit JobRegistryUpdated(address(_jobRegistry));
    }

    // ---------------------------------------------------------------------
    // Appeals
    // ---------------------------------------------------------------------

    /// @notice Post the appeal fee to escalate a disputed job
    /// @param jobId Identifier of the job in the JobRegistry
    function appeal(uint256 jobId)
        external
        payable
        override
        requiresTaxAcknowledgement(jobId)
    {
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

        emit DisputeRaised(jobId, caller);
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

        emit DisputeResolved(jobId, employerWins);
    }

    /// @notice Confirms the module and its owner are perpetually tax-exempt.
    /// @return Always true, indicating no tax liabilities can arise.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers; only `appeal` may receive funds.
    receive() external payable {
        revert("DisputeModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("DisputeModule: no ether");
    }
}


