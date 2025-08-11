// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";

/// @title JobRouter
/// @notice Registers staked platform operators and selects one based on stake
///         weighted randomness.
/// @dev All stake amounts use the same 6 decimal precision as the
///      `StakeManager`.
contract JobRouter is Ownable {
    struct PlatformInfo {
        uint256 stake; // stake recorded at registration
        bool registered; // whether the operator is active
    }

    /// @notice contract managing platform stakes
    IStakeManager public stakeManager;

    /// @notice cumulative stake of all registered platforms
    uint256 public totalStake;

    /// @dev mapping of operator address to its stake and status
    mapping(address => PlatformInfo) public platforms;

    /// @dev list of all operators ever registered (for iteration)
    address[] public platformList;

    event Registered(address indexed operator, uint256 stake);
    event Deregistered(address indexed operator);
    event PlatformSelected(bytes32 indexed seed, address indexed operator);

    /// @param _stakeManager address of the stake manager contract
    /// @param deployer address to seed in the platform list with zero stake
    constructor(IStakeManager _stakeManager, address deployer) Ownable(deployer) {
        stakeManager = _stakeManager;
        // seed deployer as a non-selectable platform to avoid empty array checks
        platforms[deployer] = PlatformInfo({stake: 0, registered: true});
        platformList.push(deployer);
    }

    /// @notice Register the caller as a platform operator using their stake.
    /// @dev Requires the caller to have non-zero `Role.Platform` stake.
    function register() external {
        PlatformInfo storage p = platforms[msg.sender];
        require(!p.registered || p.stake == 0, "registered");

        uint256 stake = stakeManager.stakeOf(msg.sender, IStakeManager.Role.Platform);
        require(stake > 0, "stake");

        if (!p.registered) {
            platformList.push(msg.sender);
            p.registered = true;
        }
        p.stake = stake;
        totalStake += stake;

        emit Registered(msg.sender, stake);
    }

    /// @notice Deregister the caller and remove their stake from weighting.
    function deregister() external {
        PlatformInfo storage p = platforms[msg.sender];
        require(p.registered && p.stake > 0, "not registered");
        totalStake -= p.stake;
        p.stake = 0;
        p.registered = false;
        emit Deregistered(msg.sender);
    }

    /// @notice Compute routing weight for an operator as a fraction of total stake.
    /// @dev Returned value is scaled by 1e18 for precision.
    function routingWeight(address operator) public view returns (uint256) {
        if (totalStake == 0) return 0;
        PlatformInfo storage p = platforms[operator];
        if (!p.registered || p.stake == 0) return 0;
        return (p.stake * 1e18) / totalStake;
    }

    /// @notice Select a platform using blockhash/seed based randomness weighted by stake.
    /// @param seed external entropy provided by caller
    /// @return selected address of the chosen platform or address(0) if none
    function selectPlatform(bytes32 seed) external returns (address selected) {
        if (totalStake == 0) {
            emit PlatformSelected(seed, address(0));
            return address(0);
        }

        uint256 rand =
            uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), seed))) % totalStake;
        uint256 cumulative;
        uint256 len = platformList.length;
        for (uint256 i; i < len; i++) {
            PlatformInfo storage p = platforms[platformList[i]];
            if (!p.registered || p.stake == 0) continue;
            cumulative += p.stake;
            if (rand < cumulative) {
                selected = platformList[i];
                break;
            }
        }

        emit PlatformSelected(seed, selected);
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

