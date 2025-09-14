// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract MockHamiltonianFeed {
    int256 public h;

    function setHamiltonian(int256 _h) external {
        h = _h;
    }

    function currentHamiltonian() external view returns (int256) {
        return h;
    }
}

