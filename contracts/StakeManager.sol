// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IJobRegistryTax} from "./v2/interfaces/IJobRegistryTax.sol";

/// @title StakeManager
/// @notice Handles staking and reward transfers for the job system.
/// @dev All token operations use 6 decimal scaling (1 token = 1e6 units).
///      Example: to stake 5 tokens pass `5_000_000`. Integrations with
///      standard 18-decimal ERC-20s must downscale amounts by 1e12, which
///      can introduce precision loss.
contract StakeManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token;
    IJobRegistryTax public jobRegistry;

    mapping(address => uint256) public stakes;

    event TokenUpdated(address token);
    event JobRegistryUpdated(address registry);
    event StakeDeposited(address indexed user, uint256 amount);
    event StakeWithdrawn(address indexed user, uint256 amount);
    event RewardLocked(address indexed from, uint256 amount);
    event RewardPaid(address indexed to, uint256 amount);
    event StakeSlashed(address indexed user, address indexed recipient, uint256 amount);

    constructor(IERC20 _token, address owner) Ownable(owner) {
        token = _token;
        emit TokenUpdated(address(_token));
    }

    /// @notice Set the JobRegistry used for tax acknowledgement tracking.
    function setJobRegistry(IJobRegistryTax registry) external onlyOwner {
        jobRegistry = registry;
        emit JobRegistryUpdated(address(registry));
    }

    modifier requiresTaxAcknowledgement() {
        if (msg.sender != owner()) {
            address registry = address(jobRegistry);
            require(registry != address(0), "job registry");
            require(
                jobRegistry.taxAcknowledgedVersion(msg.sender) ==
                    jobRegistry.taxPolicyVersion(),
                "acknowledge tax policy"
            );
        }
        _;
    }

    /// @notice Update the ERC20 token used for staking and rewards.
    function setToken(IERC20 newToken) external onlyOwner {
        token = newToken;
        emit TokenUpdated(address(newToken));
    }

    /// @notice Deposit stake for the caller.
    function depositStake(uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        token.safeTransferFrom(msg.sender, address(this), amount);
        stakes[msg.sender] += amount;
        emit StakeDeposited(msg.sender, amount);
    }

    /// @notice Withdraw stake for the caller.
    function withdrawStake(uint256 amount)
        external
        requiresTaxAcknowledgement
        nonReentrant
    {
        uint256 staked = stakes[msg.sender];
        require(staked >= amount, "insufficient stake");
        stakes[msg.sender] = staked - amount;
        token.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, amount);
    }

    /// @notice Lock reward funds from an employer for a job.
    function lockReward(address from, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        token.safeTransferFrom(from, address(this), amount);
        emit RewardLocked(from, amount);
    }

    /// @notice Pay job reward to the recipient.
    function payReward(address to, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        token.safeTransfer(to, amount);
        emit RewardPaid(to, amount);
    }

    /// @notice Slash stake from a user and send to a recipient.
    function slash(address user, address recipient, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        uint256 staked = stakes[user];
        require(staked >= amount, "insufficient stake");
        stakes[user] = staked - amount;
        token.safeTransfer(recipient, amount);
        emit StakeSlashed(user, recipient, amount);
    }

    /// @notice Release stake back to a user (used on job completion).
    function releaseStake(address user, uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        uint256 staked = stakes[user];
        require(staked >= amount, "insufficient stake");
        stakes[user] = staked - amount;
        token.safeTransfer(user, amount);
        emit StakeWithdrawn(user, amount);
    }

    /// @notice Confirms the contract and owner remain tax-exempt.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    receive() external payable {
        revert("StakeManager: no ether");
    }

    fallback() external payable {
        revert("StakeManager: no ether");
    }
}

