// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAlphaMarkRiskOracle {
    function seedValidated() external view returns (bool);
    function approvalCount() external view returns (uint256);
    function approvalThreshold() external view returns (uint256);
}

interface IAlphaSovereignVault {
    function notifyLaunch(uint256 amount, bytes calldata metadata) external returns (bool);
}

interface IAlphaSovereignVaultV2 {
    function notifyLaunchDetailed(
        uint256 amount,
        address asset,
        bool usesNative,
        bytes calldata metadata
    ) external returns (bool);
}

error LaunchAcknowledgementFailed(address recipient);
error LaunchAcknowledgementRejected(address recipient);

/// @title AlphaMarkEToken
/// @notice Bonding-curve market-maker for α-AGI Nova-Seed financing.
contract AlphaMarkEToken is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 private constant WHOLE_TOKEN = 1e18;

    IAlphaMarkRiskOracle public riskOracle;

    uint256 public basePrice; // base asset units per token
    uint256 public slope; // base asset units increase per token
    uint256 public maxSupply; // whole tokens (0 == unlimited)
    uint256 public fundingCap; // wei (0 == unlimited)
    uint256 public saleDeadline; // timestamp (0 == none)

    uint256 public reserveBalance; // base asset units held for redemptions

    bool public whitelistEnabled;
    mapping(address => bool) public whitelist;

    mapping(address => uint256) public participantContribution;

    address payable public treasury;

    IERC20 public baseAsset;
    bool public usesNativeAsset; // true => ETH, false => ERC20

    event BaseAssetUpdated(address indexed asset, bool usesNative);

    bool public finalized;
    bool public aborted;
    bool public emergencyExitEnabled;

    bool public validationOverrideEnabled;
    bool public validationOverrideStatus;

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event TokensSold(address indexed seller, uint256 amount, uint256 refund);
    event WhitelistModeUpdated(bool enabled);
    event WhitelistStatusUpdated(address indexed account, bool allowed);
    event CurveParametersUpdated(uint256 basePrice, uint256 slope);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event FundingCapUpdated(uint256 newCap);
    event TreasuryUpdated(address treasury);
    event SaleDeadlineUpdated(uint256 newDeadline);
    event ValidationOverrideUpdated(bool status);
    event LaunchFinalized(address indexed recipient, uint256 reserveTransferred, bytes metadata);
    event LaunchAborted();
    event EmergencyExitUpdated(bool enabled);

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_,
        address riskOracle_,
        uint256 basePrice_,
        uint256 slope_,
        uint256 maxSupply_,
        address baseAsset_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        require(owner_ != address(0), "Owner required");
        basePrice = basePrice_;
        slope = slope_;
        maxSupply = maxSupply_;
        riskOracle = IAlphaMarkRiskOracle(riskOracle_);
        _setBaseAsset(baseAsset_);
    }

    // ----------- Core Market Functions -----------

    function buyTokens(uint256 amount) external payable whenNotPaused nonReentrant {
        require(!finalized && !aborted, "Sale closed");
        require(amount > 0, "Amount zero");
        uint256 wholeAmount = _requireWhole(amount);
        _enforceSaleWindow();
        _enforceWhitelist(msg.sender);

        uint256 newSupply = _currentSupply() + wholeAmount;
        if (maxSupply != 0) {
            require(newSupply <= maxSupply, "Exceeds supply");
        }

        uint256 cost = _purchaseCost(wholeAmount);
        if (fundingCap != 0) {
            require(reserveBalance + cost <= fundingCap, "Funding cap reached");
        }

        if (usesNativeAsset) {
            require(msg.value >= cost, "Insufficient payment");
        } else {
            require(msg.value == 0, "Native payment disabled");
            baseAsset.safeTransferFrom(msg.sender, address(this), cost);
        }

        _mint(msg.sender, amount);
        reserveBalance += cost;
        participantContribution[msg.sender] += cost;

        if (usesNativeAsset && msg.value > cost) {
            (bool success, ) = msg.sender.call{value: msg.value - cost}("");
            require(success, "Refund failed");
        }

        emit TokensPurchased(msg.sender, amount, cost);
    }

    function sellTokens(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount zero");
        uint256 wholeAmount = _requireWhole(amount);
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        if (paused()) {
            require(emergencyExitEnabled, "Paused");
        }

        uint256 refund = _saleReturn(wholeAmount);
        require(refund <= reserveBalance, "Insufficient reserve");

        _burn(msg.sender, amount);
        reserveBalance -= refund;

        if (usesNativeAsset) {
            (bool success, ) = msg.sender.call{value: refund}("");
            require(success, "Refund transfer failed");
        } else {
            baseAsset.safeTransfer(msg.sender, refund);
        }

        emit TokensSold(msg.sender, amount, refund);
    }

    function previewPurchaseCost(uint256 amount) external view returns (uint256) {
        uint256 wholeAmount = _requireWholeView(amount);
        return _purchaseCost(wholeAmount);
    }

    function previewSaleReturn(uint256 amount) external view returns (uint256) {
        uint256 wholeAmount = _requireWholeView(amount);
        return _saleReturn(wholeAmount);
    }

    // ----------- Owner Controls -----------

    function pauseMarket() external onlyOwner {
        _pause();
    }

    function unpauseMarket() external onlyOwner {
        _unpause();
    }

    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistModeUpdated(enabled);
    }

    function setWhitelist(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelist[accounts[i]] = allowed;
            emit WhitelistStatusUpdated(accounts[i], allowed);
        }
    }

    function setCurveParameters(uint256 basePrice_, uint256 slope_) external onlyOwner {
        require(totalSupply() == 0, "Supply already minted");
        basePrice = basePrice_;
        slope = slope_;
        emit CurveParametersUpdated(basePrice_, slope_);
    }

    function setMaxSupply(uint256 newMaxSupply) external onlyOwner {
        if (newMaxSupply != 0) {
            require(newMaxSupply >= _currentSupply(), "Below supply");
        }
        maxSupply = newMaxSupply;
        emit MaxSupplyUpdated(newMaxSupply);
    }

    function setFundingCap(uint256 newCap) external onlyOwner {
        require(newCap == 0 || newCap >= reserveBalance, "Below reserve");
        fundingCap = newCap;
        emit FundingCapUpdated(newCap);
    }

    function setTreasury(address payable newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Treasury required");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setSaleDeadline(uint256 deadline) external onlyOwner {
        if (deadline != 0) {
            require(deadline > block.timestamp, "Deadline in past");
        }
        saleDeadline = deadline;
        emit SaleDeadlineUpdated(deadline);
    }

    function setRiskOracle(address newOracle) external onlyOwner {
        riskOracle = IAlphaMarkRiskOracle(newOracle);
    }

    function setBaseAsset(address newAsset) external onlyOwner {
        require(totalSupply() == 0, "Supply exists");
        require(reserveBalance == 0, "Reserve not empty");
        _setBaseAsset(newAsset);
    }

    function setValidationOverride(bool enabled, bool status) external onlyOwner {
        validationOverrideEnabled = enabled;
        validationOverrideStatus = status;
        emit ValidationOverrideUpdated(enabled ? status : false);
    }

    function setEmergencyExit(bool enabled) external onlyOwner {
        emergencyExitEnabled = enabled;
        emit EmergencyExitUpdated(enabled);
    }

    function finalizeLaunch(address payable sovereignRecipient, bytes calldata metadata)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        require(!finalized, "Already finalized");
        require(!aborted, "Aborted");
        require(_isValidated(), "Not validated");
        address payable recipient = sovereignRecipient;
        if (recipient == address(0)) {
            recipient = treasury;
        }
        require(recipient != address(0), "Recipient required");

        finalized = true;
        _pause();

        uint256 amount = reserveBalance;
        reserveBalance = 0;

        if (usesNativeAsset) {
            (bool success, ) = recipient.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            baseAsset.safeTransfer(recipient, amount);
        }

        _attemptSovereignAcknowledgement(recipient, amount, metadata);

        emit LaunchFinalized(recipient, amount, metadata);
    }

    function abortLaunch() external onlyOwner {
        require(!finalized, "Already finalized");
        require(!aborted, "Already aborted");
        aborted = true;
        emergencyExitEnabled = true;
        if (!paused()) {
            _pause();
        }
        emit LaunchAborted();
        emit EmergencyExitUpdated(true);
    }

    function withdrawResidual(address payable to) external onlyOwner {
        require(finalized || aborted, "Not closed");
        require(to != address(0), "Invalid recipient");
        uint256 balance = _assetBalance();
        uint256 amount = balance - reserveBalance;
        require(amount > 0, "No residual");
        if (usesNativeAsset) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "Residual transfer failed");
        } else {
            baseAsset.safeTransfer(to, amount);
        }
    }

    // ----------- Views -----------

    function isValidated() external view returns (bool) {
        return _isValidated();
    }

    function getCurveState() external view returns (uint256 supply, uint256 reserve, uint256 nextPrice) {
        uint256 currentSupply = _currentSupply();
        return (currentSupply, reserveBalance, _priceForSupply(currentSupply));
    }

    function getOwnerControls()
        external
        view
        returns (
            bool isPaused,
            bool whitelistMode,
            bool emergencyExit,
            bool isFinalized,
            bool isAborted,
            bool overrideEnabled_,
            bool overrideStatus_,
            address treasuryAddr,
            address riskOracleAddr,
            address baseAssetAddr,
            bool usesNative,
            uint256 fundingCapWei,
            uint256 maxSupplyWholeTokens,
            uint256 saleDeadlineTimestamp,
            uint256 basePriceWei,
            uint256 slopeWei
        )
    {
        return (
            paused(),
            whitelistEnabled,
            emergencyExitEnabled,
            finalized,
            aborted,
            validationOverrideEnabled,
            validationOverrideStatus,
            treasury,
            address(riskOracle),
            _baseAssetAddress(),
            usesNativeAsset,
            fundingCap,
            maxSupply,
            saleDeadline,
            basePrice,
            slope
        );
    }

    // ----------- Internal helpers -----------

    function _currentSupply() internal view returns (uint256) {
        return totalSupply() / WHOLE_TOKEN;
    }

    function _requireWhole(uint256 amount) internal pure returns (uint256) {
        require(amount % WHOLE_TOKEN == 0, "Whole tokens only");
        return amount / WHOLE_TOKEN;
    }

    function _requireWholeView(uint256 amount) internal pure returns (uint256) {
        if (amount % WHOLE_TOKEN != 0) {
            revert("Whole tokens only");
        }
        return amount / WHOLE_TOKEN;
    }

    function _purchaseCost(uint256 amount) internal view returns (uint256) {
        uint256 supply = _currentSupply();
        uint256 baseComponent = basePrice * amount;
        uint256 slopeComponent = slope * ((amount * ((2 * supply) + amount - 1)) / 2);
        return baseComponent + slopeComponent;
    }

    function _saleReturn(uint256 amount) internal view returns (uint256) {
        uint256 supply = _currentSupply();
        require(amount <= supply, "Amount exceeds supply");
        uint256 baseComponent = basePrice * amount;
        if (amount == 0) {
            return baseComponent;
        }
        uint256 slopeComponent = 0;
        if (supply > 0) {
            uint256 numerator = amount * ((2 * (supply - 1)) - (amount - 1));
            slopeComponent = slope * (numerator / 2);
        }
        return baseComponent + slopeComponent;
    }

    function _priceForSupply(uint256 supply) internal view returns (uint256) {
        return basePrice + (slope * supply);
    }

    function _enforceSaleWindow() internal view {
        if (saleDeadline != 0) {
            require(block.timestamp <= saleDeadline, "Sale expired");
        }
    }

    function _enforceWhitelist(address account) internal view {
        if (whitelistEnabled) {
            require(whitelist[account], "Not whitelisted");
        }
    }

    function _isValidated() internal view returns (bool) {
        if (validationOverrideEnabled) {
            return validationOverrideStatus;
        }
        if (address(riskOracle) != address(0)) {
            try riskOracle.seedValidated() returns (bool result) {
                return result;
            } catch {
                return false;
            }
        }
        return false;
    }

    function _setBaseAsset(address asset) internal {
        if (asset == address(0)) {
            baseAsset = IERC20(address(0));
            usesNativeAsset = true;
        } else {
            baseAsset = IERC20(asset);
            usesNativeAsset = false;
        }
        emit BaseAssetUpdated(asset, usesNativeAsset);
    }

    function _baseAssetAddress() internal view returns (address) {
        return usesNativeAsset ? address(0) : address(baseAsset);
    }

    function _assetBalance() internal view returns (uint256) {
        if (usesNativeAsset) {
            return address(this).balance;
        }
        return baseAsset.balanceOf(address(this));
    }

    function _attemptSovereignAcknowledgement(address recipient, uint256 amount, bytes calldata metadata) internal {
        if (recipient.code.length == 0) {
            return;
        }

        address assetAddress = _baseAssetAddress();
        bool usesNative = usesNativeAsset;

        try IAlphaSovereignVaultV2(recipient).notifyLaunchDetailed(amount, assetAddress, usesNative, metadata) returns (
            bool acknowledgedV2
        ) {
            if (!acknowledgedV2) {
                revert LaunchAcknowledgementRejected(recipient);
            }
            return;
        } catch (bytes memory lowLevelData) {
            if (lowLevelData.length != 0) {
                revert LaunchAcknowledgementFailed(recipient);
            }
        }

        try IAlphaSovereignVault(recipient).notifyLaunch(amount, metadata) returns (bool acknowledged) {
            if (!acknowledged) {
                revert LaunchAcknowledgementRejected(recipient);
            }
        } catch {
            revert LaunchAcknowledgementFailed(recipient);
        }
    }

    receive() external payable {
        revert("Direct payments disabled");
    }
}
