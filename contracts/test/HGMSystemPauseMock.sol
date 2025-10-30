// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ISystemPauseControl} from "../v2/interfaces/ISystemPauseControl.sol";

contract HGMSystemPauseMock is ISystemPauseControl {
    address public globalPauser;
    uint256 public refreshCount;
    bool public paused;

    function setGlobalPauser(address pauser) external override {
        globalPauser = pauser;
    }

    function refreshPausers() external override {
        refreshCount += 1;
    }

    function pauseAll() external override {
        paused = true;
    }

    function unpauseAll() external override {
        paused = false;
    }
}
