// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IPlatformRegistryFull} from "./interfaces/IPlatformRegistryFull.sol";
import {IJobRouter} from "./interfaces/IJobRouter.sol";

/// @title PlatformIncentives
/// @notice Helper that stakes $AGIALPHA for platform operators and registers them
///         for routing and fee sharing. The contract holds no tokens and remains
///         tax neutral.
contract PlatformIncentives is Ownable {
    IStakeManager public stakeManager;
    IPlatformRegistryFull public platformRegistry;
    IJobRouter public jobRouter;

    event ModulesUpdated(
        address indexed stakeManager,
        address indexed platformRegistry,
        address indexed jobRouter
    );

    constructor(
        IStakeManager _stakeManager,
        IPlatformRegistryFull _platformRegistry,
        IJobRouter _jobRouter,
        address owner
    ) Ownable(owner) {
        stakeManager = _stakeManager;
        platformRegistry = _platformRegistry;
        jobRouter = _jobRouter;
    }

    /// @notice Update module addresses.
    function setModules(
        IStakeManager _stakeManager,
        IPlatformRegistryFull _platformRegistry,
        IJobRouter _jobRouter
    ) external onlyOwner {
        stakeManager = _stakeManager;
        platformRegistry = _platformRegistry;
        jobRouter = _jobRouter;
        emit ModulesUpdated(address(_stakeManager), address(_platformRegistry), address(_jobRouter));
    }

    /// @notice Stake tokens and activate routing for the caller.
    /// @dev Caller must `approve` the StakeManager for `amount` tokens beforehand.
    ///      The main deployer may pass `amount = 0` to register without incentives.
    function stakeAndActivate(uint256 amount) external {
        if (amount > 0) {
            stakeManager.depositStakeFor(
                msg.sender,
                IStakeManager.Role.Platform,
                amount
            );
        } else {
            require(msg.sender == owner(), "amount");
        }
        platformRegistry.registerFor(msg.sender);
        jobRouter.registerFor(msg.sender);
    }

    /// @notice Confirms this contract and its owner remain tax neutral.
    function isTaxExempt() external pure returns (bool) {
        return true;
    }

    /// @dev Reject direct ETH transfers to preserve tax neutrality.
    receive() external payable {
        revert("PlatformIncentives: no ether");
    }

    /// @dev Reject calls with unexpected calldata or funds.
    fallback() external payable {
        revert("PlatformIncentives: no ether");
    }
}
