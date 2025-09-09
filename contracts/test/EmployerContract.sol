// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IJobRegistry} from "../v2/interfaces/IJobRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title EmployerContract
/// @notice Minimal helper contract to act as a job employer in tests.
contract EmployerContract {
    /// @notice Approve a spender for a given ERC20 token.
    function approveToken(address token, address spender, uint256 amount) external {
        IERC20(token).approve(spender, amount);
    }

    /// @notice Create a job in the JobRegistry.
    function createJob(
        address registry,
        uint256 reward,
        uint64 deadline,
        bytes32 specHash,
        string calldata uri
    ) external returns (uint256 jobId) {
        jobId = IJobRegistry(registry).createJob(reward, deadline, specHash, uri);
    }

    /// @notice Finalize a job via the JobRegistry.
    function finalizeJob(address registry, uint256 jobId) external {
        IJobRegistry(registry).finalize(jobId);
    }
}
