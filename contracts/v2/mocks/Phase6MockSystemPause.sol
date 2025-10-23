// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Lightweight harness capturing forwarded pause invocations during tests.
contract Phase6MockSystemPause {
    bool public paused;
    bytes public lastPayload;
    uint256 public callCount;

    event ForwardReceived(bytes data);

    function pauseAll() external {
        paused = true;
        callCount += 1;
        lastPayload = msg.data;
        emit ForwardReceived(msg.data);
    }

    function control(bytes calldata data) external {
        callCount += 1;
        lastPayload = data;
        emit ForwardReceived(data);
    }
}
