// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract Phase6EscalationBridgeMock {
    bytes public lastPayload;
    address public lastCaller;
    uint256 public callCount;

    event Escalation(bytes data, address caller);

    function execute(bytes calldata payload) external returns (bytes memory) {
        lastPayload = payload;
        lastCaller = msg.sender;
        callCount += 1;
        emit Escalation(payload, msg.sender);
        return payload;
    }
}
