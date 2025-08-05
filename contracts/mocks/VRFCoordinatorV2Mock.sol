// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract VRFCoordinatorV2Mock {
    uint64 private currentSubId;
    uint256 private nextRequestId = 1;
    mapping(uint64 => address) public subOwners;
    mapping(uint256 => address) public requestConsumers;

    event SubscriptionCreated(uint64 indexed subId);
    event RandomWordsRequested(uint256 indexed requestId, address indexed requester);

    function createSubscription() external returns (uint64 subId) {
        currentSubId++;
        subOwners[currentSubId] = msg.sender;
        emit SubscriptionCreated(currentSubId);
        return currentSubId;
    }

    function fundSubscription(uint64, uint96) external {}

    function addConsumer(uint64, address) external {}

    function requestRandomWords(
        bytes32,
        uint64,
        uint16,
        uint32,
        uint32
    ) external returns (uint256 requestId) {
        requestId = nextRequestId++;
        requestConsumers[requestId] = msg.sender;
        emit RandomWordsRequested(requestId, msg.sender);
    }

    function fulfillRandomWords(uint256 requestId, address consumer) external {
        require(requestConsumers[requestId] == consumer, "unknown request");
        uint256[] memory words = new uint256[](1);
        words[0] = uint256(keccak256(abi.encode(requestId)));
        (bool ok, ) = consumer.call(
            abi.encodeWithSignature(
                "rawFulfillRandomWords(uint256,uint256[])",
                requestId,
                words
            )
        );
        require(ok, "fulfill failed");
        delete requestConsumers[requestId];
    }
}
