// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IReentrantCaller {
    function reenter() external;
}

/// @dev ERC20 token with ERC777-style send hook that attempts to reenter the caller.
contract ReentrantERC777 is ERC20 {
    IReentrantCaller public caller;
    bool public attack;

    constructor() ERC20("Reentrant777", "R777") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setCaller(address _caller) external {
        caller = IReentrantCaller(_caller);
    }

    function setAttack(bool _attack) external {
        attack = _attack;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (attack && address(caller) != address(0)) {
            attack = false;
            caller.reenter();
        }
        super._update(from, to, value);
    }
}

