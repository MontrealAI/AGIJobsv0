// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRiskOracle} from "./IRiskOracle.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title AlphaAgiMark
 * @notice Bonding-curve powered foresight market backing a Nova-Seed.
 */
contract AlphaAgiMark is ERC20, Ownable, Pausable, ReentrancyGuard {
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event TokensSold(address indexed seller, uint256 amount, uint256 payout);
    event LaunchFinalised(address indexed sovereignVault, uint256 totalRaised);
    event LaunchAborted(address indexed caller);
    event WhitelistStatusChanged(bool enabled);
    event WhitelistUpdated(address indexed account, bool allowed);
    event OracleUpdated(address indexed oracle);
    event PricingUpdated(uint256 basePrice, uint256 slope);

    error LaunchFinalisedAlready();
    error LaunchAbortedAlready();
    error ValidationRequired();
    error NotWhitelisted();
    error AmountZero();
    error SupplyTooLow();
    error InvalidOracle();
    error PricingImmutable();

    IRiskOracle public oracle;
    uint256 public basePrice;
    uint256 public slope;
    uint256 public reserveBalance;
    bool public launchFinalised;
    bool public launchAborted;
    bool public whitelistEnabled;
    bool public pricingLocked;

    mapping(address => bool) public whitelist;

    constructor(
        address owner_,
        address oracle_,
        uint256 basePrice_,
        uint256 slope_
    ) ERC20("alpha-AGI Nova-Seed Share", "NOVA-SHARE") Ownable(owner_) {
        require(owner_ != address(0), "owner zero");
        _setOracle(oracle_);
        _updatePricing(basePrice_, slope_);
    }

    receive() external payable {
        revert("direct ETH not allowed");
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function buyShares(uint256 amount) external payable whenNotPaused nonReentrant {
        if (launchFinalised) revert LaunchFinalisedAlready();
        if (launchAborted) revert LaunchAbortedAlready();
        if (amount == 0) revert AmountZero();
        if (whitelistEnabled && !whitelist[msg.sender]) revert NotWhitelisted();

        uint256 cost = calculatePurchaseCost(amount);
        require(msg.value >= cost, "insufficient payment");

        _mint(msg.sender, amount);
        reserveBalance += cost;

        emit TokensPurchased(msg.sender, amount, cost);

        if (msg.value > cost) {
            (bool success, ) = msg.sender.call{value: msg.value - cost}("");
            require(success, "refund failed");
        }
    }

    function sellShares(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert AmountZero();
        uint256 supply = totalSupply();
        if (amount > supply) revert SupplyTooLow();

        uint256 payout = calculateSaleReturn(amount);
        _burn(msg.sender, amount);
        reserveBalance -= payout;

        emit TokensSold(msg.sender, amount, payout);

        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "payout failed");
    }

    function calculatePurchaseCost(uint256 amount) public view returns (uint256) {
        if (amount == 0) revert AmountZero();
        uint256 start = totalSupply();
        uint256 end = start + amount;
        return _reserveAt(end) - _reserveAt(start);
    }

    function calculateSaleReturn(uint256 amount) public view returns (uint256) {
        if (amount == 0) revert AmountZero();
        uint256 supply = totalSupply();
        if (amount > supply) revert SupplyTooLow();
        uint256 start = supply - amount;
        return _reserveAt(supply) - _reserveAt(start);
    }

    function finaliseLaunch(address payable sovereignVault) external onlyOwner whenNotPaused {
        if (launchFinalised) revert LaunchFinalisedAlready();
        if (launchAborted) revert LaunchAbortedAlready();
        if (address(oracle) != address(0) && !oracle.seedValidated()) revert ValidationRequired();
        require(sovereignVault != address(0), "vault zero");
        launchFinalised = true;
        pricingLocked = true;
        uint256 amount = reserveBalance;
        reserveBalance = 0;
        (bool success, ) = sovereignVault.call{value: amount}("");
        require(success, "transfer failed");
        emit LaunchFinalised(sovereignVault, amount);
    }

    function abortLaunch() external onlyOwner {
        if (launchFinalised) revert LaunchFinalisedAlready();
        if (launchAborted) revert LaunchAbortedAlready();
        launchAborted = true;
        emit LaunchAborted(msg.sender);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setWhitelistStatus(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistStatusChanged(enabled);
    }

    function setWhitelist(address account, bool allowed) external onlyOwner {
        whitelist[account] = allowed;
        emit WhitelistUpdated(account, allowed);
    }

    function updatePricing(uint256 newBasePrice, uint256 newSlope) external onlyOwner {
        if (pricingLocked) revert PricingImmutable();
        _updatePricing(newBasePrice, newSlope);
    }

    function lockPricing() external onlyOwner {
        pricingLocked = true;
    }

    function setOracle(address oracle_) external onlyOwner {
        _setOracle(oracle_);
    }

    function _reserveAt(uint256 supply) internal view returns (uint256) {
        if (supply == 0) {
            return 0;
        }
        uint256 baseTerm = Math.mulDiv(basePrice, supply, 1e18);
        uint256 slopeMulSupply = Math.mulDiv(slope, supply, 1e18);
        uint256 quadraticTerm = Math.mulDiv(slopeMulSupply, supply, 2e18);
        return baseTerm + quadraticTerm;
    }

    function _updatePricing(uint256 basePrice_, uint256 slope_) internal {
        require(basePrice_ > 0, "base price zero");
        require(slope_ > 0, "slope zero");
        basePrice = basePrice_;
        slope = slope_;
        emit PricingUpdated(basePrice_, slope_);
    }

    function _setOracle(address oracle_) internal {
        if (oracle_ == address(0)) revert InvalidOracle();
        oracle = IRiskOracle(oracle_);
        emit OracleUpdated(oracle_);
    }
}
