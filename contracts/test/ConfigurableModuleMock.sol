// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ConfigurableModuleMock
/// @notice Minimal harness used by the OwnerConfigurator test-suite to ensure
///         setter calls are correctly forwarded and observable. The contract
///         purposely mirrors the simple pattern used by production modules:
///         state mutation behind an authorization boundary and structured
///         events for the owner console.
contract ConfigurableModuleMock {
    uint256 private _value;
    address public lastCaller;
    uint256 public totalReceived;

    error ValueMismatch(uint256 expected, uint256 actual);
    error MissingValue(uint256 expected, uint256 actual);

    event ValueChanged(uint256 previousValue, uint256 newValue, address caller);
    event ValueChangedWithDeposit(
        uint256 previousValue,
        uint256 newValue,
        uint256 valueReceived,
        address caller
    );

    function setValue(uint256 newValue) external {
        _setValue(newValue);
    }

    function setValueGuarded(uint256 newValue, uint256 expectedCurrent) external {
        if (_value != expectedCurrent) {
            revert ValueMismatch(expectedCurrent, _value);
        }

        _setValue(newValue);
    }

    function setValueWithDeposit(uint256 newValue, uint256 minimumValue) external payable {
        if (msg.value < minimumValue) {
            revert MissingValue(minimumValue, msg.value);
        }

        uint256 previousValue = _value;
        _setValue(newValue);
        totalReceived += msg.value;

        emit ValueChangedWithDeposit(previousValue, newValue, msg.value, msg.sender);
    }

    function currentValue() external view returns (uint256) {
        return _value;
    }

    function _setValue(uint256 newValue) internal {
        uint256 previousValue = _value;
        _value = newValue;
        lastCaller = msg.sender;

        emit ValueChanged(previousValue, newValue, msg.sender);
    }
}
