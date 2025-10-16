// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {NovaSeedNFT} from "./NovaSeedNFT.sol";

/**
 * @title AlphaAgiMark
 * @notice Algorithmic market-maker, bonding-curve issuer, and validator-gated launch controller for α-AGI Nova-Seeds.
 * @dev The contract mints ERC-20 Seed Shares along a deterministic linear bonding curve backed by an ETH reserve. It exposes
 *      comprehensive owner controls so the platform operator can retune parameters, manage compliance, and pause execution.
 */
contract AlphaAgiMark is ERC20, Ownable, Pausable, ReentrancyGuard {
    struct CurveConfig {
        uint256 basePrice; // starting price per token in wei
        uint256 slope; // price increase per whole token (scaled to 1e18 token units)
        uint256 maxSupply; // hard cap on shares (0 == unlimited)
    }

    event CurveUpdated(uint256 basePrice, uint256 slope, uint256 maxSupply);
    event SharesPurchased(address indexed buyer, uint256 amount, uint256 cost, uint256 newSupply);
    event SharesRedeemed(address indexed seller, uint256 amount, uint256 payout, uint256 newSupply);
    event ValidatorConfigured(address indexed validator, bool enabled);
    event ValidatorThresholdUpdated(uint256 threshold);
    event ValidatorApproved(address indexed validator, uint256 approvals, uint256 threshold);
    event ValidatorRevoked(address indexed validator, uint256 approvals, uint256 threshold);
    event ValidatorOverride(address indexed executor, string justification);
    event SeedValidated(uint256 approvals, uint256 threshold, bool ownerOverride);
    event LaunchFinalised(address indexed sovereignVault, uint256 reserveTransferred);
    event LaunchAborted();
    event WhitelistStatusChanged(bool enabled);
    event WhitelistUpdated(address indexed account, bool allowed);
    event MaxPurchaseUpdated(uint256 newMaxAmount);

    uint256 private constant SCALE = 1e18;

    NovaSeedNFT public immutable seedCollection;
    uint256 public immutable seedTokenId;

    CurveConfig public curve;

    mapping(address => bool) public validators;
    mapping(address => bool) public validatorApprovals;
    uint256 public validatorCount;
    uint256 public validatorThreshold;
    uint256 public validatorApprovalCount;

    bool public seedValidated;
    bool public launchFinalised;
    bool public launchAborted;

    bool public whitelistEnabled;
    mapping(address => bool) public whitelist;

    uint256 public reserveBalance;
    uint256 public maxPurchaseAmount; // 0 means unlimited

    address public sovereignVault;
    string public seedManifesto;

    modifier onlyActiveSeed() {
        require(!launchFinalised, "Launch finalised");
        require(!launchAborted, "Launch aborted");
        _;
    }

    modifier onlyValidator() {
        require(validators[msg.sender], "Not validator");
        _;
    }

    modifier checkWhitelist(address account) {
        if (whitelistEnabled) {
            require(whitelist[account], "Not whitelisted");
        }
        _;
    }

    constructor(
        address owner_,
        NovaSeedNFT seed_,
        uint256 seedTokenId_,
        CurveConfig memory curveConfig,
        uint256 threshold,
        address[] memory initialValidators,
        string memory manifesto
    ) ERC20("Alpha AGI MARK Seed Share", "AMARK") Ownable(owner_) {
        require(address(seed_) != address(0), "Seed required");
        require(threshold > 0, "Threshold required");
        seedCollection = seed_;
        seedTokenId = seedTokenId_;
        // Ensure the referenced seed exists (will revert if not minted yet)
        require(seedCollection.ownerOf(seedTokenId) != address(0), "Seed must exist");

        curve = curveConfig;
        validatorThreshold = threshold;
        seedManifesto = manifesto;

        for (uint256 i = 0; i < initialValidators.length; i++) {
            address validator = initialValidators[i];
            if (validator == address(0) || validators[validator]) {
                continue;
            }
            validators[validator] = true;
            validatorCount += 1;
            emit ValidatorConfigured(validator, true);
        }

        require(validatorCount >= threshold, "Insufficient validators");
        emit CurveUpdated(curve.basePrice, curve.slope, curve.maxSupply);
        emit ValidatorThresholdUpdated(threshold);
    }

    // ============ Bonding Curve Logic ============

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function currentPrice() external view returns (uint256) {
        return curve.basePrice + Math.mulDiv(curve.slope, totalSupply(), SCALE);
    }

    function calculatePurchaseCost(uint256 amount) public view returns (uint256) {
        require(amount > 0, "Amount zero");
        uint256 startSupply = totalSupply();
        uint256 endSupply = startSupply + amount;
        if (curve.maxSupply != 0) {
            require(endSupply <= curve.maxSupply, "Exceeds supply");
        }
        return _reserveAt(endSupply) - _reserveAt(startSupply);
    }

    function calculateSaleReturn(uint256 amount) public view returns (uint256) {
        require(amount > 0, "Amount zero");
        uint256 supply = totalSupply();
        require(amount <= supply, "Too many shares");
        return _reserveAt(supply) - _reserveAt(supply - amount);
    }

    function buyShares(uint256 amount)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyActiveSeed
        checkWhitelist(msg.sender)
    {
        if (maxPurchaseAmount != 0) {
            require(amount <= maxPurchaseAmount, "Purchase limit");
        }
        uint256 cost = calculatePurchaseCost(amount);
        require(msg.value >= cost, "Insufficient value");

        reserveBalance += cost;
        _mint(msg.sender, amount);

        if (msg.value > cost) {
            (bool ok, ) = msg.sender.call{value: msg.value - cost}("");
            require(ok, "Refund failed");
        }

        emit SharesPurchased(msg.sender, amount, cost, totalSupply());
    }

    function sellShares(uint256 amount) external nonReentrant checkWhitelist(msg.sender) {
        require(!launchFinalised, "Launch finalised");
        if (paused()) {
            require(launchAborted, "Trading paused");
        }
        uint256 payout = calculateSaleReturn(amount);
        require(payout <= reserveBalance, "Insufficient reserve");

        _burn(msg.sender, amount);
        reserveBalance -= payout;

        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "Payout failed");

        emit SharesRedeemed(msg.sender, amount, payout, totalSupply());
    }

    function reserveCoverage() external view returns (uint256) {
        return reserveBalance;
    }

    // ============ Validator Governance ============

    function setValidator(address validator, bool enabled) external onlyOwner {
        require(validator != address(0), "Invalid validator");
        bool current = validators[validator];
        if (current == enabled) {
            return;
        }
        validators[validator] = enabled;
        if (enabled) {
            validatorCount += 1;
        } else {
            validatorCount -= 1;
            if (validatorApprovals[validator]) {
                validatorApprovals[validator] = false;
                if (validatorApprovalCount > 0) {
                    validatorApprovalCount -= 1;
                    emit ValidatorRevoked(validator, validatorApprovalCount, validatorThreshold);
                }
            }
        }
        emit ValidatorConfigured(validator, enabled);
        if (validatorCount < validatorThreshold) {
            validatorThreshold = validatorCount;
            emit ValidatorThresholdUpdated(validatorThreshold);
        }
    }

    function setValidatorThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "Threshold zero");
        require(newThreshold <= validatorCount, "Threshold > validators");
        validatorThreshold = newThreshold;
        emit ValidatorThresholdUpdated(newThreshold);
        if (!seedValidated && validatorApprovalCount >= newThreshold) {
            seedValidated = true;
            emit SeedValidated(validatorApprovalCount, validatorThreshold, false);
        }
    }

    function approveSeed() external onlyValidator {
        require(!validatorApprovals[msg.sender], "Already approved");
        validatorApprovals[msg.sender] = true;
        validatorApprovalCount += 1;
        emit ValidatorApproved(msg.sender, validatorApprovalCount, validatorThreshold);
        if (!seedValidated && validatorApprovalCount >= validatorThreshold) {
            seedValidated = true;
            emit SeedValidated(validatorApprovalCount, validatorThreshold, false);
        }
    }

    function revokeApproval() external onlyValidator {
        require(validatorApprovals[msg.sender], "Not approved");
        validatorApprovals[msg.sender] = false;
        validatorApprovalCount -= 1;
        emit ValidatorRevoked(msg.sender, validatorApprovalCount, validatorThreshold);
        if (seedValidated && validatorApprovalCount < validatorThreshold) {
            seedValidated = false;
        }
    }

    function ownerValidateSeed(string calldata justification) external onlyOwner {
        seedValidated = true;
        emit ValidatorOverride(msg.sender, justification);
        emit SeedValidated(validatorApprovalCount, validatorThreshold, true);
    }

    // ============ Owner Controls ============

    function setCurveParameters(uint256 basePrice, uint256 slope, uint256 maxSupply_) external onlyOwner {
        require(totalSupply() == 0, "Already issued");
        curve = CurveConfig({basePrice: basePrice, slope: slope, maxSupply: maxSupply_});
        emit CurveUpdated(basePrice, slope, maxSupply_);
    }

    function setMaxPurchaseAmount(uint256 newMax) external onlyOwner {
        maxPurchaseAmount = newMax;
        emit MaxPurchaseUpdated(newMax);
    }

    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistStatusChanged(enabled);
    }

    function setWhitelist(address account, bool allowed) external onlyOwner {
        whitelist[account] = allowed;
        emit WhitelistUpdated(account, allowed);
    }

    function setWhitelistBatch(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelist[accounts[i]] = allowed;
            emit WhitelistUpdated(accounts[i], allowed);
        }
    }

    function updateManifesto(string calldata manifesto) external onlyOwner {
        seedManifesto = manifesto;
    }

    function pauseMarket() external onlyOwner {
        _pause();
    }

    function unpauseMarket() external onlyOwner {
        _unpause();
    }

    function abortLaunch() external onlyOwner onlyActiveSeed {
        launchAborted = true;
        _pause();
        emit LaunchAborted();
    }

    function finaliseLaunch(address sovereignVault_) external onlyOwner onlyActiveSeed {
        require(seedValidated, "Seed not validated");
        require(sovereignVault_ != address(0), "Vault required");
        launchFinalised = true;
        sovereignVault = sovereignVault_;
        _pause();
        uint256 amount = reserveBalance;
        reserveBalance = 0;
        (bool ok, ) = sovereignVault_.call{value: amount}("");
        require(ok, "Transfer failed");
        emit LaunchFinalised(sovereignVault_, amount);
    }

    function recoverEther(address payable recipient, uint256 amount) external onlyOwner {
        require(launchFinalised || launchAborted, "Only post lifecycle");
        require(recipient != address(0), "Recipient");
        require(amount <= address(this).balance, "Exceeds balance");
        (bool ok, ) = recipient.call{value: amount}("");
        require(ok, "Recover failed");
    }

    // ============ Internal Helpers ============

    function _reserveAt(uint256 supply) internal view returns (uint256) {
        uint256 linear = Math.mulDiv(curve.basePrice, supply, SCALE);
        uint256 supplySquaredScaled = Math.mulDiv(supply, supply, SCALE * SCALE);
        uint256 quadratic = Math.mulDiv(curve.slope, supplySquaredScaled, 2);
        return linear + quadratic;
    }
}
