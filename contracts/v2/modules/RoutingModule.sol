// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";

/// @title RoutingModule
/// @notice Selects platform operators for jobs weighted by stake and optional reputation.
contract RoutingModule is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;
    bool public reputationEnabled;

    uint256 public minStake;
    mapping(address => bool) public blacklist;

    address[] public operators;
    mapping(address => bool) public isOperator;

    mapping(bytes32 => bytes32) public commits;
    mapping(bytes32 => uint256) public commitBlock;

    uint256 internal constant REVEAL_WINDOW = 256;

    event OperatorRegistered(address indexed operator);
    event OperatorDeregistered(address indexed operator);
    event OperatorSelected(bytes32 indexed jobId, address indexed operator);
    event SelectionCommitted(bytes32 indexed jobId, bytes32 commitHash);
    event ReputationEngineUpdated(address indexed engine);
    event ReputationEnabled(bool enabled);
    event StakeManagerUpdated(address indexed stakeManager);
    event MinStakeUpdated(uint256 stake);
    event Blacklisted(address indexed operator, bool status);
    event CommitCleared(bytes32 indexed jobId, bytes32 commitHash, address indexed caller);
    event StaleReveal(bytes32 indexed jobId, bytes32 commitHash);

    constructor(
        IStakeManager _stakeManager,
        IReputationEngine _reputationEngine
    ) Ownable(msg.sender) {
        stakeManager = _stakeManager;
        reputationEngine = _reputationEngine;
    }

    /// @notice Register the caller as an operator.
    function register() external {
        require(!isOperator[msg.sender], "registered");
        require(!blacklist[msg.sender], "blacklisted");
        uint256 stake = stakeManager.stakeOf(msg.sender, IStakeManager.Role.Platform);
        require(stake >= minStake, "stake");
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

    /// @notice update StakeManager contract
    function setStakeManager(IStakeManager manager) external onlyOwner {
        stakeManager = manager;
        emit StakeManagerUpdated(address(manager));
    }

    /// @notice update minimum stake required for operator registration
    function setMinStake(uint256 stake) external onlyOwner {
        minStake = stake;
        emit MinStakeUpdated(stake);
    }

    /// @notice update blacklist status for an operator
    function setBlacklist(address operator, bool status) external onlyOwner {
        blacklist[operator] = status;
        emit Blacklisted(operator, status);
    }

    function commit(bytes32 jobId, bytes32 commitHash) external {
        bytes32 existing = commits[jobId];
        if (existing != bytes32(0)) {
            require(_isCommitExpired(jobId), "committed");
            _clearCommit(jobId);
        }
        commits[jobId] = commitHash;
        commitBlock[jobId] = block.number;
        emit SelectionCommitted(jobId, commitHash);
    }

    /// @notice Select an operator using deterministic pseudo-randomness.
    /// @param jobId identifier of the job to route
    /// @param seed revealed randomness seed
    /// @return selected address of the chosen operator or address(0) if none
    function selectOperator(bytes32 jobId, bytes32 seed) external returns (address selected) {
        bytes32 commitHash = commits[jobId];
        require(commitHash != bytes32(0), "no commit");

        uint256 committed = commitBlock[jobId];
        if (_isCommitExpired(committed)) {
            emit StaleReveal(jobId, commitHash);
            _clearCommit(jobId);
            return address(0);
        }

        require(keccak256(abi.encode(seed)) == commitHash, "seed");
        require(block.number > committed + 1, "reveal");
        bytes32 bh = blockhash(committed + 1);
        if (bh == bytes32(0)) {
            emit StaleReveal(jobId, commitHash);
            _clearCommit(jobId);
            return address(0);
        }

        uint256 totalWeight;
        uint256 len = operators.length;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (!isOperator[op] || blacklist[op]) continue;
            uint256 stake = stakeManager.stakeOf(op, IStakeManager.Role.Platform);
            if (stake == 0) continue;
            uint256 rep = 1;
            if (reputationEnabled && address(reputationEngine) != address(0)) {
                rep = reputationEngine.getReputation(op);
                if (rep == 0) continue;
            }
            totalWeight += stake * rep;
        }

        if (totalWeight == 0) {
            emit OperatorSelected(jobId, address(0));
            _clearCommit(jobId);
            return address(0);
        }

        uint256 rand = uint256(keccak256(abi.encode(bh, seed))) % totalWeight;
        uint256 cumulative;
        for (uint256 i; i < len; i++) {
            address op = operators[i];
            if (!isOperator[op] || blacklist[op]) continue;
            uint256 stake = stakeManager.stakeOf(op, IStakeManager.Role.Platform);
            if (stake == 0) continue;
            uint256 rep = 1;
            if (reputationEnabled && address(reputationEngine) != address(0)) {
                rep = reputationEngine.getReputation(op);
                if (rep == 0) continue;
            }
            uint256 weight = stake * rep;
            cumulative += weight;
            if (rand < cumulative) {
                selected = op;
                break;
            }
        }

        emit OperatorSelected(jobId, selected);
        _clearCommit(jobId);
    }

    function clearExpiredCommit(bytes32 jobId) external onlyOwner {
        bytes32 commitHash = commits[jobId];
        require(commitHash != bytes32(0), "no commit");
        require(_isCommitExpired(jobId), "active");
        _clearCommit(jobId);
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

    function _isCommitExpired(bytes32 jobId) internal view returns (bool) {
        return _isCommitExpired(commitBlock[jobId]);
    }

    function _isCommitExpired(uint256 committedBlock) internal view returns (bool) {
        return committedBlock != 0 && block.number > committedBlock + REVEAL_WINDOW;
    }

    function _clearCommit(bytes32 jobId) internal {
        bytes32 existing = commits[jobId];
        if (existing == bytes32(0)) return;
        delete commits[jobId];
        delete commitBlock[jobId];
        emit CommitCleared(jobId, existing, msg.sender);
    }
}

