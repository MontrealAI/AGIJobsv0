// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStakeManager} from "./interfaces/IStakeManager.sol";
import {IPlatformRegistryFull} from "./interfaces/IPlatformRegistryFull.sol";
import {IJobRouter} from "./interfaces/IJobRouter.sol";
import {IJobRegistryAck} from "./interfaces/IJobRegistryAck.sol";

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
    event Activated(address indexed operator, uint256 amount);

    constructor(
        IStakeManager _stakeManager,
        IPlatformRegistryFull _platformRegistry,
        IJobRouter _jobRouter
    ) Ownable(msg.sender) {
        if (address(_stakeManager) != address(0)) {
            stakeManager = _stakeManager;
        }
        if (address(_platformRegistry) != address(0)) {
            platformRegistry = _platformRegistry;
        }
        if (address(_jobRouter) != address(0)) {
            jobRouter = _jobRouter;
        }
        if (
            address(_stakeManager) != address(0) ||
            address(_platformRegistry) != address(0) ||
            address(_jobRouter) != address(0)
        ) {
            emit ModulesUpdated(
                address(_stakeManager),
                address(_platformRegistry),
                address(_jobRouter)
            );
        }
    }

    // ---------------------------------------------------------------------
    // Owner setters (use Etherscan's "Write Contract" tab)
    // ---------------------------------------------------------------------

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

    /**
     * @notice Stake $AGIALPHA and activate routing for the caller.
     * @dev `amount` uses 6-decimal base units. Caller must `approve` the
     *      `StakeManager` for at least `amount` tokens beforehand. This helper
     *      does **not** acknowledge the tax policy; use
     *      `acknowledgeStakeAndActivate` if acknowledgement is required. The
     *      owner may pass `0` to register without incentives.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
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
        emit Activated(msg.sender, amount);
    }

    /**
     * @notice Acknowledge the tax policy, stake $AGIALPHA, and activate routing.
     * @dev `amount` uses 6-decimal base units. Caller must `approve` the
     *      `StakeManager` before calling. Owner may pass `0` to register without
     *      incentives. Calling this helper implicitly accepts the current tax
     *      policy via the linked JobRegistry.
     * @param amount Stake amount in $AGIALPHA with 6 decimals.
     */
    function acknowledgeStakeAndActivate(uint256 amount) external {
        address registry = stakeManager.jobRegistry();
        if (registry != address(0)) {
            IJobRegistryAck(registry).acknowledgeFor(msg.sender);
        }

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
        emit Activated(msg.sender, amount);
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
