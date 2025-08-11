// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine (module)
/// @notice Maintains role based reputation scores with weighted updates.
/// @dev Holds no funds and rejects ether so neither the contract nor owner
///      incur tax obligations.
contract ReputationEngine is Ownable {
    /// @notice participant roles
    enum Role {
        Agent,
        Validator
    }

    /// @dev reputation score per role per user
    mapping(Role => mapping(address => uint256)) private _reputation;
    /// @dev authorised modules allowed to update scores
    mapping(address => bool) public callers;

    /// @notice weight applied to positive deltas (scaled by 1e18)
    uint256 public performanceWeight = 1e18;
    /// @notice weight applied to negative deltas (scaled by 1e18)
    uint256 public slashingWeight = 1e18;

    event ReputationUpdated(Role indexed role, address indexed user, int256 delta, uint256 newScore);
    event CallerAuthorized(address indexed caller, bool allowed);
    event WeightsUpdated(uint256 performanceWeight, uint256 slashingWeight);

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    /// @notice Authorize or revoke a caller module
    function setCaller(address caller, bool allowed) external onlyOwner {
        callers[caller] = allowed;
        emit CallerAuthorized(caller, allowed);
    }

    /// @notice Configure weighting factors for positive and negative updates
    function setWeights(uint256 performance, uint256 slashing) external onlyOwner {
        performanceWeight = performance;
        slashingWeight = slashing;
        emit WeightsUpdated(performance, slashing);
    }

    /// @notice Update reputation for a user and role
    /// @param role Role whose score is updated
    /// @param user Address whose reputation changes
    /// @param delta Signed change applied to the score
    function updateReputation(Role role, address user, int256 delta) external onlyCaller {
        int256 weight = delta >= 0 ? int256(performanceWeight) : int256(slashingWeight);
        int256 adjusted = (delta * weight) / int256(1e18);
        int256 current = int256(_reputation[role][user]);
        int256 newScoreSigned = current + adjusted;
        if (newScoreSigned < 0) newScoreSigned = 0;
        uint256 newScore = uint256(newScoreSigned);
        _reputation[role][user] = newScore;
        emit ReputationUpdated(role, user, adjusted, newScore);
    }

    /// @notice Return reputation score for a user and role
    function getReputation(Role role, address user) public view returns (uint256) {
        return _reputation[role][user];
    }

    /// @notice Routing score used for job prioritisation
    function getRoutingScore(Role role, address user) external view returns (uint256) {
        return getReputation(role, user);
    }

    /// @notice Governance power derived from reputation
    function getGovernancePower(Role role, address user) external view returns (uint256) {
        return getReputation(role, user);
    }

    /// @notice Confirms the module and its owner are tax neutral
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract tax neutral
    receive() external payable {
        revert("ReputationEngine: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds
    fallback() external payable {
        revert("ReputationEngine: no ether");
    }
}

