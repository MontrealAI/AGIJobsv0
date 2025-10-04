// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable2Step} from "../utils/Ownable2Step.sol";
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
        Ownable2Step(initialOwner == address(0) ? _msgSender() : initialOwner)
    {}

    struct ConfigurationCall {
        address target;
        bytes callData;
        bytes32 moduleKey;
        bytes32 parameterKey;
        bytes oldValue;
        bytes newValue;
    }

    function _applyConfiguration(ConfigurationCall memory call)
        internal
        returns (bytes memory returnData)
    {
        if (call.target == address(0)) {
            revert OwnerConfigurator__ZeroTarget();
        }

        returnData = call.target.functionCall(call.callData);
        emit ParameterUpdated(
            call.moduleKey,
            call.parameterKey,
            call.oldValue,
            call.newValue,
            _msgSender()
        );
    }

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
        ConfigurationCall memory call = ConfigurationCall({
            target: target,
            callData: callData,
            moduleKey: moduleKey,
            parameterKey: parameterKey,
            oldValue: oldValue,
            newValue: newValue
        });

        returnData = _applyConfiguration(call);
    }

    function configureBatch(ConfigurationCall[] calldata calls)
        external
        onlyOwner
        returns (bytes[] memory returnData)
    {
        uint256 length = calls.length;
        returnData = new bytes[](length);

        for (uint256 i = 0; i < length; i++) {
            returnData[i] = _applyConfiguration(calls[i]);
        }
    }
}
