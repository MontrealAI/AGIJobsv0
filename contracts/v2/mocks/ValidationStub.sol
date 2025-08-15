// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IValidationModule} from "../interfaces/IValidationModule.sol";

/// @notice Simple validation module stub returning a preset outcome.
contract ValidationStub is IValidationModule {
    bool public result;

    function setResult(bool _result) external {
        result = _result;
    }

    function selectValidators(uint256) external pure returns (address[] memory) {
        return new address[](0);
    }

    function commitValidation(
        uint256,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external {}

    function revealValidation(
        uint256,
        bool,
        bytes32,
        string calldata,
        bytes32[] calldata
    ) external {}

    function tally(uint256) external view returns (bool success) {
        return result;
    }

    function setCommitRevealWindows(uint256, uint256) external {}

    function setValidatorBounds(uint256, uint256) external {}

    function resetJobNonce(uint256) external {}
}

