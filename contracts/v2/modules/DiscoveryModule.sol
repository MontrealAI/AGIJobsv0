// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";

/// @title DiscoveryModule
/// @notice Ranks registered platforms based on operator scores combining stake and reputation
contract DiscoveryModule is Ownable {
    IStakeManager public immutable stakeManager;
    IReputationEngine public immutable reputationEngine;

    uint256 public minStake;

    address[] public platforms;
    mapping(address => bool) public isPlatform;

    event PlatformRegistered(address indexed operator);
    event MinStakeUpdated(uint256 minStake);

    constructor(
        IStakeManager _stakeManager,
        IReputationEngine _reputationEngine,
        address owner
    ) Ownable(owner) {
        stakeManager = _stakeManager;
        reputationEngine = _reputationEngine;
    }

    /// @notice Register a platform if it meets the minimum stake requirement
    function registerPlatform(address operator) external {
        require(!isPlatform[operator], "registered");
        uint256 stake = stakeManager.stakeOf(operator, IStakeManager.Role.Agent);
        require(stake >= minStake, "stake too low");
        isPlatform[operator] = true;
        platforms.push(operator);
        emit PlatformRegistered(operator);
    }

    /// @notice Get top platforms ranked by operator score
    /// @param limit Maximum number of platforms to return
    function getTopPlatforms(uint256 limit)
        external
        view
        returns (address[] memory)
    {
        uint256 len = platforms.length;
        if (limit > len) limit = len;

        address[] memory addrs = new address[](len);
        uint256[] memory scores = new uint256[](len);
        uint256 count;

        for (uint256 i = 0; i < len; i++) {
            address p = platforms[i];
            uint256 stake = stakeManager.stakeOf(p, IStakeManager.Role.Agent);
            if (stake < minStake) continue;
            uint256 score = reputationEngine.getOperatorScore(p);
            if (score == 0) continue;
            addrs[count] = p;
            scores[count] = score;
            count++;
        }

        // selection sort descending by score
        for (uint256 i = 0; i < count; i++) {
            uint256 maxIndex = i;
            for (uint256 j = i + 1; j < count; j++) {
                if (scores[j] > scores[maxIndex]) {
                    maxIndex = j;
                }
            }
            if (maxIndex != i) {
                (scores[i], scores[maxIndex]) = (scores[maxIndex], scores[i]);
                (addrs[i], addrs[maxIndex]) = (addrs[maxIndex], addrs[i]);
            }
        }

        if (limit < count) {
            address[] memory result = new address[](limit);
            for (uint256 i = 0; i < limit; i++) {
                result[i] = addrs[i];
            }
            return result;
        }
        address[] memory all = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            all[i] = addrs[i];
        }
        return all;
    }

    /// @notice Update minimum stake requirement for registration and ranking
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }
}

