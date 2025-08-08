// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes or appeals
interface IDisputeModule {
    /// @notice Error thrown when an incorrect appeal fee is supplied
    error IncorrectFee();
    /// @notice Error thrown when a job has already been appealed
    error AlreadyAppealed();
    /// @notice Error thrown when caller is neither employer nor agent
    error NotParticipant();
    /// @notice Error thrown when caller lacks permission to resolve a dispute
    error NotAuthorized();
    /// @notice Error thrown when no bond is available for a job
    error NoBond();
    /// @notice Error thrown when bond transfer fails
    error TransferFailed();

    /// @notice Emitted when an appeal is raised for a job
    /// @param jobId Identifier of the disputed job
    /// @param caller Address that initiated the appeal
    event AppealRaised(uint256 indexed jobId, address indexed caller);
    /// @notice Emitted when an appeal has been resolved
    /// @param jobId Identifier of the disputed job
    /// @param employerWins True if the employer prevails
    event AppealResolved(uint256 indexed jobId, bool employerWins);
    /// @notice Emitted when the required appeal fee is updated
    /// @param fee New appeal fee amount
    event AppealFeeUpdated(uint256 fee);
    /// @notice Emitted when the moderator address is updated
    /// @param moderator New moderator address
    event ModeratorUpdated(address moderator);
    /// @notice Emitted when the jury address is updated
    /// @param jury New jury address
    event JuryUpdated(address jury);

    /// @notice Escalate a job by posting the appeal fee
    /// @param jobId Identifier of the job being appealed
    function appeal(uint256 jobId) external payable;

    /// @notice Resolve a previously appealed job
    /// @param jobId Identifier of the job being ruled on
    /// @param employerWins True if the employer wins the dispute
    function resolve(uint256 jobId, bool employerWins) external;

    /// @notice Configure the appeal fee required to raise disputes
    /// @param fee New fee amount
    function setAppealFee(uint256 fee) external;

    /// @notice Set the moderator permitted to resolve disputes
    /// @param moderator Address of the moderator
    function setModerator(address moderator) external;

    /// @notice Set the jury permitted to resolve disputes
    /// @param jury Address of the jury
    function setJury(address jury) external;
}
