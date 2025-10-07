// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IReputationEngine
/// @notice Interface for tracking and updating participant reputation scores
interface IReputationEngine {
    /// @notice Module version for compatibility checks.
    function version() external view returns (uint256);
    /// @dev Reverts when a caller is not authorised to update reputation
    error UnauthorizedCaller(address caller);

    /// @dev Reverts when attempting to act on a blacklisted user
    error BlacklistedUser(address user);
    /// @dev Reverts when array lengths for validator context mismatch
    error ArrayLengthMismatch();

    event ReputationUpdated(address indexed user, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, bool status);
    event StakeManagerUpdated(address stakeManager);
    event ScoringWeightsUpdated(uint256 stakeWeight, uint256 reputationWeight);

    /// @notice Increase a user's reputation score
    /// @param user Address whose reputation is increased
    /// @param amount Amount to add to the user's score
    /// @dev Reverts with {UnauthorizedCaller} if caller is not permitted
    ///      or {BlacklistedUser} if the user is blacklisted
    function add(address user, uint256 amount) external;

    /// @notice Decrease a user's reputation score
    /// @param user Address whose reputation is decreased
    /// @param amount Amount to subtract from the user's score
    /// @dev Reverts with {UnauthorizedCaller} if caller is not permitted
    ///      or {BlacklistedUser} if the user is blacklisted
    function subtract(address user, uint256 amount) external;

    /// @notice Retrieve a user's reputation score
    /// @param user Address to query
    /// @return The current reputation score of the user
    function reputation(address user) external view returns (uint256);

    /// @notice Alias for {reputation} for backwards compatibility
    function getReputation(address user) external view returns (uint256);

    /// @notice Alternate view to mirror v1 naming
    function reputationOf(address user) external view returns (uint256);

    /// @notice Retrieve accumulated entropy penalties for a user
    /// @param user Address to query
    /// @return The current entropy score of the user
    function entropy(address user) external view returns (uint256);

    /// @notice Alias for {entropy}
    function getEntropy(address user) external view returns (uint256);

    /// @notice Alternate view for legacy naming
    function entropyOf(address user) external view returns (uint256);

    /// @notice Check if a user is blacklisted
    /// @param user Address to query
    /// @return True if the user is blacklisted
    function isBlacklisted(address user) external view returns (bool);

    /// @notice Determine whether a user meets the premium access threshold
    /// @param user Address to query
    /// @return True if the user's reputation meets or exceeds the threshold
    function meetsThreshold(address user) external view returns (bool);

    /// @notice Owner functions

    /// @notice Allow or disallow a caller to update reputation
    /// @param caller Address of the caller to configure
    /// @param allowed True to authorise the caller, false to revoke
    function setCaller(address caller, bool allowed) external;

    /// @notice Backwards compatible alias for {setCaller}
    function setAuthorizedCaller(address caller, bool allowed) external;

    /// @notice Set the minimum score threshold for certain actions
    function setThreshold(uint256 newThreshold) external;

    /// @notice Set premium reputation threshold
    function setPremiumThreshold(uint256 newThreshold) external;

    /// @notice Add or remove a user from the blacklist
    /// @param user Address to update
    /// @param status True to blacklist the user, false to remove
    function setBlacklist(address user, bool status) external;

    /// @notice Job lifecycle hooks
    function onApply(address user) external view;

    function onFinalize(address user, bool success, uint256 payout, uint256 duration) external;

    function rewardValidator(address validator, uint256 agentGain) external;

    /// @notice Update agent and validator reputation for a completed job.
    /// @param jobId Identifier of the job being settled.
    /// @param agent Address of the agent that executed the job.
    /// @param validators Validator committee that assessed the job.
    /// @param success True if the job was approved by validators.
    /// @param validatorRevealed Flags indicating whether each validator revealed their vote.
    /// @param validatorVotes Recorded vote for each validator (true = approval).
    /// @param payout Agent payout expressed with 18 decimals.
    /// @param duration Time elapsed between assignment and completion in seconds.
    function updateScores(
        uint256 jobId,
        address agent,
        address[] calldata validators,
        bool success,
        bool[] calldata validatorRevealed,
        bool[] calldata validatorVotes,
        uint256 payout,
        uint256 duration
    ) external;

    /// @notice Compute reputation gain for an agent based on payout and duration.
    /// @param payout Amount paid to the agent (18-decimal).
    /// @param duration Job duration in seconds.
    /// @return Reputation points awarded to the agent.
    function calculateReputationPoints(uint256 payout, uint256 duration)
        external
        view
        returns (uint256);

    /// @notice Retrieve combined operator score using stake and reputation
    /// @param operator Address to query
    /// @return Weighted score used for ranking
    function getOperatorScore(address operator) external view returns (uint256);

    /// @notice Set the StakeManager used for stake lookups
    /// @param manager Address of the StakeManager contract
    function setStakeManager(address manager) external;

    /// @notice Update weighting factors for stake and reputation contributions
    /// @param stakeWeight Weight applied to stake (scaled by TOKEN_SCALE)
    /// @param reputationWeight Weight applied to reputation (scaled by TOKEN_SCALE)
    function setScoringWeights(uint256 stakeWeight, uint256 reputationWeight) external;
}

