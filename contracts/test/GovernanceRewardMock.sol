// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract GovernanceRewardMock {
    address[] private _lastVoters;
    event Recorded(address[] voters);

    function recordVoters(address[] calldata voters) external {
        _lastVoters = voters;
        emit Recorded(voters);
    }

    function getLastVoters() external view returns (address[] memory) {
        return _lastVoters;
    }
}

