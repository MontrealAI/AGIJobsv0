// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title SystemPauseFailoverSpy
/// @notice Minimal module harness that tracks failover calls from {SystemPause}.
/// @dev Implements the subset of the ValidationModule interface used by SystemPause
///      so tests can assert that governance forwarding works end-to-end.
contract SystemPauseFailoverSpy {
    enum FailoverAction {
        None,
        ExtendReveal,
        EscalateDispute
    }

    error NotAuthorised();

    address private _owner;
    address private _pauserManager;
    address private _pauser;

    bool public paused;
    uint256 public lastJobId;
    FailoverAction public lastAction;
    uint64 public lastExtension;
    string public lastReason;
    uint256 public triggerCount;

    constructor(address initialOwner) {
        _owner = initialOwner;
    }

    function owner() external view returns (address) {
        return _owner;
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != _owner) revert NotAuthorised();
        _owner = newOwner;
    }

    function pauserManager() external view returns (address) {
        return _pauserManager;
    }

    function pauser() external view returns (address) {
        return _pauser;
    }

    function setPauserManager(address manager) external {
        if (msg.sender != _owner) revert NotAuthorised();
        _pauserManager = manager;
    }

    function setPauser(address newPauser) external {
        if (msg.sender != _owner && msg.sender != _pauserManager) {
            revert NotAuthorised();
        }
        _pauser = newPauser;
    }

    function pause() external {
        if (msg.sender != _pauser) revert NotAuthorised();
        paused = true;
    }

    function unpause() external {
        if (msg.sender != _pauser) revert NotAuthorised();
        paused = false;
    }

    function triggerFailover(
        uint256 jobId,
        FailoverAction action,
        uint64 extension,
        string calldata reason
    ) external {
        if (msg.sender != _owner) revert NotAuthorised();
        lastJobId = jobId;
        lastAction = action;
        lastExtension = extension;
        lastReason = reason;
        triggerCount += 1;
    }

    function lastFailover()
        external
        view
        returns (
            uint256 jobId,
            FailoverAction action,
            uint64 extension,
            string memory reason,
            uint256 count
        )
    {
        return (lastJobId, lastAction, lastExtension, lastReason, triggerCount);
    }
}
