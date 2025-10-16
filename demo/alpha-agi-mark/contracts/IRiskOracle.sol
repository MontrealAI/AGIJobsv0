// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IRiskOracle {
    function seedValidated() external view returns (bool);

    function totalValidators() external view returns (uint256);

    function approvalsRequired() external view returns (uint256);

    function approvalsCount() external view returns (uint256);
}
