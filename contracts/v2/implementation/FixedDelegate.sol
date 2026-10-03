// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IFixedImplementation {
    function moduleId() external pure returns (bytes32);
}

/// @dev Contains no storage. Controllers keep their implementation addresses immutable.
abstract contract FixedDelegate {
    error InvalidImplementation(address implementation, bytes32 expectedId);

    function _checkedImplementation(address implementation, bytes32 expectedId) internal view returns (address) {
        if (implementation.code.length == 0) {
            revert InvalidImplementation(implementation, expectedId);
        }
        if (IFixedImplementation(implementation).moduleId() != expectedId) {
            revert InvalidImplementation(implementation, expectedId);
        }
        return implementation;
    }

    function _delegate(address implementation) internal {
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            let success := delegatecall(gas(), implementation, ptr, calldatasize(), 0, 0)
            returndatacopy(ptr, 0, returndatasize())
            switch success
            case 0 { revert(ptr, returndatasize()) }
            default { return(ptr, returndatasize()) }
        }
    }
}

/// @dev Prevents direct calls to implementation entry points; no storage slot is consumed.
abstract contract DelegateOnly {
    address private immutable _self = address(this);
    error DirectImplementationCall();

    function _checkDelegateCall() internal view {
        if (address(this) == _self) revert DirectImplementationCall();
    }

    modifier onlyDelegateCall() {
        _checkDelegateCall();
        _;
    }
}
