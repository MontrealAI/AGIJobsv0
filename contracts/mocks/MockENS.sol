// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

contract MockENS {
    function resolver(bytes32) external pure returns (address) {
        return address(0);
    }
}
