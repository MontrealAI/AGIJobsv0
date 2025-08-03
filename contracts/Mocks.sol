// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract MockENS {
    function resolver(bytes32) external view returns (address) {
        return address(0);
    }
}

contract MockNameWrapper {
    function ownerOf(uint256) external view returns (address) {
        return address(0);
    }
}
