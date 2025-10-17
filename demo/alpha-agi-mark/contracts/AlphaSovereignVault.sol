// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AlphaSovereignVault
/// @notice Receives bonding-curve launch proceeds and exposes owner governance over treasury flows.
contract AlphaSovereignVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error UnauthorizedSender(address sender);
    error PendingNativeMismatch(uint256 expected, uint256 provided);
    error InvalidRecipient(address recipient);

    event LaunchManifestUpdated(string manifestUri);
    event MarkExchangeDesignated(address indexed markExchange);
    event LaunchAcknowledged(
        address indexed markExchange,
        uint256 amount,
        bool usedNativeAsset,
        bytes metadata,
        uint256 timestamp
    );
    event TreasuryWithdrawal(address indexed to, uint256 amount);
    event TreasuryTokenWithdrawal(address indexed asset, address indexed to, uint256 amount);
    event TreasuryIntakeRecorded(uint256 nativeIntakeWei, uint256 tokenIntakeWei, uint256 totalWei);

    string public manifestUri;
    address public markExchange;

    uint256 private _nativeIntake;
    uint256 private _pendingNativeAcknowledgement;
    uint256 private _tokenIntake;

    uint256 public lastAcknowledgedAmount;
    bytes public lastAcknowledgedMetadata;
    bool public lastAcknowledgedUsedNative;

    /// @param owner_ Vault administrator.
    /// @param manifestUri_ Discovery metadata for downstream analytics.
    constructor(address owner_, string memory manifestUri_) Ownable(owner_) {
        if (owner_ == address(0)) {
            revert InvalidRecipient(owner_);
        }
        manifestUri = manifestUri_;
    }

    /// @notice Update the descriptive launch manifest URI.
    function setManifestUri(string calldata newManifestUri) external onlyOwner {
        manifestUri = newManifestUri;
        emit LaunchManifestUpdated(newManifestUri);
    }

    /// @notice Assign the expected Mark exchange contract.
    function designateMarkExchange(address newMarkExchange) external onlyOwner {
        if (newMarkExchange == address(0)) {
            revert InvalidRecipient(newMarkExchange);
        }
        markExchange = newMarkExchange;
        emit MarkExchangeDesignated(newMarkExchange);
    }

    /// @notice Pause the vault to reject new acknowledgements.
    function pauseVault() external onlyOwner {
        _pause();
    }

    /// @notice Resume vault operations.
    function unpauseVault() external onlyOwner {
        _unpause();
    }

    /// @notice Receive the launch acknowledgement after finalize.
    /// @param amount Amount transferred into the vault.
    /// @param usedNativeAsset Whether the transfer used ETH instead of ERC-20.
    /// @param metadata Launch metadata blob forwarded by the exchange.
    function notifyLaunch(uint256 amount, bool usedNativeAsset, bytes calldata metadata)
        external
        returns (bool)
    {
        if (paused()) {
            revert EnforcedPause();
        }
        if (msg.sender != markExchange) {
            revert UnauthorizedSender(msg.sender);
        }
        if (usedNativeAsset) {
            if (_pendingNativeAcknowledgement < amount) {
                revert PendingNativeMismatch(_pendingNativeAcknowledgement, amount);
            }
            _pendingNativeAcknowledgement -= amount;
        } else if (amount > 0) {
            _tokenIntake += amount;
        }
        lastAcknowledgedAmount = amount;
        lastAcknowledgedMetadata = metadata;
        lastAcknowledgedUsedNative = usedNativeAsset;
        emit LaunchAcknowledged(msg.sender, amount, usedNativeAsset, metadata, block.timestamp);
        emit TreasuryIntakeRecorded(_nativeIntake, _tokenIntake, totalReceived());
        return true;
    }

    /// @notice Withdraw ETH to the requested recipient.
    function withdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) {
            revert InvalidRecipient(to);
        }
        if (amount > address(this).balance) {
            revert PendingNativeMismatch(address(this).balance, amount);
        }
        (bool success, ) = to.call{value: amount}("");
        if (!success) {
            revert PendingNativeMismatch(address(this).balance, amount);
        }
        emit TreasuryWithdrawal(to, amount);
    }

    /// @notice Withdraw ERC-20 funds from the vault.
    function withdrawToken(address asset, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) {
            revert InvalidRecipient(to);
        }
        IERC20(asset).safeTransfer(to, amount);
        emit TreasuryTokenWithdrawal(asset, to, amount);
    }

    /// @notice Current ETH balance of the vault.
    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Total amount of value that has passed through the vault.
    function totalReceived() public view returns (uint256) {
        return _nativeIntake + _tokenIntake;
    }

    /// @notice Total ETH received historically.
    function totalReceivedNative() external view returns (uint256) {
        return _nativeIntake;
    }

    /// @notice Total ERC-20 value received historically.
    function totalReceivedExternal() external view returns (uint256) {
        return _tokenIntake;
    }

    receive() external payable {
        if (msg.value == 0) {
            return;
        }
        _nativeIntake += msg.value;
        _pendingNativeAcknowledgement += msg.value;
        emit TreasuryIntakeRecorded(_nativeIntake, _tokenIntake, totalReceived());
    }
}
