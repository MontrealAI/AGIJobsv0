// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReputationEngine
/// @notice Tracks reputation scores with blacklist enforcement.
/// Only authorised callers may update scores.
/// @dev Holds no funds and rejects ether so neither the contract nor the
///      owner ever custodies assets or incurs tax liabilities.
contract ReputationEngine is Ownable {
    mapping(address => uint256) private _scores;
    mapping(address => bool) private _blacklisted;
    mapping(address => bool) public callers;
    uint256 public threshold;

    event ReputationChanged(address indexed user, int256 delta, uint256 newScore);
    event Blacklisted(address indexed user, bool status);
    event CallerUpdated(address indexed caller, bool allowed);
    event ThresholdUpdated(uint256 newThreshold);

    constructor(address owner) Ownable(owner) {}

    modifier onlyCaller() {
        require(callers[msg.sender], "not authorized");
        _;
    }

    /// @notice Authorize or revoke a caller.
    function setCaller(address caller, bool allowed) external onlyOwner {
        callers[caller] = allowed;
        emit CallerUpdated(caller, allowed);
    }

    /// @notice Set reputation threshold for automatic blacklisting.
    function setThreshold(uint256 newThreshold) external onlyOwner {
        threshold = newThreshold;
        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Update blacklist status for a user.
    /// @dev Only authorised modules may call this function.
    function blacklist(address user, bool status) external onlyCaller {
        _blacklisted[user] = status;
        emit Blacklisted(user, status);
    }

    /// @notice Increase reputation for a user.
    function add(address user, uint256 amount) external onlyCaller {
        uint256 newScore = _scores[user] + amount;
        _scores[user] = newScore;
        emit ReputationChanged(user, int256(amount), newScore);

        if (_blacklisted[user] && newScore >= threshold) {
            _blacklisted[user] = false;
            emit Blacklisted(user, false);
        }
    }

    /// @notice Decrease reputation for a user.
    function subtract(address user, uint256 amount) external onlyCaller {
        uint256 current = _scores[user];
        uint256 newScore = current > amount ? current - amount : 0;
        _scores[user] = newScore;
        emit ReputationChanged(user, -int256(amount), newScore);

        if (!_blacklisted[user] && newScore < threshold) {
            _blacklisted[user] = true;
            emit Blacklisted(user, true);
        }
    }

    /// @notice Get reputation score for a user.
    function reputation(address user) external view returns (uint256) {
        return _scores[user];
    }

    /// @notice Check blacklist status for a user.
    function isBlacklisted(address user) external view returns (bool) {
        return _blacklisted[user];
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

