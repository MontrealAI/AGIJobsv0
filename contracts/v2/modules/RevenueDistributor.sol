// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";

/// @title RevenueDistributor
/// @notice Splits incoming job fees among active operators based on stake.
contract RevenueDistributor is Ownable {
    IStakeManager public stakeManager;
    address public treasury;

    address[] public operators;
    mapping(address => bool) public isOperator;

    event OperatorRegistered(address indexed operator);
    event OperatorDeregistered(address indexed operator);
    event TreasuryUpdated(address indexed treasury);
    event RevenueDistributed(address indexed from, uint256 amount);

    constructor(IStakeManager _stakeManager, address owner) Ownable(owner) {
        stakeManager = _stakeManager;
    }

    /// @notice Register the caller as an operator.
    function register() external {
        require(!isOperator[msg.sender], "registered");
        uint256 stake = stakeManager.stakeOf(msg.sender, IStakeManager.Role.Platform);
        require(stake > 0, "stake");
        isOperator[msg.sender] = true;
        operators.push(msg.sender);
        emit OperatorRegistered(msg.sender);
    }

    /// @notice Deregister an operator. Only owner may remove.
    function deregister(address operator) external onlyOwner {
        if (!isOperator[operator]) return;
        isOperator[operator] = false;
        uint256 len = operators.length;
        for (uint256 i; i < len; i++) {
            if (operators[i] == operator) {
                operators[i] = operators[len - 1];
                operators.pop();
                break;
            }
        }
        emit OperatorDeregistered(operator);
    }

    /// @notice Update treasury address for rounding dust.
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Distribute received ETH to active operators by stake.
    function distribute() external payable {
        uint256 amount = msg.value;
        require(amount > 0, "amount");

        uint256 len = operators.length;
        uint256[] memory stakes = new uint256[](len);
        uint256 totalStake;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (op == owner() || !isOperator[op]) continue;
            uint256 stake = stakeManager.stakeOf(op, IStakeManager.Role.Platform);
            if (stake == 0) continue;
            stakes[i] = stake;
            totalStake += stake;
        }
        require(totalStake > 0, "total stake");

        uint256 distributed;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (op == owner()) continue;
            uint256 stake = stakes[i];
            if (stake == 0) continue;
            uint256 share = (amount * stake) / totalStake;
            distributed += share;
            (bool ok, ) = op.call{value: share}("");
            require(ok, "transfer");
        }
        uint256 dust = amount - distributed;
        if (dust > 0 && treasury != address(0)) {
            (bool ok, ) = treasury.call{value: dust}("");
            require(ok, "treasury");
        }
        emit RevenueDistributed(msg.sender, amount);
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("RevenueDistributor: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("RevenueDistributor: no ether");
    }
}

