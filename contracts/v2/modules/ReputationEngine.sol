// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine (module)
/// @notice Tracks reputation per role and enforces thresholds with blacklist support.
/// @dev Holds no funds and rejects ether so neither the contract nor its owner
///      ever custodies assets or incurs tax liabilities.
contract ReputationEngine is Ownable {
    enum Role {
        Agent,
        Validator
    }

    // reputation score per user per role
    mapping(address => mapping(Role => uint256)) private _reputation;
    // blacklist status per user per role
    mapping(address => mapping(Role => bool)) private _blacklisted;
    // authorised callers mapped to the role they may update
    mapping(address => Role) public callers;

    // minimum reputation before a user is blacklisted
    uint256 public agentThreshold;
    uint256 public validatorThreshold;

    event ReputationUpdated(address indexed user, Role indexed role, int256 delta, uint256 newScore);
    event BlacklistUpdated(address indexed user, Role indexed role, bool status);
    event CallerAuthorized(address indexed caller, Role role);
    event ThresholdsUpdated(uint256 agentThreshold, uint256 validatorThreshold);

    constructor(address owner) Ownable(owner) {}

    /// @notice Authorize a caller and assign its role.
    function setCaller(address caller, Role role) external onlyOwner {
        callers[caller] = role;
        emit CallerAuthorized(caller, role);
    }

    /// @notice Set reputation thresholds for agents and validators.
    function setThresholds(uint256 agent, uint256 validator) external onlyOwner {
        agentThreshold = agent;
        validatorThreshold = validator;
        emit ThresholdsUpdated(agent, validator);
    }

    /// @notice Owner can manually override blacklist status for a user and role.
    function setBlacklist(address user, Role role, bool status) external onlyOwner {
        _blacklisted[user][role] = status;
        emit BlacklistUpdated(user, role, status);
    }

    /// @notice Increase reputation for the caller's role.
    function addReputation(address user, uint256 amount) external {
        Role role = callers[msg.sender];
        require(_isAuthorized(role), "not authorized");

        uint256 newScore = _reputation[user][role] + amount;
        _reputation[user][role] = newScore;
        emit ReputationUpdated(user, role, int256(amount), newScore);

        uint256 threshold = _thresholdFor(role);
        if (_blacklisted[user][role] && newScore >= threshold) {
            _blacklisted[user][role] = false;
            emit BlacklistUpdated(user, role, false);
        }
    }

    /// @notice Decrease reputation for the caller's role.
    function subtractReputation(address user, uint256 amount) external {
        Role role = callers[msg.sender];
        require(_isAuthorized(role), "not authorized");

        uint256 current = _reputation[user][role];
        uint256 newScore = current > amount ? current - amount : 0;
        _reputation[user][role] = newScore;
        emit ReputationUpdated(user, role, -int256(amount), newScore);

        uint256 threshold = _thresholdFor(role);
        if (!_blacklisted[user][role] && newScore < threshold) {
            _blacklisted[user][role] = true;
            emit BlacklistUpdated(user, role, true);
        }
    }

    /// @notice Retrieve reputation score for a user and role.
    function reputationOf(address user, Role role) external view returns (uint256) {
        return _reputation[user][role];
    }

    /// @notice Check blacklist status for a user and role.
    function isBlacklisted(address user, Role role) external view returns (bool) {
        return _blacklisted[user][role];
    }

    function _thresholdFor(Role role) internal view returns (uint256) {
        return role == Role.Agent ? agentThreshold : validatorThreshold;
    }

    function _isAuthorized(Role role) internal pure returns (bool) {
        return role == Role.Agent || role == Role.Validator;
    }

    // ---------------------------------------------------------------
    // Ether rejection
    // ---------------------------------------------------------------

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("ReputationEngine: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("ReputationEngine: no ether");
    }
}

