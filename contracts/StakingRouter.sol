// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OperatorRegistry} from "./OperatorRegistry.sol";

/// @title StakingRouter
/// @notice Manages operator stake balances with cooldown withdrawals and weight calculation.
contract StakingRouter is Ownable {
    using SafeERC20 for IERC20;

    error OwnerCannotStake();
    error CooldownActive();

    IERC20 public immutable token;
    OperatorRegistry public immutable registry;
    uint256 public immutable cooldown;

    mapping(address => uint256) public stakes;
    mapping(address => uint256) public pendingWithdrawals;
    mapping(address => uint256) public withdrawalTime;

    event Staked(address indexed operator, uint256 amount);
    event UnstakeInitiated(address indexed operator, uint256 amount, uint256 availableAt);
    event Withdrawal(address indexed operator, uint256 amount);

    constructor(IERC20 _token, OperatorRegistry _registry, uint256 _cooldown)
        Ownable(msg.sender)
    {
        token = _token;
        registry = _registry;
        cooldown = _cooldown;
    }

    /// @notice deposit stake for the sender
    function stake(uint256 amount) external {
        if (msg.sender == owner()) revert OwnerCannotStake();
        token.safeTransferFrom(msg.sender, address(this), amount);
        stakes[msg.sender] += amount;
        registry.updateStake(msg.sender, stakes[msg.sender]);
        emit Staked(msg.sender, amount);
    }

    /// @notice begin unstaking process with cooldown
    function initiateUnstake(uint256 amount) external {
        uint256 staked = stakes[msg.sender];
        require(staked >= amount, "amount");
        stakes[msg.sender] = staked - amount;
        pendingWithdrawals[msg.sender] += amount;
        withdrawalTime[msg.sender] = block.timestamp + cooldown;
        registry.updateStake(msg.sender, stakes[msg.sender]);
        emit UnstakeInitiated(msg.sender, amount, withdrawalTime[msg.sender]);
    }

    /// @notice withdraw tokens after cooldown
    function withdraw() external {
        uint256 availableAt = withdrawalTime[msg.sender];
        if (block.timestamp < availableAt) revert CooldownActive();
        uint256 amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;
        withdrawalTime[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
    }

    /// @notice compute stake weight using registry reputation
    function weightOf(address operator) external view returns (uint256) {
        OperatorRegistry.Operator memory op = registry.getOperator(operator);
        return op.stake * op.reputation;
    }
}

