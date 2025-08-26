// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IVRF} from "../interfaces/IVRF.sol";

/// @notice Minimal VRF mock used for testing randomness flows.
contract VRFMock is IVRF {
    uint256 public nextRequestId = 1;
    mapping(uint256 => address) public consumers;
    bool public fail;

    function setFail(bool value) external {
        fail = value;
    }

    function requestRandomWords() external override returns (uint256 requestId) {
        require(!fail, "fail");
        requestId = nextRequestId++;
        consumers[requestId] = msg.sender;
    }

    function fulfill(uint256 requestId, uint256 randomness) external {
        address consumer = consumers[requestId];
        require(consumer != address(0), "unknown request");
        (bool ok, ) = consumer.call(
            abi.encodeWithSignature(
                "fulfillRandomWords(uint256,uint256)",
                requestId,
                randomness
            )
        );
        require(ok, "callback failed");
    }
}
