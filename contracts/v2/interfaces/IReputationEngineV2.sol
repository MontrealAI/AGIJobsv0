// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IReputationEngineV2 {
    function update(address user, int256 energyDelta) external;
}
