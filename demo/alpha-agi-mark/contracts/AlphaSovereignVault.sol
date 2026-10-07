// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IAlphaMarkAssetSource {
    function baseAsset() external view returns (IERC20);
    function usesNativeAsset() external view returns (bool);
}

/// @title AlphaSovereignVault
/// @notice Minimal sovereign treasury that receives α-AGI MARK launch proceeds and
///         gives the operator full post-launch control.
contract AlphaSovereignVault is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

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
    mapping(address => uint256) private _pendingNativeAcknowledgement;
    mapping(address => uint256) private _acknowledgedTokenBalance;
    mapping(address => uint256) public totalReceivedToken;
    mapping(address => bool) public launchAcknowledged;
    uint256 private _tokenIntake;

    uint256 public lastAcknowledgedAmount;
    bytes public lastAcknowledgedMetadata;
    bool public lastAcknowledgedUsedNative;

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

    function notifyLaunch(uint256 amount, bool usedNativeAsset, bytes calldata metadata)
        external
        whenNotPaused
        nonReentrant
        returns (bool)
    {
        require(msg.sender == markExchange, "Unauthorized sender");
        require(!launchAcknowledged[msg.sender], "Launch already acknowledged");
        launchAcknowledged[msg.sender] = true;
        if (usedNativeAsset) {
            require(_pendingNativeAcknowledgement[msg.sender] >= amount, "Native receipt mismatch");
            _pendingNativeAcknowledgement[msg.sender] -= amount;
        } else if (amount > 0) {
            IAlphaMarkAssetSource source = IAlphaMarkAssetSource(msg.sender);
            require(!source.usesNativeAsset(), "Asset mode mismatch");
            IERC20 asset = source.baseAsset();
            address assetAddress = address(asset);
            require(assetAddress.code.length > 0, "Asset must be a contract");
            uint256 acknowledgedBalance = _acknowledgedTokenBalance[assetAddress] + amount;
            require(asset.balanceOf(address(this)) >= acknowledgedBalance, "Token receipt mismatch");
            _acknowledgedTokenBalance[assetAddress] = acknowledgedBalance;
            totalReceivedToken[assetAddress] += amount;
            _tokenIntake += amount;
        }
        lastAcknowledgedAmount = amount;
        lastAcknowledgedMetadata = metadata;
        lastAcknowledgedUsedNative = usedNativeAsset;
        emit LaunchAcknowledged(msg.sender, amount, usedNativeAsset, metadata, block.timestamp);
        emit TreasuryIntakeRecorded(_nativeIntake, _tokenIntake, totalReceived());
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
        uint256 accounted = _acknowledgedTokenBalance[asset];
        _acknowledgedTokenBalance[asset] = amount >= accounted ? 0 : accounted - amount;
        IERC20(asset).safeTransfer(to, amount);
        emit TreasuryTokenWithdrawal(asset, to, amount);
    }

    function vaultBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Legacy sum of raw units, not a valuation. Use the per-asset intake views.
    function totalReceived() public view returns (uint256) {
        return _nativeIntake + _tokenIntake;
    }

    function totalReceivedNative() external view returns (uint256) {
        return _nativeIntake;
    }

    function totalReceivedExternal() external view returns (uint256) {
        return _tokenIntake;
    }

    receive() external payable {
        if (msg.value == 0) {
            return;
        }
        _nativeIntake += msg.value;
        if (msg.sender == markExchange) {
            _pendingNativeAcknowledgement[msg.sender] += msg.value;
        }
        emit TreasuryIntakeRecorded(_nativeIntake, _tokenIntake, totalReceived());
    }
}
