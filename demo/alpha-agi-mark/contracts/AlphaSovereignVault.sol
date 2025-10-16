// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AlphaSovereignVault
/// @notice Minimal sovereign treasury that receives α-AGI MARK launch proceeds and
///         gives the operator full post-launch control.
contract AlphaSovereignVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event LaunchManifestUpdated(string manifestUri);
    event MarkExchangeDesignated(address indexed markExchange);
    event LaunchAcknowledged(address indexed markExchange, uint256 amount, bytes metadata, uint256 timestamp);
    event TreasuryWithdrawal(address indexed to, uint256 amount);
    event TreasuryTokenWithdrawal(address indexed asset, address indexed to, uint256 amount);

    string public manifestUri;
    address public markExchange;

    uint256 public totalReceived;
    uint256 public lastAcknowledgedAmount;
    bytes public lastAcknowledgedMetadata;

    constructor(address owner_, string memory manifestUri_) Ownable(owner_) {
        require(owner_ != address(0), "Owner required");
        manifestUri = manifestUri_;
    }

    function setManifestUri(string calldata newManifestUri) external onlyOwner {
        manifestUri = newManifestUri;
        emit LaunchManifestUpdated(newManifestUri);
    }

    function designateMarkExchange(address newMarkExchange) external onlyOwner {
        require(newMarkExchange != address(0), "Mark required");
        markExchange = newMarkExchange;
        emit MarkExchangeDesignated(newMarkExchange);
    }

    function pauseVault() external onlyOwner {
        _pause();
    }

    function unpauseVault() external onlyOwner {
        _unpause();
    }

    function notifyLaunch(uint256 amount, bytes calldata metadata) external whenNotPaused returns (bool) {
        require(msg.sender == markExchange, "Unauthorized sender");
        lastAcknowledgedAmount = amount;
        lastAcknowledgedMetadata = metadata;
        emit LaunchAcknowledged(msg.sender, amount, metadata, block.timestamp);
        return true;
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "Recipient required");
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Withdrawal failed");
        emit TreasuryWithdrawal(to, amount);
    }

    function withdrawToken(address asset, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "Recipient required");
        IERC20(asset).safeTransfer(to, amount);
        emit TreasuryTokenWithdrawal(asset, to, amount);
    }

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        totalReceived += msg.value;
    }
}
