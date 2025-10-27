// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SentinelGuardian
/// @notice Off-chain anomaly detectors escalate to this contract which in turn informs the constellation.
contract SentinelGuardian is Ownable {
    event SentinelConfigured(address indexed reporter, bool allowed);
    event AnomalyReported(bytes32 indexed domainId, string reason, uint256 severity, bytes context, address indexed reporter);

    mapping(address => bool) public authorisedReporters;

    address public immutable constellation;

    constructor(address constellation_, address owner_) Ownable(owner_) {
        require(constellation_ != address(0), "constellation required");
        constellation = constellation_;
    }

    function setReporter(address reporter, bool allowed) external onlyOwner {
        authorisedReporters[reporter] = allowed;
        emit SentinelConfigured(reporter, allowed);
    }

    function recordAlert(
        bytes32 domainId,
        string calldata reason,
        uint256 severity,
        bytes calldata context
    ) external {
        require(authorisedReporters[msg.sender], "reporter not authorised");
        emit AnomalyReported(domainId, reason, severity, context, msg.sender);
        (bool success, ) = constellation.call(
            abi.encodeWithSignature(
                "sentinelPause(bytes32,string,uint256,bytes)",
                domainId,
                reason,
                severity,
                context
            )
        );
        require(success, "pause failed");
    }
}
