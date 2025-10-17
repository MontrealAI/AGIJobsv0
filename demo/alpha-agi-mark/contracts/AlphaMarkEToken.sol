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
}

interface IAlphaSovereignVault {
    function notifyLaunch(uint256 amount, bool usedNativeAsset, bytes calldata metadata) external returns (bool);
}

/// @title AlphaMarkEToken
/// @notice Bonding-curve ERC-20 that finances Nova-Seed launches with owner-governed controls.
/// @dev The token price follows an arithmetic bonding curve P(n) = basePrice + slope * n where n is
///      the current whole-token supply. Purchases and sales must be exact whole tokens (18 decimals).
contract AlphaMarkEToken is ERC20, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error AmountZero();
    error WholeTokensOnly();
    error SaleClosed();
    error SaleAlreadyStarted();
    error FundingCapReached();
    error NativePaymentDisabled();
    error InsufficientPayment();
    error InsufficientBalance();
    error RefundFailed();
    error ReserveInsufficient();
    error SaleExpired();
    error NotWhitelisted(address account);
    error ValidationRequired();
    error InvalidRecipient();
    error LaunchAcknowledgementFailed(address recipient);
    error LaunchAcknowledgementRejected(address recipient);
    error NotClosed();
    error MaxSupplyExceeded();
    error ReserveNotEmpty();
    error AmountExceedsSupply();
    error CapBelowReserve();

    uint256 private constant WHOLE_TOKEN = 1e18;

    IAlphaMarkRiskOracle public riskOracle;

    uint256 public basePrice; // base asset units per whole token
    uint256 public slope; // incremental price increase per whole token
    uint256 public maxSupply; // whole tokens (0 => unlimited)
    uint256 public fundingCap; // base asset units (0 => unlimited)
    uint256 public saleDeadline; // timestamp (0 => no deadline)

    uint256 public reserveBalance; // total assets held for redemptions

    bool public whitelistEnabled;
    mapping(address => bool) public whitelist;
    mapping(address => uint256) public participantContribution;

    address payable public treasury;
    IERC20 public baseAsset;
    bool public usesNativeAsset; // true when ETH is the base asset

    bool public finalized;
    bool public aborted;
    bool public emergencyExitEnabled;

    bool public validationOverrideEnabled;
    bool public validationOverrideStatus;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event BaseAssetUpdated(address indexed asset, bool usesNativeAsset);
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event TokensSold(address indexed seller, uint256 amount, uint256 refund);
    event WhitelistModeUpdated(bool enabled);
    event WhitelistStatusUpdated(address indexed account, bool allowed);
    event CurveParametersUpdated(uint256 basePrice, uint256 slope);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    event FundingCapUpdated(uint256 newCap);
    event TreasuryUpdated(address indexed treasury);
    event SaleDeadlineUpdated(uint256 newDeadline);
    event RiskOracleUpdated(address indexed oracle);
    event ValidationOverrideUpdated(bool enabled, bool status);
    event EmergencyExitUpdated(bool enabled);
    event LaunchFinalized(address indexed recipient, uint256 reserveTransferred, bytes metadata);
    event LaunchAborted();
    event ResidualWithdrawn(address indexed to, uint256 amount);

    /// @param name_ Token name.
    /// @param symbol_ Token symbol.
    /// @param owner_ Contract owner with governance authority.
    /// @param riskOracle_ Risk oracle that must approve launches.
    /// @param basePrice_ Initial base price per whole token.
    /// @param slope_ Initial slope for the bonding curve.
    /// @param maxSupply_ Maximum whole token supply (0 => unlimited).
    /// @param baseAsset_ Address of ERC-20 base asset (zero for native ETH).
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
        if (owner_ == address(0)) {
            revert InvalidRecipient();
        }
        basePrice = basePrice_;
        slope = slope_;
        maxSupply = maxSupply_;
        riskOracle = IAlphaMarkRiskOracle(riskOracle_);
        _setBaseAsset(baseAsset_);
    }

    // ---------------------------------------------------------------------
    // Core market functionality
    // ---------------------------------------------------------------------

    /// @notice Purchase whole tokens according to the bonding curve.
    /// @param amount Amount in 18-decimal token units (must be a whole multiple of 1e18).
    function buyTokens(uint256 amount) external payable nonReentrant {
        if (paused()) {
            revert EnforcedPause();
        }
        if (finalized || aborted) {
            revert SaleClosed();
        }
        if (amount == 0) {
            revert AmountZero();
        }
        uint256 wholeAmount = _requireWhole(amount);
        _enforceSaleWindow();
        _enforceWhitelist(msg.sender);

        uint256 newSupply = _currentSupply() + wholeAmount;
        if (maxSupply != 0 && newSupply > maxSupply) {
            revert MaxSupplyExceeded();
        }

        uint256 cost = _purchaseCost(wholeAmount);
        if (fundingCap != 0 && reserveBalance + cost > fundingCap) {
            revert FundingCapReached();
        }

        if (usesNativeAsset) {
            if (msg.value < cost) {
                revert InsufficientPayment();
            }
        } else {
            if (msg.value != 0) {
                revert NativePaymentDisabled();
            }
            baseAsset.safeTransferFrom(msg.sender, address(this), cost);
        }

        _mint(msg.sender, amount);
        reserveBalance += cost;
        participantContribution[msg.sender] += cost;

        if (usesNativeAsset && msg.value > cost) {
            (bool success, ) = msg.sender.call{value: msg.value - cost}("");
            if (!success) {
                revert RefundFailed();
            }
        }

        emit TokensPurchased(msg.sender, amount, cost);
    }

    /// @notice Sell whole tokens back into the bonding curve.
    /// @param amount Amount in 18-decimal token units (must be a whole multiple of 1e18).
    function sellTokens(uint256 amount) external nonReentrant {
        if (amount == 0) {
            revert AmountZero();
        }
        uint256 wholeAmount = _requireWhole(amount);
        if (balanceOf(msg.sender) < amount) {
            revert InsufficientBalance();
        }
        if (paused() && !emergencyExitEnabled) {
            revert EnforcedPause();
        }

        uint256 refund = _saleReturn(wholeAmount);
        if (refund > reserveBalance) {
            revert ReserveInsufficient();
        }

        _burn(msg.sender, amount);
        reserveBalance -= refund;

        if (usesNativeAsset) {
            (bool success, ) = msg.sender.call{value: refund}("");
            if (!success) {
                revert RefundFailed();
            }
        } else {
            baseAsset.safeTransfer(msg.sender, refund);
        }

        emit TokensSold(msg.sender, amount, refund);
    }

    /// @notice Preview the cost to purchase a specific token amount.
    function previewPurchaseCost(uint256 amount) external view returns (uint256) {
        uint256 wholeAmount = _requireWholeView(amount);
        return _purchaseCost(wholeAmount);
    }

    /// @notice Preview the refund from selling a specific token amount.
    function previewSaleReturn(uint256 amount) external view returns (uint256) {
        uint256 wholeAmount = _requireWholeView(amount);
        return _saleReturn(wholeAmount);
    }

    // ---------------------------------------------------------------------
    // Owner governance controls
    // ---------------------------------------------------------------------

    /// @notice Pause buying activity (selling requires emergency exit toggle).
    function pauseMarket() external onlyOwner {
        _pause();
    }

    /// @notice Resume buying activity.
    function unpauseMarket() external onlyOwner {
        _unpause();
    }

    /// @notice Enable or disable participant whitelisting.
    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistModeUpdated(enabled);
    }

    /// @notice Update whitelist entries.
    function setWhitelist(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelist[accounts[i]] = allowed;
            emit WhitelistStatusUpdated(accounts[i], allowed);
        }
    }

    /// @notice Update bonding curve parameters before tokens are sold.
    function setCurveParameters(uint256 basePrice_, uint256 slope_) external onlyOwner {
        if (totalSupply() != 0) {
            revert SaleAlreadyStarted();
        }
        basePrice = basePrice_;
        slope = slope_;
        emit CurveParametersUpdated(basePrice_, slope_);
    }

    /// @notice Configure maximum whole token supply.
    function setMaxSupply(uint256 newMaxSupply) external onlyOwner {
        uint256 currentSupply = _currentSupply();
        if (newMaxSupply != 0 && newMaxSupply < currentSupply) {
            revert MaxSupplyExceeded();
        }
        maxSupply = newMaxSupply;
        emit MaxSupplyUpdated(newMaxSupply);
    }

    /// @notice Configure maximum funding intake in base asset units.
    function setFundingCap(uint256 newCap) external onlyOwner {
        if (newCap != 0 && newCap < reserveBalance) {
            revert CapBelowReserve();
        }
        fundingCap = newCap;
        emit FundingCapUpdated(newCap);
    }

    /// @notice Assign the treasury that receives proceeds when finalizing.
    function setTreasury(address payable newTreasury) external onlyOwner {
        if (newTreasury == address(0)) {
            revert InvalidRecipient();
        }
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Configure optional sale deadline.
    function setSaleDeadline(uint256 deadline) external onlyOwner {
        if (deadline != 0 && deadline <= block.timestamp) {
            revert SaleExpired();
        }
        saleDeadline = deadline;
        emit SaleDeadlineUpdated(deadline);
    }

    /// @notice Update the risk oracle reference.
    function setRiskOracle(address newOracle) external onlyOwner {
        riskOracle = IAlphaMarkRiskOracle(newOracle);
        emit RiskOracleUpdated(newOracle);
    }

    /// @notice Swap the base asset prior to any fundraising.
    function setBaseAsset(address newAsset) external onlyOwner {
        if (totalSupply() != 0) {
            revert SaleAlreadyStarted();
        }
        if (reserveBalance != 0) {
            revert ReserveNotEmpty();
        }
        _setBaseAsset(newAsset);
    }

    /// @notice Override the validation status reported by the oracle.
    function setValidationOverride(bool enabled, bool status) external onlyOwner {
        validationOverrideEnabled = enabled;
        validationOverrideStatus = status;
        emit ValidationOverrideUpdated(enabled, status);
    }

    /// @notice Allow redemptions while paused.
    function setEmergencyExit(bool enabled) external onlyOwner {
        emergencyExitEnabled = enabled;
        emit EmergencyExitUpdated(enabled);
    }

    /// @notice Finalize the launch, transferring reserves to the sovereign recipient.
    /// @param sovereignRecipient Destination that receives the reserve (treasury fallback if zero).
    /// @param metadata Arbitrary bytes forwarded to the sovereign vault acknowledgement call.
    function finalizeLaunch(address payable sovereignRecipient, bytes calldata metadata)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        if (finalized) {
            revert SaleClosed();
        }
        if (aborted) {
            revert SaleClosed();
        }
        if (!_isValidated()) {
            revert ValidationRequired();
        }

        address payable recipient = sovereignRecipient;
        if (recipient == address(0)) {
            recipient = treasury;
        }
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        finalized = true;
        _pause();

        uint256 amount = reserveBalance;
        reserveBalance = 0;

        if (usesNativeAsset) {
            (bool success, ) = recipient.call{value: amount}("");
            if (!success) {
                revert RefundFailed();
            }
        } else {
            baseAsset.safeTransfer(recipient, amount);
        }

        _attemptSovereignAcknowledgement(recipient, amount, metadata);

        emit LaunchFinalized(recipient, amount, metadata);
    }

    /// @notice Abort the launch entirely.
    function abortLaunch() external onlyOwner {
        if (finalized) {
            revert SaleClosed();
        }
        if (aborted) {
            revert SaleClosed();
        }
        aborted = true;
        emergencyExitEnabled = true;
        if (!paused()) {
            _pause();
        }
        emit LaunchAborted();
        emit EmergencyExitUpdated(true);
    }

    /// @notice Withdraw residual funds once the launch is closed.
    function withdrawResidual(address payable to) external onlyOwner {
        if (!finalized && !aborted) {
            revert NotClosed();
        }
        if (to == address(0)) {
            revert InvalidRecipient();
        }
        uint256 balance = _assetBalance();
        uint256 amount = balance - reserveBalance;
        if (amount == 0) {
            return;
        }
        if (usesNativeAsset) {
            (bool success, ) = to.call{value: amount}("");
            if (!success) {
                revert RefundFailed();
            }
        } else {
            baseAsset.safeTransfer(to, amount);
        }
        emit ResidualWithdrawn(to, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Report whether the launch is validated.
    function isValidated() external view returns (bool) {
        return _isValidated();
    }

    /// @notice Snapshot of key owner governance state.
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

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _currentSupply() internal view returns (uint256) {
        return totalSupply() / WHOLE_TOKEN;
    }

    function _requireWhole(uint256 amount) internal pure returns (uint256) {
        if (amount % WHOLE_TOKEN != 0) {
            revert WholeTokensOnly();
        }
        return amount / WHOLE_TOKEN;
    }

    function _requireWholeView(uint256 amount) internal pure returns (uint256) {
        if (amount % WHOLE_TOKEN != 0) {
            revert WholeTokensOnly();
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
        if (amount > supply) {
            revert AmountExceedsSupply();
        }
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

    function _enforceSaleWindow() internal view {
        if (saleDeadline != 0 && block.timestamp > saleDeadline) {
            revert SaleExpired();
        }
    }

    function _enforceWhitelist(address account) internal view {
        if (whitelistEnabled && !whitelist[account]) {
            revert NotWhitelisted(account);
        }
    }

    function _isValidated() internal view returns (bool) {
        if (validationOverrideEnabled) {
            return validationOverrideStatus;
        }
        if (address(riskOracle) == address(0)) {
            return false;
        }
        try riskOracle.seedValidated() returns (bool result) {
            return result;
        } catch {
            return false;
        }
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

        try IAlphaSovereignVault(recipient).notifyLaunch(amount, usesNativeAsset, metadata) returns (bool acknowledged) {
            if (!acknowledged) {
                revert LaunchAcknowledgementRejected(recipient);
            }
        } catch {
            revert LaunchAcknowledgementFailed(recipient);
        }
    }

    receive() external payable {
        revert NativePaymentDisabled();
    }
}
