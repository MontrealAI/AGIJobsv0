// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IIdentityRegistry} from "../CultureRegistry.sol";

contract MockIdentityRegistry is IIdentityRegistry {
    mapping(bytes32 => mapping(address => bool)) private _roles;

    function setRole(bytes32 role, address account, bool allowed) external {
        _roles[role][account] = allowed;
    }

    function hasRole(bytes32 role, address account) external view override returns (bool) {
        return _roles[role][account];
    }
}
