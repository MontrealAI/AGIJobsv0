// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StakeManager
/// @notice Minimal staking and escrow contract for job payouts
contract StakeManager is Ownable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token used for staking and payouts
    IERC20 public token;

    /// @notice Amount staked by each user
    mapping(address => uint256) public stakes;

    /// @notice Emitted when a user deposits stake
    event StakeDeposited(address indexed user, uint256 amount);

    /// @notice Emitted when a user withdraws stake
    event StakeWithdrawn(address indexed user, uint256 amount);

    /// @notice Emitted when job funds are released
    event FundsReleased(address indexed to, uint256 amount);

    /// @notice Emitted when stake is slashed
    event StakeSlashed(address indexed user, address indexed recipient, uint256 amount);

    /// @notice Initialize contract with token and owner
    constructor(IERC20 _token, address owner) Ownable(owner) {
        token = _token;
    }

    /// @notice Update the ERC20 token used for staking and payouts
    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
    }

    /// @notice Deposit stake for the caller
    function depositStake(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        stakes[msg.sender] += amount;
        emit StakeDeposited(msg.sender, amount);
    }

    /// @notice Withdraw stake for the caller
    function withdrawStake(uint256 amount) external {
        uint256 staked = stakes[msg.sender];
        require(staked >= amount, "insufficient stake");
        stakes[msg.sender] = staked - amount;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, amount);
    }

    /// @notice Lock job funds from an employer
    function lockJobFunds(address from, uint256 amount) external onlyOwner {
        token.safeTransferFrom(from, address(this), amount);
    }

    /// @notice Release locked job funds to a recipient
    function releaseJobFunds(address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
        emit FundsReleased(to, amount);
    }

    /// @notice Slash stake from a user and send to a recipient
    function slash(address user, address recipient, uint256 amount) external onlyOwner {
        uint256 staked = stakes[user];
        require(staked >= amount, "insufficient stake");
        stakes[user] = staked - amount;
        token.safeTransfer(recipient, amount);
        emit StakeSlashed(user, recipient, amount);
    }
}

