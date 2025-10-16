// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title α-AGI MARK bonding-curve market for Nova-Seeds
/// @notice Demonstrates a validator-supervised bonding curve issuance with owner governed controls.
contract AlphaAgiMark is ERC20, Ownable, Pausable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Scalar used to convert whole shares into ERC20 units.
    uint256 public constant SHARE_SCALE = 1e18;

    /// @notice Enum describing a validator's latest risk vote.
    enum RiskVote {
        None,
        Approve,
        Reject
    }

    /// ---------------------------------------------------------------------
    /// Errors
    /// ---------------------------------------------------------------------

    error LaunchInactive();
    error LaunchAlreadyFinalized();
    error LaunchNotValidated();
    error InvalidShareAmount();
    error AccountNotWhitelisted(address account);
    error ApprovalThresholdInvalid();
    error ValidatorAlreadyRegistered(address validator);
    error ValidatorNotRegistered(address validator);
    error SaleExceedsSupply();
    error ReserveInsufficient();
    error SovereignReceiverZero();
    error SeedRegistryInvalid();

    /// ---------------------------------------------------------------------
    /// Events
    /// ---------------------------------------------------------------------

    event TokensPurchased(
        address indexed buyer,
        uint256 shareCount,
        uint256 cost,
        uint256 nextPrice
    );
    event TokensSold(
        address indexed seller,
        uint256 shareCount,
        uint256 payout,
        uint256 nextPrice
    );
    event ValidatorUpdated(address indexed validator, bool active);
    event RiskVoteCast(
        address indexed validator,
        RiskVote vote,
        uint256 approvals,
        uint256 rejections
    );
    event SeedGreenLit(uint256 approvals, uint256 threshold);
    event ValidationStatusOverridden(bool status);
    event LaunchFinalized(address indexed sovereignReceiver, uint256 amount);
    event LaunchAborted();
    event BaseCurveUpdated(uint256 basePrice, uint256 slope);
    event MinLaunchReserveUpdated(uint256 minimumReserve);
    event ApprovalThresholdUpdated(uint256 newThreshold);
    event WhitelistModeUpdated(bool enabled);
    event WhitelistUpdated(address indexed account, bool allowed);

    /// ---------------------------------------------------------------------
    /// State
    /// ---------------------------------------------------------------------

    address public immutable seedNft;
    uint256 public immutable seedTokenId;

    uint256 public basePrice;
    uint256 public slope;
    uint256 public minLaunchReserve;

    uint256 private _issuedShares;
    uint256 public reserveBalance;

    bool public whitelistEnabled;
    mapping(address => bool) private _whitelist;

    bool public launched;
    bool public aborted;
    bool public seedValidated;
    address public sovereignReceiver;

    EnumerableSet.AddressSet private _validators;
    mapping(address => RiskVote) private _votes;
    uint256 public approvalThreshold;
    uint256 public approvalCount;
    uint256 public rejectionCount;

    /// ---------------------------------------------------------------------
    /// Constructor
    /// ---------------------------------------------------------------------

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address seedNft_,
        uint256 seedTokenId_,
        uint256 basePrice_,
        uint256 slope_,
        uint256 minLaunchReserve_,
        uint256 approvalThreshold_,
        address[] memory initialValidators
    ) ERC20(name_, symbol_) Ownable(initialOwner) {
        if (seedNft_ == address(0)) revert SeedRegistryInvalid();
        if (basePrice_ == 0 || slope_ == 0) {
            revert InvalidShareAmount();
        }
        if (approvalThreshold_ == 0) {
            revert ApprovalThresholdInvalid();
        }

        seedNft = seedNft_;
        seedTokenId = seedTokenId_;
        basePrice = basePrice_;
        slope = slope_;
        minLaunchReserve = minLaunchReserve_;

        for (uint256 i = 0; i < initialValidators.length; i++) {
            address validator = initialValidators[i];
            if (validator == address(0)) {
                revert ValidatorNotRegistered(address(0));
            }
            if (!_validators.add(validator)) {
                revert ValidatorAlreadyRegistered(validator);
            }
            emit ValidatorUpdated(validator, true);
        }

        if (approvalThreshold_ > _validators.length()) {
            revert ApprovalThresholdInvalid();
        }
        approvalThreshold = approvalThreshold_;
    }

    /// ---------------------------------------------------------------------
    /// Modifiers
    /// ---------------------------------------------------------------------

    modifier onlyActive() {
        if (launched || aborted) {
            revert LaunchInactive();
        }
        _;
    }

    modifier onlyValidator() {
        if (!_validators.contains(_msgSender())) {
            revert ValidatorNotRegistered(_msgSender());
        }
        _;
    }

    /// ---------------------------------------------------------------------
    /// View helpers
    /// ---------------------------------------------------------------------

    function totalShares() external view returns (uint256) {
        return _issuedShares;
    }

    function shareBalanceOf(address account) external view returns (uint256) {
        return balanceOf(account) / SHARE_SCALE;
    }

    function currentPrice() public view returns (uint256) {
        return basePrice + (slope * _issuedShares);
    }

    function quoteBuyShares(uint256 shareCount) public view returns (uint256) {
        if (shareCount == 0) revert InvalidShareAmount();
        return _purchaseQuote(_issuedShares, shareCount);
    }

    function quoteSellShares(uint256 shareCount) public view returns (uint256) {
        if (shareCount == 0) revert InvalidShareAmount();
        if (shareCount > _issuedShares) revert SaleExceedsSupply();
        return _saleQuote(_issuedShares, shareCount);
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _whitelist[account];
    }

    function validators()
        external
        view
        returns (address[] memory addresses, RiskVote[] memory votes)
    {
        address[] memory values = _validators.values();
        votes = new RiskVote[](values.length);
        for (uint256 i = 0; i < values.length; i++) {
            votes[i] = _votes[values[i]];
        }
        return (values, votes);
    }

    /// ---------------------------------------------------------------------
    /// Lifecycle management
    /// ---------------------------------------------------------------------

    function buyShares(uint256 shareCount)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyActive
        returns (uint256 cost)
    {
        if (shareCount == 0) revert InvalidShareAmount();
        if (whitelistEnabled && !_whitelist[_msgSender()]) {
            revert AccountNotWhitelisted(_msgSender());
        }

        cost = _purchaseQuote(_issuedShares, shareCount);
        if (msg.value < cost) {
            revert ReserveInsufficient();
        }

        reserveBalance += cost;
        _mintShares(_msgSender(), shareCount);

        if (msg.value > cost) {
            (bool refundSuccess, ) = _msgSender().call{value: msg.value - cost}("");
            if (!refundSuccess) revert ReserveInsufficient();
        }

        emit TokensPurchased(_msgSender(), shareCount, cost, currentPrice());
    }

    function sellShares(uint256 shareCount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 proceeds)
    {
        if (shareCount == 0) revert InvalidShareAmount();
        if (launched) revert LaunchAlreadyFinalized();
        if (shareCount > _issuedShares) revert SaleExceedsSupply();
        uint256 amount = shareCount * SHARE_SCALE;
        if (balanceOf(_msgSender()) < amount) revert InvalidShareAmount();
        proceeds = _saleQuote(_issuedShares, shareCount);
        if (proceeds > reserveBalance) revert ReserveInsufficient();

        reserveBalance -= proceeds;
        _burnShares(_msgSender(), shareCount);

        (bool success, ) = _msgSender().call{value: proceeds}("");
        if (!success) revert ReserveInsufficient();

        emit TokensSold(_msgSender(), shareCount, proceeds, currentPrice());
    }

    function finalizeLaunch(address sovereignReceiver_)
        external
        onlyOwner
        onlyActive
    {
        if (!seedValidated) revert LaunchNotValidated();
        if (sovereignReceiver_ == address(0)) {
            revert SovereignReceiverZero();
        }
        if (reserveBalance < minLaunchReserve) {
            revert ReserveInsufficient();
        }

        launched = true;
        sovereignReceiver = sovereignReceiver_;
        uint256 amount = reserveBalance;
        reserveBalance = 0;

        (bool success, ) = payable(sovereignReceiver_).call{value: amount}("");
        if (!success) revert ReserveInsufficient();

        if (!paused()) {
            _pause();
        }

        emit LaunchFinalized(sovereignReceiver_, amount);
    }

    function abortLaunch() external onlyOwner onlyActive {
        aborted = true;
        emit LaunchAborted();
    }

    /// ---------------------------------------------------------------------
    /// Governance configuration
    /// ---------------------------------------------------------------------

    function pause() external onlyOwner {
        if (!paused()) {
            _pause();
        }
    }

    function unpause() external onlyOwner {
        if (launched || aborted) {
            revert LaunchInactive();
        }
        if (paused()) {
            _unpause();
        }
    }

    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistModeUpdated(enabled);
    }

    function setWhitelist(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            _whitelist[account] = allowed;
            emit WhitelistUpdated(account, allowed);
        }
    }

    function updatePricing(uint256 basePrice_, uint256 slope_) external onlyOwner {
        if (basePrice_ == 0 || slope_ == 0) revert InvalidShareAmount();
        if (!paused()) revert LaunchInactive();
        basePrice = basePrice_;
        slope = slope_;
        emit BaseCurveUpdated(basePrice_, slope_);
    }

    function setMinLaunchReserve(uint256 newMin) external onlyOwner {
        minLaunchReserve = newMin;
        emit MinLaunchReserveUpdated(newMin);
    }

    function setApprovalThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold == 0 || newThreshold > _validators.length()) {
            revert ApprovalThresholdInvalid();
        }
        approvalThreshold = newThreshold;
        emit ApprovalThresholdUpdated(newThreshold);
        _refreshValidationStatus();
    }

    function updateValidator(address validator, bool active) external onlyOwner {
        if (active) {
            if (!_validators.add(validator)) {
                revert ValidatorAlreadyRegistered(validator);
            }
        } else {
            if (!_validators.remove(validator)) {
                revert ValidatorNotRegistered(validator);
            }
            RiskVote previous = _votes[validator];
            if (previous == RiskVote.Approve && approvalCount > 0) {
                approvalCount -= 1;
            } else if (previous == RiskVote.Reject && rejectionCount > 0) {
                rejectionCount -= 1;
            }
            _votes[validator] = RiskVote.None;
        }
        emit ValidatorUpdated(validator, active);
        if (approvalThreshold > _validators.length()) {
            approvalThreshold = _validators.length();
            emit ApprovalThresholdUpdated(approvalThreshold);
        }
        _refreshValidationStatus();
    }

    function castRiskVote(bool approve) external onlyValidator returns (RiskVote) {
        if (launched || aborted) {
            revert LaunchInactive();
        }
        RiskVote previous = _votes[_msgSender()];
        if (previous == RiskVote.Approve) {
            if (approvalCount > 0) {
                approvalCount -= 1;
            }
        } else if (previous == RiskVote.Reject) {
            if (rejectionCount > 0) {
                rejectionCount -= 1;
            }
        }

        RiskVote newVote = approve ? RiskVote.Approve : RiskVote.Reject;
        _votes[_msgSender()] = newVote;
        if (approve) {
            approvalCount += 1;
        } else {
            rejectionCount += 1;
        }

        emit RiskVoteCast(_msgSender(), newVote, approvalCount, rejectionCount);
        _refreshValidationStatus();
        return newVote;
    }

    function clearRiskVote() external onlyValidator {
        RiskVote previous = _votes[_msgSender()];
        if (previous == RiskVote.Approve) {
            if (approvalCount > 0) approvalCount -= 1;
        } else if (previous == RiskVote.Reject) {
            if (rejectionCount > 0) rejectionCount -= 1;
        }
        _votes[_msgSender()] = RiskVote.None;
        emit RiskVoteCast(_msgSender(), RiskVote.None, approvalCount, rejectionCount);
        _refreshValidationStatus();
    }

    function forceSetSeedValidationStatus(bool status) external onlyOwner {
        seedValidated = status;
        emit ValidationStatusOverridden(status);
    }

    /// ---------------------------------------------------------------------
    /// Internal helpers
    /// ---------------------------------------------------------------------

    function _purchaseQuote(uint256 currentShares, uint256 shareCount)
        internal
        view
        returns (uint256)
    {
        uint256 startReserve = _reserveAt(currentShares);
        uint256 endReserve = _reserveAt(currentShares + shareCount);
        return endReserve - startReserve;
    }

    function _saleQuote(uint256 currentShares, uint256 shareCount)
        internal
        view
        returns (uint256)
    {
        uint256 startReserve = _reserveAt(currentShares);
        uint256 endReserve = _reserveAt(currentShares - shareCount);
        return startReserve - endReserve;
    }

    function _reserveAt(uint256 shareCount) internal view returns (uint256) {
        if (shareCount == 0) {
            return 0;
        }
        uint256 linearComponent = basePrice * shareCount;
        uint256 sumIndices = Math.mulDiv(shareCount, shareCount - 1, 2);
        uint256 curveComponent = slope * sumIndices;
        return linearComponent + curveComponent;
    }

    function _mintShares(address to, uint256 shareCount) internal {
        if (shareCount > type(uint256).max / SHARE_SCALE) revert InvalidShareAmount();
        uint256 amount = shareCount * SHARE_SCALE;
        _issuedShares += shareCount;
        _mint(to, amount);
    }

    function _burnShares(address from, uint256 shareCount) internal {
        if (shareCount > type(uint256).max / SHARE_SCALE) revert InvalidShareAmount();
        uint256 amount = shareCount * SHARE_SCALE;
        _issuedShares -= shareCount;
        _burn(from, amount);
    }

    function _refreshValidationStatus() internal {
        bool newStatus = approvalCount >= approvalThreshold && approvalThreshold != 0;
        if (newStatus && !seedValidated) {
            seedValidated = true;
            emit SeedGreenLit(approvalCount, approvalThreshold);
        }
        if (!newStatus && seedValidated && approvalThreshold != 0) {
            seedValidated = false;
        }
    }

    /// ---------------------------------------------------------------------
    /// Receive fallback guard
    /// ---------------------------------------------------------------------

    receive() external payable {
        revert LaunchInactive();
    }

    fallback() external payable {
        revert LaunchInactive();
    }
}
