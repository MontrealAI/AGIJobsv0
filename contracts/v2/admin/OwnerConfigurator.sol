// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @title OwnerConfigurator
/// @notice Minimal facade contract that allows the owner (Safe or EOA) to batch
///         configuration calls across the AGI Jobs v2 module surface area. This
///         contract is intentionally lightweight until the per-module adapters
///         are wired in. It focuses on safely forwarding calls and emitting an
///         auditable change log for the owner console and subgraph.
contract OwnerConfigurator is Ownable2Step {
    using Address for address;

    /// @notice Emitted whenever the owner requests a parameter mutation via
    ///         this configurator. `module` and `parameter` act as indexed
    ///         tags for downstream analytics while the raw `oldValue` and
    ///         `newValue` bytes capture the semantic payload supplied by the
    ///         owner interface.
    event ParameterUpdated(
        bytes32 indexed module,
        bytes32 indexed parameter,
        bytes oldValue,
        bytes newValue,
        address indexed actor
    );

    error OwnerConfigurator__ZeroTarget();

    /// @notice Deploys the configurator and optionally re-assigns ownership to
    ///         a Safe or administrative EOA. Ownership can later be migrated
    ///         through the standard `transferOwnership` flow.
    /// @param initialOwner The owner address that should ultimately control
    ///        configuration. Passing `address(0)` defaults ownership to the
    ///        deployer to simplify local testing.
    constructor(address initialOwner)
        Ownable(initialOwner == address(0) ? _msgSender() : initialOwner)
    {}

    /// @notice Executes an owner-authorized configuration call on a target
    ///         contract and emits a structured event describing the change.
    /// @dev The owner console is responsible for populating `oldValue` and
    ///      `newValue` with the UI-sourced values. Future iterations will
    ///      perform on-chain reads to enforce idempotency, but this scaffolding
    ///      allows integration work to begin without blocking.
    /// @param target The contract that exposes the setter.
    /// @param callData ABI-encoded calldata for the setter.
    /// @param moduleKey Module identifier (e.g., keccak256("JOB_REGISTRY")).
    /// @param parameterKey Parameter identifier (e.g., keccak256("SET_COMMIT_WINDOW")).
    /// @param oldValue Bytes representation of the previous value (optional).
    /// @param newValue Bytes representation of the desired value.
    /// @return returnData Raw returndata from the executed call.
    function configure(
        address target,
        bytes calldata callData,
        bytes32 moduleKey,
        bytes32 parameterKey,
        bytes calldata oldValue,
        bytes calldata newValue
    ) external onlyOwner returns (bytes memory returnData) {
        if (target == address(0)) {
            revert OwnerConfigurator__ZeroTarget();
        }

        returnData = target.functionCall(callData);
        emit ParameterUpdated(moduleKey, parameterKey, oldValue, newValue, _msgSender());
    }
}
