// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title StakeManager
 * @notice Handles staking, withdrawals and automated slashing for validators.
 */
contract StakeManager is Ownable, ReentrancyGuard {
    struct StakeInfo {
        uint256 amount;
        uint64 lastUpdatedAt;
        bool exists;
    }

    mapping(address => StakeInfo) private _stakes;
    mapping(address => bool) public slashingAuthorities;

    uint256 public minimumStake;
    address public treasury;

    event StakeDeposited(address indexed staker, uint256 amount, uint256 totalStaked);
    event StakeWithdrawn(address indexed staker, uint256 amount, uint256 remaining);
    event StakeSlashed(address indexed staker, uint256 penalty, bytes32 indexed reason);
    event SlashingAuthorityUpdated(address indexed authority, bool enabled);
    event TreasuryUpdated(address indexed treasury);
    event MinimumStakeUpdated(uint256 minimumStake);

    error InsufficientStake(address account, uint256 required, uint256 current);
    error NotAuthority(address caller);

    constructor(address treasury_, uint256 minimumStake_) Ownable(msg.sender) {
        treasury = treasury_;
        minimumStake = minimumStake_;
    }

    receive() external payable {
        depositStake(msg.sender);
    }

    function depositStake(address staker) public payable nonReentrant {
        StakeInfo storage info = _stakes[staker];
        info.amount += msg.value;
        info.lastUpdatedAt = uint64(block.timestamp);
        info.exists = true;
        emit StakeDeposited(staker, msg.value, info.amount);
    }

    function withdrawStake(uint256 amount) external nonReentrant {
        StakeInfo storage info = _stakes[msg.sender];
        if (info.amount < amount) {
            revert InsufficientStake(msg.sender, amount, info.amount);
        }
        info.amount -= amount;
        info.lastUpdatedAt = uint64(block.timestamp);
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "STAKE_WITHDRAW_TRANSFER_FAILED");
        emit StakeWithdrawn(msg.sender, amount, info.amount);
    }

    function slash(
        address account,
        uint256 penaltyBps,
        bytes32 reason
    ) external returns (uint256 penalty) {
        if (!slashingAuthorities[msg.sender]) {
            revert NotAuthority(msg.sender);
        }
        StakeInfo storage info = _stakes[account];
        if (!info.exists || info.amount == 0) {
            return 0;
        }
        penalty = (info.amount * penaltyBps) / 10_000;
        if (penalty > info.amount) {
            penalty = info.amount;
        }
        info.amount -= penalty;
        info.lastUpdatedAt = uint64(block.timestamp);
        if (penalty > 0) {
            (bool success, ) = treasury.call{value: penalty}("");
            require(success, "TREASURY_TRANSFER_FAILED");
        }
        emit StakeSlashed(account, penalty, reason);
    }

    function stakeOf(address account) external view returns (uint256) {
        return _stakes[account].amount;
    }

    function configureSlashingAuthority(address authority, bool enabled) external onlyOwner {
        slashingAuthorities[authority] = enabled;
        emit SlashingAuthorityUpdated(authority, enabled);
    }

    function updateTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function updateMinimumStake(uint256 minimumStake_) external onlyOwner {
        minimumStake = minimumStake_;
        emit MinimumStakeUpdated(minimumStake_);
    }
}
