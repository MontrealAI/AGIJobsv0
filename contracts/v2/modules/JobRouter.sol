// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";

/// @title JobRouter
/// @notice Routes jobs to registered platforms based on stake and reputation weighting
contract JobRouter is Ownable {
    IStakeManager public immutable stakeManager;
    IReputationEngine public immutable reputationEngine;

    /// @notice minimum stake required for a platform to register and remain eligible
    uint256 public minStake;

    /// @notice weighting factor applied to stake when computing selection weight
    /// @dev scaled by 1e18 for precision
    uint256 public stakeWeighting = 1e18;

    /// @dev list of registered platforms
    address[] public platforms;
    mapping(address => bool) public isPlatform;

    /// @dev records selected platform for a jobId
    mapping(bytes32 => address) public routingHistory;

    event PlatformRegistered(address indexed operator);
    event PlatformSelected(bytes32 indexed jobId, address indexed platform);
    event MinStakeUpdated(uint256 minStake);
    event StakeWeightingUpdated(uint256 stakeWeighting);

    constructor(IStakeManager _stakeManager, IReputationEngine _reputationEngine, address owner)
        Ownable(owner)
    {
        stakeManager = _stakeManager;
        reputationEngine = _reputationEngine;
    }

    /// @notice Register a platform if it meets the minimum stake requirement
    /// @param operator Address of the platform operator
    function registerPlatform(address operator) external {
        require(!isPlatform[operator], "registered");
        uint256 stake = stakeManager.stakeOf(operator, IStakeManager.Role.Agent);
        require(stake >= minStake, "stake too low");
        isPlatform[operator] = true;
        platforms.push(operator);
        emit PlatformRegistered(operator);
    }

    /// @notice Select a platform for a given jobId based on weighted randomness
    /// @param jobId Identifier of the job
    /// @return selected address of chosen platform or address(0) if none eligible
    function selectPlatform(bytes32 jobId) external returns (address selected) {
        uint256 len = platforms.length;
        uint256 totalWeight;
        uint256[] memory weights = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            address platform = platforms[i];
            uint256 stake = stakeManager.stakeOf(platform, IStakeManager.Role.Agent);
            uint256 rep = reputationEngine.reputation(platform);
            if (stake >= minStake && rep > 0) {
                uint256 weight = (stake * stakeWeighting / 1e18) * rep;
                weights[i] = weight;
                totalWeight += weight;
            }
        }

        if (totalWeight == 0) {
            emit PlatformSelected(jobId, address(0));
            routingHistory[jobId] = address(0);
            return address(0);
        }

        uint256 rand = uint256(keccak256(abi.encodePacked(jobId, block.prevrandao))) % totalWeight;
        uint256 cumulative;
        for (uint256 i = 0; i < len; i++) {
            uint256 weight = weights[i];
            if (weight == 0) continue;
            cumulative += weight;
            if (rand < cumulative) {
                selected = platforms[i];
                break;
            }
        }
        routingHistory[jobId] = selected;
        emit PlatformSelected(jobId, selected);
    }

    /// @notice Update minimum stake requirement
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    /// @notice Update stake weighting factor
    function setStakeWeighting(uint256 _stakeWeighting) external onlyOwner {
        stakeWeighting = _stakeWeighting;
        emit StakeWeightingUpdated(_stakeWeighting);
    }
}

