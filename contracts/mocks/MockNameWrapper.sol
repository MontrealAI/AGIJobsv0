// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockNameWrapper {
    function ownerOf(uint256) external pure returns (address) {
        return address(0);
    }
}
