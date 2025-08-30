// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPlatformRegistry} from "../interfaces/IPlatformRegistry.sol";
import {TOKEN_SCALE} from "../Constants.sol";

/// @title JobRouter
/// @notice Routes jobs to registered platform operators based on stake and reputation scores.
///         Falls back to the deployer when no eligible operator exists.
contract JobRouter is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IPlatformRegistry public platformRegistry;

    /// @dev list of operators that have registered with the router
    address[] public platformList;
    /// @dev tracks whether an operator is active within the router
    mapping(address => bool) public registered;
    /// @dev tracks whether an operator has ever been added to `platformList`
    mapping(address => bool) public listed;
    /// @dev block after which an operator may re-register
    mapping(address => uint64) public cooldown;
    /// @dev number of blocks an operator must wait after deregistering
    uint64 public constant COOLDOWN_BLOCKS = 1;
    /// @dev addresses authorised to register operators on their behalf
    mapping(address => bool) public registrars;

    event Registered(address indexed operator);
    event Deregistered(address indexed operator);
    event PlatformSelected(bytes32 indexed seed, address indexed operator);
    event RegistrarUpdated(address indexed registrar, bool allowed);
    event ModulesUpdated(address indexed platformRegistry);

    constructor(IPlatformRegistry _platformRegistry) Ownable(msg.sender) {
        if (address(_platformRegistry) != address(0)) {
            platformRegistry = _platformRegistry;
            emit ModulesUpdated(address(_platformRegistry));
        }
    }

    /// @notice Register the caller for job routing.
    /// @dev Caller must already be registered within the PlatformRegistry.
    function register() external {
        require(block.number >= cooldown[msg.sender], "cooldown");
        require(!registered[msg.sender], "registered");
        require(platformRegistry.registered(msg.sender), "registry");
        registered[msg.sender] = true;
        if (!listed[msg.sender]) {
            platformList.push(msg.sender);
            listed[msg.sender] = true;
        }
        emit Registered(msg.sender);
    }

    /// @notice Register an operator on their behalf.
    /// @dev Caller must be the operator or an authorised registrar.
    function registerFor(address operator) external {
        if (msg.sender != operator) {
            require(registrars[msg.sender], "registrar");
        }
        require(block.number >= cooldown[operator], "cooldown");
        require(!registered[operator], "registered");
        require(platformRegistry.registered(operator), "registry");
        registered[operator] = true;
        if (!listed[operator]) {
            platformList.push(operator);
            listed[operator] = true;
        }
        emit Registered(operator);
    }

    /// @notice Deregister the caller from routing.
    function deregister() external {
        require(registered[msg.sender], "not registered");
        registered[msg.sender] = false;
        cooldown[msg.sender] = uint64(block.number + COOLDOWN_BLOCKS);
        emit Deregistered(msg.sender);
    }
    
    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Authorize or revoke a registrar address.
    function setRegistrar(address registrar, bool allowed) external onlyOwner {
        registrars[registrar] = allowed;
        emit RegistrarUpdated(registrar, allowed);
    }

    /// @notice Compute routing weight for an operator as a fraction of total score.
    /// @dev Returned value is scaled by TOKEN_SCALE for precision.
    function routingWeight(address operator) public view returns (uint256) {
        if (!registered[operator] || !platformRegistry.registered(operator)) return 0;
        uint256 score = platformRegistry.getScore(operator);
        if (score == 0) return 0;
        uint256 total;
        uint256 len = platformList.length;
        for (uint256 i; i < len; i++) {
            address p = platformList[i];
            if (!registered[p] || !platformRegistry.registered(p)) continue;
            uint256 s = platformRegistry.getScore(p);
            if (s == 0) continue;
            total += s;
        }
        if (total == 0) return 0;
        return (score * TOKEN_SCALE) / total;
    }

    /// @notice Select a platform using blockhash/seed based randomness weighted by score.
    /// @param seed external entropy provided by caller
    /// @return selected address of the chosen platform or owner() if none
    function selectPlatform(bytes32 seed) external returns (address selected) {
        uint256 len = platformList.length;
        uint256 total;
        for (uint256 i; i < len; i++) {
            address op = platformList[i];
            if (!registered[op]) continue;
            if (!platformRegistry.registered(op)) {
                registered[op] = false;
                continue;
            }
            uint256 score = platformRegistry.getScore(op);
            if (score == 0) continue;
            total += score;
        }
        if (total == 0) {
            selected = owner();
            emit PlatformSelected(seed, selected);
            return selected;
        }
        uint256 rand =
            uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), seed))) % total;
        uint256 cumulative;
        for (uint256 i; i < len; i++) {
            address op = platformList[i];
            if (!registered[op]) continue;
            if (!platformRegistry.registered(op)) {
                registered[op] = false;
                continue;
            }
            uint256 score = platformRegistry.getScore(op);
            if (score == 0) continue;
            cumulative += score;
            if (rand < cumulative) {
                selected = op;
                break;
            }
        }
        emit PlatformSelected(seed, selected);
    }

    /// @notice Update the PlatformRegistry address.
    function setPlatformRegistry(IPlatformRegistry registry) external onlyOwner {
        platformRegistry = registry;
        emit ModulesUpdated(address(registry));
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("JobRouter: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("JobRouter: no ether");
    }
}
