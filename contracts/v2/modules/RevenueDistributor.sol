// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {AGIALPHA} from "../Constants.sol";
import {TokenAcknowledgement} from "../utils/TokenAcknowledgement.sol";

/// @title RevenueDistributor
/// @notice Splits incoming job fees among active operators based on stake.
contract RevenueDistributor is Ownable {
    using SafeERC20 for IERC20;
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IStakeManager public stakeManager;
    address public treasury;
    /// @notice Token used for revenue distribution (must have 18 decimals).
    /// @dev The constructor enforces $AGIALPHA's 18-decimal standard.
    IERC20 public immutable token = IERC20(AGIALPHA);

    address[] public operators;
    mapping(address => bool) public isOperator;

    event OperatorRegistered(address indexed operator);
    event OperatorDeregistered(address indexed operator);
    event TreasuryUpdated(address indexed treasury);
    event RevenueDistributed(address indexed from, uint256 amount);
    event StakeManagerUpdated(address indexed stakeManager);

    constructor(IStakeManager _stakeManager) Ownable(msg.sender) {
        // $AGIALPHA is assumed to use 18 decimals across the protocol.
        // Revert if the deployed token diverges to avoid rounding errors.
        require(
            IERC20Metadata(address(token)).decimals() == 18,
            "decimals"
        );
        stakeManager = _stakeManager;
        emit StakeManagerUpdated(address(_stakeManager));
        TokenAcknowledgement.acknowledge(address(token), address(this));
    }

    /// @notice Register the caller as an operator.
    function register() external {
        require(!isOperator[msg.sender], "registered");
        uint256 stake = stakeManager.stakeOf(msg.sender, IStakeManager.Role.Platform);
        require(stake > 0, "stake");
        isOperator[msg.sender] = true;
        operators.push(msg.sender);
        emit OperatorRegistered(msg.sender);
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Deregister an operator. Only owner may remove.
    function deregister(address operator) external onlyOwner {
        if (!isOperator[operator]) return;
        isOperator[operator] = false;
        uint256 len = operators.length;
        for (uint256 i; i < len; i++) {
            if (operators[i] == operator) {
                operators[i] = operators[len - 1];
                operators.pop();
                break;
            }
        }
        emit OperatorDeregistered(operator);
    }

    /// @notice Update treasury address for rounding dust.
    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /// @notice Update StakeManager contract used for stake lookups.
    /// @param manager new StakeManager address
    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    /// @notice Distribute tokens from the caller to active operators by stake.
    /// @param amount Amount of tokens to distribute.
    function distribute(uint256 amount) external {
        require(amount > 0, "amount");
        token.safeTransferFrom(msg.sender, address(this), amount);

        uint256 len = operators.length;
        uint256[] memory stakes = new uint256[](len);
        uint256 totalStake;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (op == owner() || !isOperator[op]) continue;
            uint256 stake = stakeManager.stakeOf(op, IStakeManager.Role.Platform);
            if (stake == 0) continue;
            stakes[i] = stake;
            totalStake += stake;
        }
        require(totalStake > 0, "total stake");

        uint256 distributed;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (op == owner()) continue;
            uint256 stake = stakes[i];
            if (stake == 0) continue;
            uint256 share = (amount * stake) / totalStake;
            distributed += share;
            token.safeTransfer(op, share);
        }
        uint256 dust = amount - distributed;
        if (dust > 0 && treasury != address(0)) {
            token.safeTransfer(treasury, dust);
        }
        emit RevenueDistributed(msg.sender, amount);
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("RevenueDistributor: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("RevenueDistributor: no ether");
    }
}

