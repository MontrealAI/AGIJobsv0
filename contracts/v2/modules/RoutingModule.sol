// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";

/// @title RoutingModule
/// @notice Selects platform operators for jobs weighted by stake and optional reputation.
contract RoutingModule is Ownable {
    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    bool public reputationEnabled;

    address[] public operators;
    mapping(address => bool) public isOperator;

    event OperatorRegistered(address indexed operator);
    event OperatorDeregistered(address indexed operator);
    event OperatorSelected(bytes32 indexed jobId, address indexed operator);
    event ReputationEngineUpdated(address indexed engine);
    event ReputationEnabled(bool enabled);

    constructor(
        IStakeManager _stakeManager,
        IReputationEngine _reputationEngine,
        address owner
    ) Ownable(owner) {
        stakeManager = _stakeManager;
        reputationEngine = _reputationEngine;
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

    /// @notice Update the reputation engine.
    function setReputationEngine(IReputationEngine engine) external onlyOwner {
        reputationEngine = engine;
        emit ReputationEngineUpdated(address(engine));
    }

    /// @notice Enable or disable reputation weighting.
    function setReputationEnabled(bool enabled) external onlyOwner {
        reputationEnabled = enabled;
        emit ReputationEnabled(enabled);
    }

    /// @notice Select an operator using deterministic pseudo-randomness.
    /// @param jobId identifier of the job to route
    /// @return selected address of the chosen operator or address(0) if none
    function selectOperator(bytes32 jobId) external returns (address selected) {
        uint256 totalWeight;
        uint256 len = operators.length;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (!isOperator[op]) continue;
            uint256 weight;
            if (reputationEnabled && address(reputationEngine) != address(0)) {
                weight = reputationEngine.getOperatorScore(op);
            } else {
                weight = stakeManager.stakeOf(op, IStakeManager.Role.Platform);
            }
            if (weight == 0) continue;
            totalWeight += weight;
        }

        if (totalWeight == 0) {
            emit OperatorSelected(jobId, address(0));
            return address(0);
        }

        uint256 rand =
            uint256(keccak256(abi.encode(block.timestamp, jobId))) % totalWeight;
        uint256 cumulative;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (!isOperator[op]) continue;
            uint256 weight;
            if (reputationEnabled && address(reputationEngine) != address(0)) {
                weight = reputationEngine.getOperatorScore(op);
            } else {
                weight = stakeManager.stakeOf(op, IStakeManager.Role.Platform);
            }
            if (weight == 0) continue;
            cumulative += weight;
            if (rand < cumulative) {
                selected = op;
                break;
            }
        }

        emit OperatorSelected(jobId, selected);
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("RoutingModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("RoutingModule: no ether");
    }
}

