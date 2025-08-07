// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StakeManager
/// @notice Handles staking and reward transfers for the job system.
contract StakeManager is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public token;

    mapping(address => uint256) public stakes;

    event TokenUpdated(address token);
    event StakeDeposited(address indexed user, uint256 amount);
    event StakeWithdrawn(address indexed user, uint256 amount);
    event RewardLocked(address indexed from, uint256 amount);
    event RewardPaid(address indexed to, uint256 amount);
    event StakeSlashed(address indexed user, address indexed recipient, uint256 amount);

    constructor(IERC20 _token, address owner) Ownable(owner) {
        token = _token;
        emit TokenUpdated(address(_token));
    }

    /// @notice Update the ERC20 token used for staking and rewards.
    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
        emit TokenUpdated(address(newToken));
    }

    /// @notice Deposit stake for the caller.
    function depositStake(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        stakes[msg.sender] += amount;
        emit StakeDeposited(msg.sender, amount);
    }

    /// @notice Withdraw stake for the caller.
    function withdrawStake(uint256 amount) external {
        uint256 staked = stakes[msg.sender];
        require(staked >= amount, "insufficient stake");
        stakes[msg.sender] = staked - amount;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, amount);
    }

    /// @notice Lock reward funds from an employer for a job.
    function lockReward(address from, uint256 amount) external onlyOwner {
        token.safeTransferFrom(from, address(this), amount);
        emit RewardLocked(from, amount);
    }

    /// @notice Pay job reward to the recipient.
    function payReward(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
        emit RewardPaid(to, amount);
    }

    /// @notice Slash stake from a user and send to a recipient.
    function slash(address user, address recipient, uint256 amount) external onlyOwner {
        uint256 staked = stakes[user];
        require(staked >= amount, "insufficient stake");
        stakes[user] = staked - amount;
        token.safeTransfer(recipient, amount);
        emit StakeSlashed(user, recipient, amount);
    }

    /// @notice Release stake back to a user (used on job completion).
    function releaseStake(address user, uint256 amount) external onlyOwner {
        uint256 staked = stakes[user];
        require(staked >= amount, "insufficient stake");
        stakes[user] = staked - amount;
        token.safeTransfer(user, amount);
        emit StakeWithdrawn(user, amount);
    }
}

