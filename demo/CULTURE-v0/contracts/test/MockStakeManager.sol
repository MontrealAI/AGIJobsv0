// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IStakeManager} from "../SelfPlayArena.sol";

contract MockStakeManager is IStakeManager {
    struct SlashCall {
        address validator;
        uint256 amount;
        address recipient;
    }

    SlashCall[] internal _slashCalls;

    function slash(address user, uint256 amount, address recipient) external override {
        _slashCalls.push(SlashCall({validator: user, amount: amount, recipient: recipient}));
    }

    function callsLength() external view returns (uint256) {
        return _slashCalls.length;
    }

    function slashCalls(uint256 index) external view returns (SlashCall memory) {
        return _slashCalls[index];
    }
}

