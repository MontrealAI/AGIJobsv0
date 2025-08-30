// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "../interfaces/IStakeManager.sol";
import {IReputationEngine} from "../interfaces/IReputationEngine.sol";
import {TOKEN_SCALE} from "../Constants.sol";

/// @title DiscoveryModule
/// @notice Ranks registered platforms based on operator scores combining stake and reputation
contract DiscoveryModule is Ownable {
    /// @notice Module version for compatibility checks.
    uint256 public constant version = 2;

    IStakeManager public stakeManager;
    IReputationEngine public reputationEngine;

    uint256 public constant DEFAULT_MIN_STAKE = TOKEN_SCALE;

    uint256 public minStake;

    address[] public platforms;
    mapping(address => bool) public isPlatform;

    event PlatformRegistered(address indexed operator);
    event PlatformDeregistered(address indexed operator);
    event MinStakeUpdated(uint256 minStake);
    event StakeManagerUpdated(address indexed stakeManager);
    event ReputationEngineUpdated(address indexed reputationEngine);

    constructor(
        IStakeManager _stakeManager,
        IReputationEngine _reputationEngine,
        uint256 _minStake
    ) Ownable(msg.sender) {
        stakeManager = _stakeManager;
        if (address(_stakeManager) != address(0)) {
            emit StakeManagerUpdated(address(_stakeManager));
        }
        reputationEngine = _reputationEngine;
        if (address(_reputationEngine) != address(0)) {
            emit ReputationEngineUpdated(address(_reputationEngine));
        }
        minStake = _minStake == 0 ? DEFAULT_MIN_STAKE : _minStake;
        emit MinStakeUpdated(minStake);
    }

    /// @notice Register a platform if it meets the minimum stake requirement
    function registerPlatform(address operator) external {
        require(!isPlatform[operator], "registered");
        require(!reputationEngine.isBlacklisted(operator), "blacklisted");
        uint256 stake = stakeManager.stakeOf(operator, IStakeManager.Role.Platform);
        require(stake >= minStake, "stake too low");
        isPlatform[operator] = true;
        platforms.push(operator);
        emit PlatformRegistered(operator);
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

    /// @notice Deregister a platform
    function deregisterPlatform(address operator) external onlyOwner {
        if (!isPlatform[operator]) return;
        isPlatform[operator] = false;
        uint256 len = platforms.length;
        for (uint256 i; i < len; i++) {
            if (platforms[i] == operator) {
                platforms[i] = platforms[len - 1];
                platforms.pop();
                break;
            }
        }
        emit PlatformDeregistered(operator);
    }

    /// @notice List platforms ranked by routing score with pagination
    /// @param offset Starting index in the sorted list
    /// @param limit Maximum number of platforms to return
    function getPlatforms(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        uint256 len = platforms.length;
        address[] memory addrs = new address[](len);
        uint256[] memory scores = new uint256[](len);
        uint256 count;

        for (uint256 i = 0; i < len; i++) {
            address p = platforms[i];
            if (!isPlatform[p]) continue;
            if (reputationEngine.isBlacklisted(p)) continue;
            uint256 stake = stakeManager.stakeOf(p, IStakeManager.Role.Platform);
            if (stake < minStake) continue;
            uint256 rep = reputationEngine.getReputation(p);
            if (rep == 0) continue;
            addrs[count] = p;
            scores[count] = stake * rep;
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

        if (offset >= count) {
            return new address[](0);
        }
        uint256 end = offset + limit;
        if (end > count) end = count;
        uint256 size = end - offset;
        address[] memory result = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            result[i] = addrs[offset + i];
        }
        return result;
    }

    /// @notice Update minimum stake requirement for registration and ranking
    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
        emit MinStakeUpdated(_minStake);
    }

    /// @notice Update StakeManager address
    function setStakeManager(IStakeManager _stakeManager) external onlyOwner {
        stakeManager = _stakeManager;
        emit StakeManagerUpdated(address(_stakeManager));
    }

    /// @notice Update ReputationEngine address
    function setReputationEngine(IReputationEngine _reputationEngine) external onlyOwner {
        reputationEngine = _reputationEngine;
        emit ReputationEngineUpdated(address(_reputationEngine));
    }

    /// @notice Confirms the contract and its owner can never incur tax liability.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to keep the contract tax neutral.
    receive() external payable {
        revert("DiscoveryModule: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("DiscoveryModule: no ether");
    }
}

