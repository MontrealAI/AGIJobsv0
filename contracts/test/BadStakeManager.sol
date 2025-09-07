// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AGIALPHA} from "../v2/Constants.sol";

/// @notice Stake manager mock with outdated version but canonical token.
contract BadStakeManager {
    uint256 public constant version = 1;

    function token() external pure returns (IERC20) {
        return IERC20(AGIALPHA);
    }
}

