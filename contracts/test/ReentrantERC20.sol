// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IReentrantCaller {
    function reenter() external;
}

/// @dev ERC20 token that attempts to reenter the caller during transfers.
contract ReentrantERC20 is ERC20 {
    IReentrantCaller public caller;
    bool public attack;

    constructor() ERC20("Reentrant", "RENT") {}

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

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(from, to, amount);
        if (attack && address(caller) != address(0)) {
            attack = false;
            caller.reenter();
        }
        return ok;
    }
}
