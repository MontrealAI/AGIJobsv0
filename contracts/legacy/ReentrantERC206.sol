// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// @deprecated Legacy contract for v0; use modules under contracts/v2 instead.

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IReentrantCaller {
    function reenter() external;
}

/// @dev ERC20 token with 18 decimals that attempts to reenter the caller during transfers.
contract ReentrantERC206 is ERC20 {
    IReentrantCaller public caller;
    bool public attack;

    constructor() ERC20("Reentrant18D", "R18D") {}

    function decimals() public pure override returns (uint8) {
        return 18;
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

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (attack && address(caller) != address(0)) {
            attack = false;
            caller.reenter();
        }
        return ok;
    }
}

