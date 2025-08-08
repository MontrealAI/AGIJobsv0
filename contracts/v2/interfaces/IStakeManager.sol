// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IStakeManager
/// @notice Interface for staking balances and reward distribution
interface IStakeManager {
    event TokenUpdated(address token);
    event StakeDeposited(address indexed user, uint256 amount);
    event StakeWithdrawn(address indexed user, uint256 amount);
    event RewardLocked(address indexed from, uint256 amount);
    event RewardPaid(address indexed to, uint256 amount);
    event StakeSlashed(address indexed user, address indexed recipient, uint256 amount);

    function setToken(IERC20 newToken) external;

    function depositStake(uint256 amount) external;
    function withdrawStake(uint256 amount) external;

    function lockReward(address from, uint256 amount) external;
    function payReward(address to, uint256 amount) external;
    function slash(address user, address recipient, uint256 amount) external;
    function releaseStake(address user, uint256 amount) external;

    function stakes(address user) external view returns (uint256);
}
