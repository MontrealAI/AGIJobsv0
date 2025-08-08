// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IDisputeModule
/// @notice Interface for raising and resolving disputes or appeals
interface IDisputeModule {
    /// @dev Reverts when appeal fee sent does not match required value
    error IncorrectAppealFee(uint256 expected, uint256 provided);

    /// @dev Reverts when a job has already been appealed
    error AlreadyAppealed(uint256 jobId);

    /// @dev Reverts when caller is neither the employer nor the agent
    error NotParticipant(address caller);

    /// @dev Reverts when dispute resolution is attempted by an unauthorised account
    error NotArbiter(address caller);

    /// @dev Reverts when no appeal bond exists for a job
    error NoAppealBond(uint256 jobId);

    event AppealRaised(uint256 indexed jobId, address indexed caller);
    event AppealResolved(uint256 indexed jobId, bool employerWins);
    event AppealFeeUpdated(uint256 fee);
    event ModeratorUpdated(address moderator);
    event JuryUpdated(address jury);

    /// @notice Escalate a job dispute by posting the appeal fee
    /// @param jobId Identifier of the disputed job
    /// @dev Reverts with {IncorrectAppealFee} if the supplied value is wrong
    ///      or {AlreadyAppealed} if a bond already exists
    function appeal(uint256 jobId) external payable;

    /// @notice Resolve an appealed job and distribute the bond to the winner
    /// @param jobId Identifier of the job being appealed
    /// @param employerWins True if the employer prevails in the dispute
    /// @dev Reverts with {NotArbiter} if caller is unauthorised or
    ///      {NoAppealBond} if no bond was posted
    function resolve(uint256 jobId, bool employerWins) external;

    /// @notice Owner configuration for appeal economics
    /// @param fee New fee required to raise an appeal
    /// @dev Only callable by contract owner
    function setAppealFee(uint256 fee) external;

    /// @notice Owner configuration for dispute moderator
    /// @param moderator Address allowed to resolve disputes in addition to owner
    /// @dev Only callable by contract owner
    function setModerator(address moderator) external;

    /// @notice Owner configuration for dispute jury
    /// @param jury Address allowed to resolve disputes alongside owner
    /// @dev Only callable by contract owner
    function setJury(address jury) external;
}
