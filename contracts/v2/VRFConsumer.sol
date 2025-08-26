// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IVRFConsumer} from "./interfaces/IVRFConsumer.sol";
import {IVRF} from "./interfaces/IVRF.sol";
import {ValidationModule} from "./ValidationModule.sol";

/// @title VRFConsumer
/// @notice Bridges Chainlink VRF responses to the ValidationModule.
/// @dev This contract wraps the Chainlink VRF coordinator. The ValidationModule
///      requests randomness via {requestRandomWords}. When fulfilled, the random
///      word is forwarded to the ValidationModule's {fulfillRandomWords}.
contract VRFConsumer is IVRFConsumer, Ownable {
    IVRF public immutable coordinator;
    ValidationModule public validation;

    bytes32 public keyHash;
    uint64 public subId;
    uint16 public requestConfirmations;
    uint32 public callbackGasLimit;
    uint32 public numWords = 1;

    constructor(
        IVRF _coordinator,
        ValidationModule _validation,
        bytes32 _keyHash,
        uint64 _subId,
        uint16 _requestConfirmations,
        uint32 _callbackGasLimit
    ) Ownable(msg.sender) {
        coordinator = _coordinator;
        validation = _validation;
        keyHash = _keyHash;
        subId = _subId;
        requestConfirmations = _requestConfirmations;
        callbackGasLimit = _callbackGasLimit;
    }

    /// @notice Update the validation module address.
    function setValidationModule(ValidationModule module) external onlyOwner {
        validation = module;
    }

    /// @notice Update VRF request parameters.
    function setRequestConfig(
        bytes32 _keyHash,
        uint64 _subId,
        uint16 _requestConfirmations,
        uint32 _callbackGasLimit
    ) external onlyOwner {
        keyHash = _keyHash;
        subId = _subId;
        requestConfirmations = _requestConfirmations;
        callbackGasLimit = _callbackGasLimit;
    }

    /// @inheritdoc IVRFConsumer
    function requestRandomWords() external override returns (uint256 requestId) {
        require(msg.sender == address(validation), "only validation");
        requestId = coordinator.requestRandomWords(
            keyHash,
            subId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
    }

    /// @notice Called by the VRF coordinator with the randomness result.
    function rawFulfillRandomWords(uint256 requestId, uint256[] memory randomWords) external {
        require(msg.sender == address(coordinator), "only coord");
        validation.fulfillRandomWords(requestId, randomWords[0]);
    }
}
