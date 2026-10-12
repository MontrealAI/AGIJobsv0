// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockBurnableAGI is ERC20 {
    bool public failTransferFrom;
    bool public failBurnFrom;

    constructor() ERC20("Mock AGIALPHA", "mAGI") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFailTransferFrom(bool value) external {
        failTransferFrom = value;
    }

    function setFailBurnFrom(bool value) external {
        failBurnFrom = value;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (failTransferFrom) return false;
        return super.transferFrom(from, to, amount);
    }

    function burnFrom(address account, uint256 amount) external {
        if (failBurnFrom) revert("BURN_FAILED");
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
    }
}
